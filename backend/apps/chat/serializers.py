from rest_framework import serializers

from apps.accounts.serializers import PublicUserSerializer

from .models import Attachment, Conversation, Message


class AttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = [
            "id", "kind", "mime", "original_name", "size",
            "width", "height", "duration", "url", "thumbnail_url",
        ]

    def _abs(self, field):
        if not field:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(field.url) if request else field.url

    def get_url(self, obj):
        return self._abs(obj.file)

    def get_thumbnail_url(self, obj):
        return self._abs(obj.thumbnail)


class ReplyPreviewSerializer(serializers.ModelSerializer):
    sender_id = serializers.UUIDField(source="sender.id", read_only=True)
    sender_nickname = serializers.CharField(source="sender.nickname", read_only=True)
    has_attachment = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "sender_id", "sender_nickname", "text", "has_attachment"]

    def get_has_attachment(self, obj):
        return obj.attachments.exists()


class MessageSerializer(serializers.ModelSerializer):
    sender_id = serializers.UUIDField(source="sender.id", read_only=True)
    sender_nickname = serializers.CharField(source="sender.nickname", read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    reply_to = ReplyPreviewSerializer(read_only=True)
    is_read = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id", "conversation_id", "sender_id", "sender_nickname",
            "text", "client_id", "attachments", "reply_to", "is_read", "is_mine",
            "is_deleted", "created_at",
        ]

    def get_is_mine(self, obj):
        me = self.context.get("me_id")
        return str(obj.sender_id) == str(me)

    def get_is_read(self, obj):
        """Read == the *other* participant has seen it (read receipt for sender)."""
        other_last_read = self.context.get("other_last_read")
        if other_last_read is None:
            return False
        return obj.created_at <= other_last_read


class ConversationSerializer(serializers.ModelSerializer):
    peer = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    is_initiator = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ["id", "peer", "last_message", "unread_count", "pending",
                  "is_initiator", "last_activity", "created_at"]

    def _me(self):
        return self.context["request"].user

    def get_is_initiator(self, obj):
        return obj.initiator_id == self._me().id

    def get_peer(self, obj):
        peer = obj.other_member(self._me())
        return PublicUserSerializer(peer).data if peer else None

    def get_last_message(self, obj):
        msg = obj.messages.order_by("-created_at").first()
        if not msg:
            return None
        return MessageSerializer(
            msg, context={**self.context, "me_id": self._me().id}
        ).data

    def get_unread_count(self, obj):
        me = self._me()
        membership = obj.memberships.filter(user=me).first()
        if not membership:
            return 0
        return obj.messages.filter(
            created_at__gt=membership.last_read_at
        ).exclude(sender=me).count()
