import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.accounts.models import User


class Conversation(models.Model):
    """A 1-to-1 dialog between two anonymous users."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participants = models.ManyToManyField(
        User, through="Membership", related_name="conversations"
    )
    # Deterministic key for the unordered pair of users -> guarantees a single
    # conversation per pair even under concurrent "add by code" (no duplicates).
    pair_key = models.CharField(max_length=80, unique=True, null=True, blank=True)
    # Invite flow: a conversation starts pending until the invited user accepts.
    pending = models.BooleanField(default=False)
    initiator = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="initiated_conversations",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Updated on every new message so we can sort the chat list by recency.
    last_activity = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-last_activity"]

    def other_member(self, user: User):
        return self.participants.exclude(id=user.id).first()

    def member_ids(self):
        return list(self.memberships.values_list("user_id", flat=True))


class Membership(models.Model):
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="memberships"
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    # Everything created at or before this moment is considered read by the user.
    last_read_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ("conversation", "user")


class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="sent_messages"
    )
    text = models.TextField(blank=True, default="")
    # Client-generated nonce, echoed back so the sender can swap its optimistic
    # placeholder for the saved message without duplicating it.
    client_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    reply_to = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="replies",
    )
    is_deleted = models.BooleanField(default=False)
    # Set the first time a message is edited; drives the "ред." marker.
    edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["conversation", "created_at"])]


def attachment_upload_path(instance, filename):
    return f"attachments/{instance.id}/{filename}"


class Attachment(models.Model):
    IMAGE = "image"
    VIDEO = "video"
    FILE = "file"
    KIND_CHOICES = [(IMAGE, "image"), (VIDEO, "video"), (FILE, "file")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(
        Message, on_delete=models.CASCADE, related_name="attachments"
    )
    file = models.FileField(upload_to=attachment_upload_path)
    thumbnail = models.ImageField(upload_to=attachment_upload_path, null=True, blank=True)
    kind = models.CharField(max_length=8, choices=KIND_CHOICES, default=FILE)
    mime = models.CharField(max_length=120, blank=True, default="")
    original_name = models.CharField(max_length=255, blank=True, default="")
    size = models.BigIntegerField(default=0)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    duration = models.FloatField(null=True, blank=True)  # seconds, for video
    created_at = models.DateTimeField(auto_now_add=True)
