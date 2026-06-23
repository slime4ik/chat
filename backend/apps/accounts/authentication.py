from rest_framework import authentication, exceptions

from .models import User


class TokenAuthentication(authentication.BaseAuthentication):
    """
    Bearer-token auth backed by the anonymous ``User`` model.

    Clients send:  Authorization: Token <token>
    """

    keyword = "Token"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("utf-8")
        if not header:
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            return None

        token = parts[1]
        try:
            user = User.objects.get(token=token)
        except User.DoesNotExist:
            raise exceptions.AuthenticationFailed("Invalid token")

        return (user, token)

    def authenticate_header(self, request):
        return self.keyword
