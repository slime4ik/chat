"""WebSocket token authentication middleware for Channels."""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def get_user(token):
    from .models import User

    if not token:
        return AnonymousUser()
    try:
        return User.objects.get(token=token)
    except User.DoesNotExist:
        return AnonymousUser()


class TokenAuthMiddleware(BaseMiddleware):
    """
    Reads the token from the ``?token=`` query string (browsers cannot set
    custom headers on the WebSocket handshake) and attaches the user to scope.
    """

    async def __call__(self, scope, receive, send):
        query = parse_qs(scope.get("query_string", b"").decode())
        token = query.get("token", [None])[0]
        scope["user"] = await get_user(token)
        return await super().__call__(scope, receive, send)
