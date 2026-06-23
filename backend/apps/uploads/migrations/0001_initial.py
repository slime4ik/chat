import uuid

import django.db.models.deletion
from django.db import migrations, models

import apps.uploads.models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Upload",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False,
                                        primary_key=True, serialize=False)),
                ("filename", models.CharField(max_length=255)),
                ("mime", models.CharField(blank=True, default="", max_length=120)),
                ("total_size", models.BigIntegerField(default=0)),
                ("total_chunks", models.PositiveIntegerField(default=1)),
                ("received_chunks", models.PositiveIntegerField(default=0)),
                ("status", models.CharField(
                    choices=[("pending", "pending"), ("uploading", "uploading"),
                             ("completed", "completed")],
                    default="pending", max_length=12)),
                ("file", models.FileField(blank=True, null=True,
                                          upload_to=apps.uploads.models.upload_final_path)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("owner", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="uploads", to="accounts.user")),
            ],
        ),
    ]
