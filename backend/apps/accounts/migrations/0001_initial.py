import uuid

import django.utils.timezone
from django.db import migrations, models

import apps.accounts.utils


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="User",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False,
                                        primary_key=True, serialize=False)),
                ("token", models.CharField(db_index=True,
                                           default=apps.accounts.utils.generate_token,
                                           editable=False, max_length=128, unique=True)),
                ("is_guest", models.BooleanField(default=True)),
                ("username", models.CharField(blank=True, max_length=32, null=True,
                                              unique=True)),
                ("password", models.CharField(blank=True, max_length=128, null=True)),
                ("nickname", models.CharField(
                    default=apps.accounts.utils.generate_nickname, max_length=40)),
                ("friend_code", models.CharField(
                    db_index=True, default=apps.accounts.utils.generate_friend_code,
                    max_length=16, unique=True)),
                ("last_seen", models.DateTimeField(default=django.utils.timezone.now)),
                ("socket_count", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "indexes": [
                    models.Index(fields=["last_seen"],
                                 name="accounts_user_last_seen_idx"),
                ],
            },
        ),
    ]
