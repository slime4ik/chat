from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from .models import Conversation
from .serializers import ConversationSerializer, MessageSerializer
from .services import (
    accept_conversation,
    add_contact_by_code,
    broadcast_chat_request,
    broadcast_conv_status,
    broadcast_conv_status_for_pair,
    broadcast_delete,
    broadcast_edit,
    broadcast_new_message,
    broadcast_read,
    create_message,
    decline_conversation,
    delete_message,
    edit_message,
    mark_read,
)

PAGE_SIZE = 40


class AddContactThrottle(ScopedRateThrottle):
    scope = "add_contact"


@api_view(["GET"])
def conversation_list(request):
    """Active chats + the user's own outgoing (still-pending) invites.

    Incoming invites (where someone added *me*) are NOT here — they surface as
    confirmation requests via /api/requests/ and the realtime `chat_request`.
    """
    qs = (
        Conversation.objects.filter(memberships__user=request.user)
        .filter(Q(pending=False) | Q(initiator=request.user))
        .prefetch_related("memberships__user")
        .distinct()
    )
    data = ConversationSerializer(qs, many=True, context={"request": request}).data
    return Response(data)


@api_view(["GET"])
def request_list(request):
    """Pending invites addressed to me (I did not initiate)."""
    qs = (
        Conversation.objects.filter(memberships__user=request.user, pending=True)
        .exclude(initiator=request.user)
        .prefetch_related("memberships__user")
        .distinct()
    )
    data = ConversationSerializer(qs, many=True, context={"request": request}).data
    return Response(data)


@api_view(["POST"])
@throttle_classes([AddContactThrottle])
def add_contact(request):
    code = request.data.get("code", "")
    try:
        conv, created = add_contact_by_code(request.user, code)
    except LookupError:
        return Response({"detail": "Нет пользователя с таким кодом."},
                        status=status.HTTP_404_NOT_FOUND)
    except ValueError as exc:
        msg = {
            "self_code": "Нельзя добавить самого себя.",
            "empty_code": "Введите код.",
        }.get(str(exc), "Неверный код.")
        return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

    # Newly created invite -> ping the invited user for confirmation.
    if created and conv.pending:
        broadcast_chat_request(conv)

    data = ConversationSerializer(conv, context={"request": request}).data
    return Response(data, status=status.HTTP_201_CREATED)


def _get_membership_or_404(user, conversation_id):
    conv = get_object_or_404(Conversation, id=conversation_id)
    if not conv.memberships.filter(user=user).exists():
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Вы не участник этого диалога.")
    return conv


@api_view(["POST"])
def accept_request(request, conversation_id):
    conv = _get_membership_or_404(request.user, conversation_id)
    if conv.initiator_id == request.user.id:
        return Response({"detail": "Нельзя подтвердить свой же запрос."},
                        status=status.HTTP_400_BAD_REQUEST)
    accept_conversation(conv)
    broadcast_conv_status(conv, "accepted")
    data = ConversationSerializer(conv, context={"request": request}).data
    return Response(data)


@api_view(["POST"])
def decline_request(request, conversation_id):
    conv = _get_membership_or_404(request.user, conversation_id)
    member_ids = conv.member_ids()
    cid = str(conv.id)
    decline_conversation(conv)
    broadcast_conv_status_for_pair(cid, member_ids, "declined")
    return Response({"status": "declined"})


@api_view(["GET", "POST"])
def messages(request, conversation_id):
    conv = _get_membership_or_404(request.user, conversation_id)

    if request.method == "GET":
        # Deleted messages stay in history as a "message removed" tombstone,
        # so we still return them (just stripped of their content server-side).
        qs = conv.messages.select_related("sender", "reply_to__sender") \
            .prefetch_related("attachments")
        before = request.query_params.get("before")
        after = request.query_params.get("after")
        if before:
            qs = qs.filter(created_at__lt=before)
        if after:
            # Catch-up polling: only messages newer than what the client has.
            qs = qs.filter(created_at__gt=after)
            page = list(qs.order_by("created_at")[:200])
        else:
            page = list(qs.order_by("-created_at")[:PAGE_SIZE])
            page.reverse()  # chronological for the client

        other = conv.other_member(request.user)
        other_membership = conv.memberships.filter(user=other).first()
        ctx = {
            "request": request,
            "me_id": request.user.id,
            "other_last_read": other_membership.last_read_at if other_membership else None,
        }
        return Response({
            "results": MessageSerializer(page, many=True, context=ctx).data,
            "has_more": (not after) and len(page) == PAGE_SIZE,
        })

    # POST -> send a message
    try:
        message = create_message(
            conv,
            request.user,
            text=request.data.get("text", ""),
            reply_to_id=request.data.get("reply_to"),
            upload_ids=request.data.get("upload_ids", []),
            client_id=request.data.get("client_id", ""),
        )
    except ValueError as exc:
        msg = {
            "empty_message": "Сообщение пустое.",
            "too_long": f"Слишком длинное сообщение (макс. {settings.MAX_MESSAGE_LENGTH}).",
            "pending": "Чат ещё не подтверждён собеседником.",
        }.get(str(exc), "Не удалось отправить сообщение.")
        return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

    broadcast_new_message(message)
    ctx = {"request": request, "me_id": request.user.id}
    return Response(MessageSerializer(message, context=ctx).data,
                    status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
def message_detail(request, conversation_id, message_id):
    """Realtime edit/delete fallback for when the socket is down (mirrors WS)."""
    conv = _get_membership_or_404(request.user, conversation_id)

    if request.method == "DELETE":
        try:
            message = delete_message(conv, request.user, message_id)
        except LookupError:
            return Response({"detail": "Сообщение не найдено."},
                            status=status.HTTP_404_NOT_FOUND)
        except PermissionError:
            return Response({"detail": "Можно удалять только свои сообщения."},
                            status=status.HTTP_403_FORBIDDEN)
        broadcast_delete(conv, message.id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PATCH -> edit text
    try:
        message = edit_message(conv, request.user, message_id,
                               request.data.get("text", ""))
    except LookupError:
        return Response({"detail": "Сообщение не найдено."},
                        status=status.HTTP_404_NOT_FOUND)
    except PermissionError:
        return Response({"detail": "Можно редактировать только свои сообщения."},
                        status=status.HTTP_403_FORBIDDEN)
    except ValueError as exc:
        msg = {
            "empty_message": "Сообщение пустое.",
            "too_long": f"Слишком длинное сообщение (макс. {settings.MAX_MESSAGE_LENGTH}).",
            "deleted": "Сообщение удалено.",
        }.get(str(exc), "Не удалось изменить сообщение.")
        return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
    broadcast_edit(message)
    ctx = {"request": request, "me_id": request.user.id}
    return Response(MessageSerializer(message, context=ctx).data)


@api_view(["POST"])
def read(request, conversation_id):
    conv = _get_membership_or_404(request.user, conversation_id)
    read_at = mark_read(conv, request.user)
    broadcast_read(conv, request.user, read_at)
    return Response({"read_at": read_at.isoformat()})
