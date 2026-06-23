import uuid

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models

import apps.chat.models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Conversation",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False,
                                        primary_key=True, serialize=False)),
                ("pair_key", models.CharField(blank=True, max_length=80, null=True,
                                              unique=True)),
                ("pending", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_activity", models.DateTimeField(
                    db_index=True, default=django.utils.timezone.now)),
                ("initiator", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="initiated_conversations", to="accounts.user")),
            ],
            options={
                "ordering": ["-last_activity"],
            },
        ),
        migrations.CreateModel(
            name="Membership",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True,
                                           serialize=False, verbose_name="ID")),
                ("joined_at", models.DateTimeField(auto_now_add=True)),
                ("last_read_at", models.DateTimeField(
                    default=django.utils.timezone.now)),
                ("conversation", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="memberships", to="chat.conversation")),
                ("user", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="memberships", to="accounts.user")),
            ],
            options={
                "unique_together": {("conversation", "user")},
            },
        ),
        migrations.AddField(
            model_name="conversation",
            name="participants",
            field=models.ManyToManyField(
                related_name="conversations", through="chat.Membership",
                to="accounts.user"),
        ),
        migrations.CreateModel(
            name="Message",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False,
                                        primary_key=True, serialize=False)),
                ("text", models.TextField(blank=True, default="")),
                ("client_id", models.CharField(blank=True, db_index=True, default="",
                                               max_length=64)),
                ("is_deleted", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(
                    db_index=True, default=django.utils.timezone.now)),
                ("conversation", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="messages", to="chat.conversation")),
                ("reply_to", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="replies", to="chat.message")),
                ("sender", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="sent_messages", to="accounts.user")),
            ],
            options={
                "ordering": ["created_at"],
                "indexes": [
                    models.Index(fields=["conversation", "created_at"],
                                 name="chat_messag_convers_created_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="Attachment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False,
                                        primary_key=True, serialize=False)),
                ("file", models.FileField(
                    upload_to=apps.chat.models.attachment_upload_path)),
                ("thumbnail", models.ImageField(
                    blank=True, null=True,
                    upload_to=apps.chat.models.attachment_upload_path)),
                ("kind", models.CharField(
                    choices=[("image", "image"), ("video", "video"), ("file", "file")],
                    default="file", max_length=8)),
                ("mime", models.CharField(blank=True, default="", max_length=120)),
                ("original_name", models.CharField(blank=True, default="",
                                                   max_length=255)),
                ("size", models.BigIntegerField(default=0)),
                ("width", models.PositiveIntegerField(blank=True, null=True)),
                ("height", models.PositiveIntegerField(blank=True, null=True)),
                ("duration", models.FloatField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("message", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="attachments", to="chat.message")),
            ],
        ),
    ]
