"""Helpers for generating unique friend codes, tokens and nicknames."""
import secrets

# Unambiguous alphabet (no 0/O, 1/I/L) so codes are easy to read aloud / type.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8

NICK_ADJECTIVES = [
    "Silent", "Hidden", "Misty", "Lone", "Swift", "Calm", "Wild", "Bold",
    "Pale", "Dark", "Bright", "Frost", "Ember", "Velvet", "Iron", "Lucky",
]
NICK_NOUNS = [
    "Fox", "Owl", "Wolf", "Raven", "Hawk", "Lynx", "Otter", "Moth",
    "Heron", "Bison", "Crane", "Marten", "Falcon", "Badger", "Stoat", "Vole",
]


def generate_friend_code() -> str:
    """Random human-friendly friend code. Uniqueness is enforced by the caller."""
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def generate_token() -> str:
    """Opaque, URL-safe secret used as the bearer token."""
    return secrets.token_urlsafe(48)


def generate_nickname() -> str:
    return f"{secrets.choice(NICK_ADJECTIVES)}{secrets.choice(NICK_NOUNS)}{secrets.randbelow(100):02d}"
