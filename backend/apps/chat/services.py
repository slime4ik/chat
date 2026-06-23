"""
Business logic shared between the REST views and the WebSocket consumer.

Keeping it here means a message created over HTTP and one created over the
socket go through exactly the same path (and broadcast identically).
"""
import os

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.core.files import File
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User

from .models import Attachment, Conversation, Membership, Message
from .serializers import MessageSerializer


def conv_group(conversation_id) -> str:
    return f"conv_{conversation_id}"


def user_group(user_id) -> str:
    return f"user_{user_id}"


def _kind_for_mime(mime: str) -> str:
    if mime.startswith("image/"):
        return Attachment.IMAGE
    if mime.startswith("video/"):
        return Attachment.VIDEO
    return Attachment.FILE


# --- Conversations ------------------------------------------------------
def _pair_key(a_id, b_id) -> str:
    """Order-independent key for a pair of users."""
    return "__".join(sorted([str(a_id), str(b_id)]))


def get_or_create_conversation(initiator: User, other: User):
    """
    Return (conversation, created) for the pair. Uniqueness is enforced by the
    `pair_key` unique constraint, so concurrent calls can't create duplicates.
    A freshly created conversation is `pending` until `other` accepts.
    """
    key = _pair_key(initiator.id, other.id)
    with transaction.atomic():
        conv, created = Conversation.objects.get_or_create(
            pair_key=key,
            defaults={"pending": True, "initiator": initiator},
        )
        if created:
            Membership.objects.create(conversation=conv, user=initiator)
            Membership.objects.create(conversation=conv, user=other)
    return conv, created


def add_contact_by_code(me: User, code: str):
    """Validate a friend code and open (or reuse) a dialog with its owner."""
    code = (code or "").strip().upper()
    if not code:
        raise ValueError("empty_code")

    try:
        owner = User.objects.get(friend_code=code)
    except User.DoesNotExist:
        raise LookupError("not_found")

    if owner.id == me.id:
        raise ValueError("self_code")

    return get_or_create_conversation(me, owner)


def accept_conversation(conversation: Conversation):
    if conversation.pending:
        conversation.pending = False
        conversation.last_activity = timezone.now()
        conversation.save(update_fields=["pending", "last_activity"])
    return conversation


def decline_conversation(conversation: Conversation):
    """Reject an invite: drop the conversation entirely."""
    conversation.delete()


# --- Messages -----------------------------------------------------------
def _attach_uploads(message: Message, upload_ids, owner: User):
    """Turn finished Upload rows into Attachments belonging to the message."""
    from apps.uploads.models import Upload  # local import avoids a cycle

    uploads = Upload.objects.filter(
        id__in=upload_ids, owner=owner, status=Upload.COMPLETED
    )
    for up in uploads:
        kind = _kind_for_mime(up.mime)
        att = Attachment(
            message=message,
            kind=kind,
            mime=up.mime,
            original_name=up.filename,
            size=up.total_size,
        )
        with up.file.open("rb") as fh:
            att.file.save(up.filename, File(fh), save=False)
        _enrich_attachment(att, kind)
        att.save()
        # The bytes now live under the attachment; drop the temp upload row.
        up.delete()


def _enrich_attachment(att: Attachment, kind: str):
    """Best-effort: dimensions + thumbnail for images. Never fatal."""
    if kind != Attachment.IMAGE:
        return
    try:
        from io import BytesIO

        from PIL import Image, ImageOps

        att.file.open("rb")
        img = Image.open(att.file)
        # Учитываем EXIF-ориентацию (фото с телефона), иначе превью лежит «боком»
        # и расходится с оригиналом, который браузер разворачивает сам.
        img = ImageOps.exif_transpose(img)
        att.width, att.height = img.size

        img.thumbnail((480, 480))
        buf = BytesIO()
        fmt = "PNG" if img.mode in ("RGBA", "P") else "JPEG"
        img.convert("RGB" if fmt == "JPEG" else img.mode).save(buf, format=fmt)
        buf.seek(0)
        name = f"thumb_{os.path.splitext(att.original_name)[0]}.{fmt.lower()}"
        att.thumbnail.save(name, File(buf), save=False)
    except Exception:
        pass
    finally:
        try:
            att.file.close()
        except Exception:
            pass


@transaction.atomic
def create_message(conversation: Conversation, sender: User, *, text="",
                   reply_to_id=None, upload_ids=None, client_id="") -> Message:
    text = (text or "").strip()
    upload_ids = upload_ids or []
    if not text and not upload_ids:
        raise ValueError("empty_message")
    if len(text) > settings.MAX_MESSAGE_LENGTH:
        raise ValueError("too_long")
    if conversation.pending:
        # Can't chat until the invite is accepted.
        raise ValueError("pending")

    reply_to = None
    if reply_to_id:
        reply_to = Message.objects.filter(
            id=reply_to_id, conversation=conversation
        ).first()

    message = Message.objects.create(
        conversation=conversation, sender=sender, text=text,
        reply_to=reply_to, client_id=str(client_id or "")[:64],
    )
    if upload_ids:
        _attach_uploads(message, upload_ids, sender)

    conversation.last_activity = timezone.now()
    conversation.save(update_fields=["last_activity"])

    # The sender has, by definition, read their own message.
    Membership.objects.filter(conversation=conversation, user=sender).update(
        last_read_at=message.created_at
    )
    return message


def mark_read(conversation: Conversation, user: User):
    now = timezone.now()
    Membership.objects.filter(conversation=conversation, user=user).update(
        last_read_at=now
    )
    return now


def edit_message(conversation: Conversation, user: User, message_id, text) -> Message:
    """Edit a message's text. Only its sender may edit, deleted ones can't be."""
    text = (text or "").strip()
    if not text:
        raise ValueError("empty_message")
    if len(text) > settings.MAX_MESSAGE_LENGTH:
        raise ValueError("too_long")
    with transaction.atomic():
        message = (
            Message.objects.select_for_update()
            .filter(id=message_id, conversation=conversation)
            .first()
        )
        if not message:
            raise LookupError("not_found")
        if message.sender_id != user.id:
            raise PermissionError("forbidden")
        if message.is_deleted:
            raise ValueError("deleted")
        if message.text != text:
            message.text = text
            message.edited_at = timezone.now()
            message.save(update_fields=["text", "edited_at"])
    return message


def delete_message(conversation: Conversation, user: User, message_id) -> Message:
    """
    Soft-delete a message. Only its sender may remove it.

    We keep the row (replies pointing at it stay intact) but flag it as deleted
    so the history endpoint and the sidebar preview stop returning it. The actual
    "vanish for both" is driven by the realtime `chat.delete` broadcast.
    """
    with transaction.atomic():
        message = (
            Message.objects.select_for_update()
            .filter(id=message_id, conversation=conversation)
            .first()
        )
        if not message:
            raise LookupError("not_found")
        if message.sender_id != user.id:
            raise PermissionError("forbidden")
        if not message.is_deleted:
            message.is_deleted = True
            message.text = ""
            message.save(update_fields=["is_deleted", "text"])
            # The bytes are no longer reachable from any visible message.
            message.attachments.all().delete()
    return message


# --- Broadcasting -------------------------------------------------------
def _serialize_for(message: Message, viewer: User):
    other = message.conversation.other_member(viewer)
    other_membership = message.conversation.memberships.filter(user=other).first()
    return MessageSerializer(
        message,
        context={
            "me_id": viewer.id,
            "other_last_read": other_membership.last_read_at if other_membership else None,
        },
    ).data


# Each "build_*" function does only sync work (DB + serialization) and returns
# a list of (group, payload) tuples. Actually pushing to the channel layer is
# done by `dispatch_sends`, which performs ALL group_sends inside a SINGLE event
# loop. This avoids the channels_redis "Future attached to a different loop"
# bug you hit when calling async_to_sync(group_send) repeatedly / from threads.

def build_new_message_sends(message: Message):
    """One personalised payload per participant (rendered from their POV)."""
    sends = []
    for membership in message.conversation.memberships.select_related("user"):
        viewer = membership.user
        payload = _serialize_for(message, viewer)
        sends.append((user_group(viewer.id),
                      {"type": "chat.message", "message": payload}))
    return sends


def build_edit_sends(message: Message):
    """Tell everyone in the dialog the message's text changed."""
    return [(
        conv_group(message.conversation_id),
        {
            "type": "chat.edit",
            "conversation_id": str(message.conversation_id),
            "message_id": str(message.id),
            "text": message.text,
            "edited_at": message.edited_at.isoformat() if message.edited_at else None,
        },
    )]


def build_delete_sends(conversation: Conversation, message_id):
    """Tell everyone in the dialog to drop this message from their view."""
    return [(
        conv_group(conversation.id),
        {
            "type": "chat.delete",
            "conversation_id": str(conversation.id),
            "message_id": str(message_id),
        },
    )]


def build_read_sends(conversation: Conversation, reader: User, read_at):
    return [(
        conv_group(conversation.id),
        {
            "type": "chat.read",
            "conversation_id": str(conversation.id),
            "reader_id": str(reader.id),
            "read_at": read_at.isoformat(),
        },
    )]


def build_typing_sends(conversation: Conversation, user: User, is_typing: bool):
    return [(
        conv_group(conversation.id),
        {
            "type": "chat.typing",
            "conversation_id": str(conversation.id),
            "user_id": str(user.id),
            "is_typing": is_typing,
        },
    )]


def build_presence_sends(user: User, is_online: bool):
    payload = {
        "type": "chat.presence",
        "user_id": str(user.id),
        "is_online": is_online,
        "last_seen": user.last_seen.isoformat(),
    }
    sends, seen = [], set()
    for membership in user.memberships.all():
        gid = conv_group(membership.conversation_id)
        if gid not in seen:
            seen.add(gid)
            sends.append((gid, payload))
    return sends


def build_chat_request_sends(conversation: Conversation):
    """Notify the invited user that someone wants to start a chat."""
    initiator = conversation.initiator
    invited = conversation.other_member(initiator)
    if not invited:
        return []
    return [(
        user_group(invited.id),
        {
            "type": "chat.request",
            "conversation_id": str(conversation.id),
            "from_id": str(initiator.id),
            "from_nickname": initiator.nickname,
        },
    )]


def build_conv_status_sends(conversation: Conversation, status: str):
    """Tell both participants the invite was accepted/declined."""
    sends = []
    for membership in conversation.memberships.select_related("user"):
        sends.append((
            user_group(membership.user_id),
            {
                "type": "chat.status",
                "status": status,  # "accepted" | "declined"
                "conversation_id": str(conversation.id),
            },
        ))
    return sends


def build_conv_status_sends_for_pair(conv_id, user_ids, status: str):
    """Variant used after a declined conversation is already deleted."""
    return [
        (user_group(uid), {"type": "chat.status", "status": status,
                           "conversation_id": str(conv_id)})
        for uid in user_ids
    ]


async def dispatch_sends(sends):
    """Push all (group, payload) pairs over the channel layer in one loop."""
    layer = get_channel_layer()
    for group, payload in sends:
        await layer.group_send(group, payload)


# --- Sync entry points (used by DRF views, which run in a sync context) ----
def broadcast_new_message(message: Message):
    async_to_sync(dispatch_sends)(build_new_message_sends(message))


def broadcast_read(conversation: Conversation, reader: User, read_at):
    async_to_sync(dispatch_sends)(build_read_sends(conversation, reader, read_at))


def broadcast_delete(conversation: Conversation, message_id):
    async_to_sync(dispatch_sends)(build_delete_sends(conversation, message_id))


def broadcast_edit(message: Message):
    async_to_sync(dispatch_sends)(build_edit_sends(message))


def broadcast_typing(conversation: Conversation, user: User, is_typing: bool):
    async_to_sync(dispatch_sends)(build_typing_sends(conversation, user, is_typing))


def broadcast_presence(user: User, is_online: bool):
    async_to_sync(dispatch_sends)(build_presence_sends(user, is_online))


def broadcast_chat_request(conversation: Conversation):
    async_to_sync(dispatch_sends)(build_chat_request_sends(conversation))


def broadcast_conv_status(conversation: Conversation, status: str):
    async_to_sync(dispatch_sends)(build_conv_status_sends(conversation, status))


def broadcast_conv_status_for_pair(conv_id, user_ids, status: str):
    async_to_sync(dispatch_sends)(
        build_conv_status_sends_for_pair(conv_id, user_ids, status)
    )
