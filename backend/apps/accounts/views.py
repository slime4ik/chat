from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from django.utils import timezone

from .models import ONLINE_WINDOW, User
from .serializers import (
    LoginSerializer,
    MeSerializer,
    RegisterSerializer,
)


def _auth_payload(user: User) -> dict:
    """Token + profile returned on every successful auth action."""
    return {"token": user.token, "user": MeSerializer(user).data}


class AuthThrottle(ScopedRateThrottle):
    scope = "auth"


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def guest(request):
    """Create a fresh, throwaway guest identity with a random friend code."""
    user = User.objects.create(is_guest=True)
    return Response(_auth_payload(user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    user = User(is_guest=False, username=data["username"])
    if data.get("nickname"):
        user.nickname = data["nickname"]
    user.set_password(data["password"])
    user.save()
    return Response(_auth_payload(user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def login(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        user = User.objects.get(username__iexact=data["username"].strip(),
                                is_guest=False)
    except User.DoesNotExist:
        return Response({"detail": "Неверный логин или пароль."},
                        status=status.HTTP_401_UNAUTHORIZED)

    if not user.check_password(data["password"]):
        return Response({"detail": "Неверный логин или пароль."},
                        status=status.HTTP_401_UNAUTHORIZED)

    return Response(_auth_payload(user))


@api_view(["GET"])
@permission_classes([AllowAny])
def stats(request):
    """Public live counters for the entry screen."""
    cutoff = timezone.now() - ONLINE_WINDOW
    online = User.objects.filter(socket_count__gt=0, last_seen__gte=cutoff).count()
    return Response({"online": online})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(MeSerializer(request.user).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def rotate_code(request):
    """Manually regenerate the user's friend code."""
    code = request.user.rotate_friend_code()
    return Response({"friend_code": code})
