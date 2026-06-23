import uuid

from django.db import models

from apps.accounts.models import User


def upload_final_path(instance, filename):
    return f"attachments/{instance.id}/{filename}"


class Upload(models.Model):
    """
    A resumable, chunked upload (Telegram-style).

    Chunks are written to a temp directory as they arrive; on `complete` they
    are concatenated into `file`. Once a message claims the upload, the row is
    deleted and the bytes live on as an Attachment.
    """

    PENDING = "pending"
    UPLOADING = "uploading"
    COMPLETED = "completed"
    STATUS_CHOICES = [
        (PENDING, "pending"),
        (UPLOADING, "uploading"),
        (COMPLETED, "completed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="uploads")

    filename = models.CharField(max_length=255)
    mime = models.CharField(max_length=120, blank=True, default="")
    total_size = models.BigIntegerField(default=0)
    total_chunks = models.PositiveIntegerField(default=1)
    received_chunks = models.PositiveIntegerField(default=0)

    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=PENDING)
    file = models.FileField(upload_to=upload_final_path, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.filename} ({self.received_chunks}/{self.total_chunks})"
