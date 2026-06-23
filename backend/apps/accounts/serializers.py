from rest_framework import serializers

from .models import User


class PublicUserSerializer(serializers.ModelSerializer):
    """What other people are allowed to see about a user."""

    is_online = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "nickname", "is_online", "last_seen"]


class MeSerializer(serializers.ModelSerializer):
    """The authenticated user's own profile (includes the friend code + token)."""

    is_online = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "nickname", "friend_code", "is_guest", "username",
            "is_online", "last_seen", "created_at",
        ]


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=3, max_length=32)
    password = serializers.CharField(min_length=6, max_length=128, write_only=True)
    nickname = serializers.CharField(max_length=40, required=False, allow_blank=True)

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Этот логин уже занят.")
        return value


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=32)
    password = serializers.CharField(max_length=128, write_only=True)
