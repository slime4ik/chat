import uuid
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.utils import timezone

from .utils import generate_friend_code, generate_nickname, generate_token

# A user is considered "online" if seen within this window AND has a live socket.
ONLINE_WINDOW = timedelta(seconds=40)


class User(models.Model):
    """
    Anonymous-first user.

    Two flavours:
      * guest  -> ephemeral identity (lives for the browser session, new random
                  friend code every time).
      * account -> persistent identity protected by username + password, with a
                   stable personal friend code.

    There is intentionally no email / phone / real name anywhere.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    token = models.CharField(max_length=128, unique=True, default=generate_token,
                             editable=False, db_index=True)

    is_guest = models.BooleanField(default=True)
    username = models.CharField(max_length=32, unique=True, null=True, blank=True)
    password = models.CharField(max_length=128, null=True, blank=True)

    nickname = models.CharField(max_length=40, default=generate_nickname)
    friend_code = models.CharField(max_length=16, unique=True, db_index=True,
                                   default=generate_friend_code)

    # Presence
    last_seen = models.DateTimeField(default=timezone.now)
    socket_count = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["last_seen"])]

    def __str__(self):
        return f"{self.nickname} ({'guest' if self.is_guest else self.username})"

    # --- auth helpers ---------------------------------------------------
    def set_password(self, raw_password: str):
        self.password = make_password(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return bool(self.password) and check_password(raw_password, self.password)

    # --- presence -------------------------------------------------------
    @property
    def is_online(self) -> bool:
        return self.socket_count > 0 and (
            timezone.now() - self.last_seen <= ONLINE_WINDOW
        )

    def touch(self):
        self.last_seen = timezone.now()
        self.save(update_fields=["last_seen"])

    # --- DRF auth contract ---------------------------------------------
    @property
    def is_authenticated(self) -> bool:
        return True

    def rotate_friend_code(self):
        for _ in range(10):
            candidate = generate_friend_code()
            if not User.objects.filter(friend_code=candidate).exists():
                self.friend_code = candidate
                self.save(update_fields=["friend_code"])
                return self.friend_code
        raise RuntimeError("Could not allocate a unique friend code")
