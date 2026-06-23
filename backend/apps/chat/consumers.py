import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.db.models import F
from django.utils import timezone

from apps.accounts.models import User

from .models import Conversation, Membership
from .services import (
    build_new_message_sends,
    build_presence_sends,
    build_read_sends,
    build_typing_sends,
    conv_group,
    create_message,
    dispatch_sends,
    mark_read,
    user_group,
)


class ChatConsumer(AsyncWebsocketConsumer):
    """
    One socket per browser tab. Carries every realtime event for the user:
    new messages, read receipts, typing indicators and presence.
    """

    async def connect(self):
        self.user: User = self.scope.get("user")
        if not getattr(self.user, "is_authenticated", False):
            await self.close(code=4401)
            return

        await self.accept()

        # Personal channel (always receives messages addressed to this user).
        await self.channel_layer.group_add(user_group(self.user.id), self.channel_name)

        # Join every conversation group the user currently belongs to.
        self.conv_ids = await self._conversation_ids()
        for cid in self.conv_ids:
            await self.channel_layer.group_add(conv_group(cid), self.channel_name)

        became_online = await self._add_socket()
        if became_online:
            try:
                sends = await database_sync_to_async(build_presence_sends)(self.user, True)
                await dispatch_sends(sends)
            except Exception:
                pass  # never let a presence broadcast kill the connection

    async def disconnect(self, code):
        if not getattr(self, "user", None) or not getattr(self.user, "is_authenticated", False):
            return
        await self.channel_layer.group_discard(user_group(self.user.id), self.channel_name)
        for cid in getattr(self, "conv_ids", []):
            await self.channel_layer.group_discard(conv_group(cid), self.channel_name)

        went_offline = await self._remove_socket()
        if went_offline:
            try:
                sends = await database_sync_to_async(build_presence_sends)(self.user, False)
                await dispatch_sends(sends)
            except Exception:
                pass

    # --- inbound (client -> server) ------------------------------------
    async def receive(self, text_data=None, bytes_data=None):
        try:
            data = json.loads(text_data or "{}")
        except json.JSONDecodeError:
            return
        action = data.get("type")

        if action == "message":
            await self._handle_message(data)
        elif action == "read":
            await self._handle_read(data)
        elif action == "typing":
            await self._handle_typing(data)
        elif action == "subscribe":
            await self._handle_subscribe(data)
        elif action == "ping":
            await self._touch()
            await self.send(json.dumps({"type": "pong"}))

    async def _handle_message(self, data):
        conv = await self._get_conversation(data.get("conversation_id"))
        if not conv:
            return
        try:
            message = await database_sync_to_async(create_message)(
                conv, self.user,
                text=data.get("text", ""),
                reply_to_id=data.get("reply_to"),
                upload_ids=data.get("upload_ids", []),
                client_id=data.get("client_id", ""),
            )
        except ValueError as exc:
            # Tell the sender their optimistic message failed (length/pending/etc).
            await self.send(json.dumps({
                "type": "message_error",
                "client_id": data.get("client_id", ""),
                "reason": str(exc),
            }))
            return
        sends = await database_sync_to_async(build_new_message_sends)(message)
        await dispatch_sends(sends)

    async def _handle_read(self, data):
        conv = await self._get_conversation(data.get("conversation_id"))
        if not conv:
            return
        read_at = await database_sync_to_async(mark_read)(conv, self.user)
        sends = await database_sync_to_async(build_read_sends)(conv, self.user, read_at)
        await dispatch_sends(sends)

    async def _handle_typing(self, data):
        conv = await self._get_conversation(data.get("conversation_id"))
        if not conv:
            return
        sends = await database_sync_to_async(build_typing_sends)(
            conv, self.user, bool(data.get("is_typing"))
        )
        await dispatch_sends(sends)

    async def _handle_subscribe(self, data):
        """Join a conversation group created after the socket opened."""
        cid = data.get("conversation_id")
        conv = await self._get_conversation(cid)
        if conv and str(cid) not in [str(x) for x in self.conv_ids]:
            self.conv_ids.append(conv.id)
            await self.channel_layer.group_add(conv_group(conv.id), self.channel_name)

    # --- outbound (group -> client) ------------------------------------
    async def chat_message(self, event):
        await self.send(json.dumps({"type": "message", "message": event["message"]}))

    async def chat_read(self, event):
        await self.send(json.dumps({
            "type": "read",
            "conversation_id": event["conversation_id"],
            "reader_id": event["reader_id"],
            "read_at": event["read_at"],
        }))

    async def chat_typing(self, event):
        if event["user_id"] == str(self.user.id):
            return  # don't echo your own typing back
        await self.send(json.dumps({
            "type": "typing",
            "conversation_id": event["conversation_id"],
            "user_id": event["user_id"],
            "is_typing": event["is_typing"],
        }))

    async def chat_presence(self, event):
        await self.send(json.dumps({
            "type": "presence",
            "user_id": event["user_id"],
            "is_online": event["is_online"],
            "last_seen": event["last_seen"],
        }))

    async def chat_request(self, event):
        await self.send(json.dumps({
            "type": "chat_request",
            "conversation_id": event["conversation_id"],
            "from_id": event["from_id"],
            "from_nickname": event["from_nickname"],
        }))

    async def chat_status(self, event):
        await self.send(json.dumps({
            "type": "chat_status",
            "status": event["status"],
            "conversation_id": event["conversation_id"],
        }))

    # --- DB helpers -----------------------------------------------------
    @database_sync_to_async
    def _conversation_ids(self):
        return list(
            Membership.objects.filter(user=self.user)
            .values_list("conversation_id", flat=True)
        )

    @database_sync_to_async
    def _get_conversation(self, conversation_id):
        if not conversation_id:
            return None
        return (
            Conversation.objects.filter(
                id=conversation_id, memberships__user=self.user
            ).first()
        )

    @database_sync_to_async
    def _add_socket(self) -> bool:
        """Returns True if this is the first live socket (user came online)."""
        User.objects.filter(pk=self.user.pk).update(
            socket_count=F("socket_count") + 1, last_seen=timezone.now()
        )
        self.user.refresh_from_db(fields=["socket_count", "last_seen"])
        return self.user.socket_count == 1

    @database_sync_to_async
    def _remove_socket(self) -> bool:
        """Returns True if the last socket just closed (user went offline)."""
        User.objects.filter(pk=self.user.pk, socket_count__gt=0).update(
            socket_count=F("socket_count") - 1, last_seen=timezone.now()
        )
        self.user.refresh_from_db(fields=["socket_count", "last_seen"])
        return self.user.socket_count == 0

    @database_sync_to_async
    def _touch(self):
        User.objects.filter(pk=self.user.pk).update(last_seen=timezone.now())
