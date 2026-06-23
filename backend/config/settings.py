"""
Django settings for the anonymous messenger.

All secrets and environment-specific values are read from the environment
(.env file). Nothing is hard-coded.
"""
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
)
# Single .env in the project root (next to backend/ and frontend/).
# In Docker the vars are injected via env_file, so a missing file here is fine.
environ.Env.read_env(BASE_DIR.parent / ".env")

# --- Core ---------------------------------------------------------------
SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env("DEBUG")
# Принимаем оба имени: DJANGO_ALLOWED_HOSTS (наше) и ALLOWED_HOSTS (его пишет
# djaploy при деплое) — иначе домен от деплой-сервиса не попадал в allowed hosts.
ALLOWED_HOSTS = env.list(
    "DJANGO_ALLOWED_HOSTS",
    default=env.list("ALLOWED_HOSTS", default=["*"]),
)

# --- Applications -------------------------------------------------------
INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third party
    "rest_framework",
    "corsheaders",
    "channels",
    # local
    "apps.accounts",
    "apps.chat",
    "apps.uploads",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # Serves the built React SPA + static files directly from the ASGI app.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# --- Database -----------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB"),
        "USER": env("POSTGRES_USER"),
        "PASSWORD": env("POSTGRES_PASSWORD"),
        "HOST": env("POSTGRES_HOST", default="db"),
        "PORT": env("POSTGRES_PORT", default="5432"),
        "CONN_MAX_AGE": 60,
    }
}

# --- Channels (WebSocket) ----------------------------------------------
REDIS_URL = env("REDIS_URL", default="redis://redis:6379/0")
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL]},
    }
}

# --- Auth ---------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 6}},
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "apps.accounts.authentication.TokenAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_RENDERER_CLASSES": (
        "rest_framework.renderers.JSONRenderer",
    ),
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.ScopedRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "auth": "30/min",
        "add_contact": "60/min",
    },
}

# --- I18N / TZ ----------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Static & Media -----------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# --- Built React SPA (served by WhiteNoise at the site root) -----------
# The frontend is compiled (vite) into this directory inside the image, so the
# whole app — SPA, API and WebSocket — is served by daphne on a single port.
SPA_DIR = Path(env("SPA_DIR", default=str(BASE_DIR / "spa")))
WHITENOISE_ROOT = SPA_DIR
WHITENOISE_INDEX_FILE = True  # serve index.html for "/"

MEDIA_URL = "media/"
MEDIA_ROOT = Path(env("MEDIA_ROOT", default=str(BASE_DIR / "media")))
CHUNK_TMP_ROOT = MEDIA_ROOT / "chunks"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Messages -----------------------------------------------------------
MAX_MESSAGE_LENGTH = env.int("MAX_MESSAGE_LENGTH", default=1500)

# --- Uploads ------------------------------------------------------------
# Max single chunk size and max assembled file size (bytes).
MAX_CHUNK_SIZE = env.int("MAX_CHUNK_SIZE", default=5 * 1024 * 1024)        # 5 MB
MAX_UPLOAD_SIZE = env.int("MAX_UPLOAD_SIZE", default=2 * 1024 * 1024 * 1024)  # 2 GB
# Allow large multipart bodies (a single chunk) through Django.
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_CHUNK_SIZE + 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 1024 * 1024  # stream to disk above 1 MB

# --- CORS ---------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_ALL_ORIGINS = env.bool("CORS_ALLOW_ALL_ORIGINS", default=DEBUG)
CORS_ALLOW_CREDENTIALS = True

# --- Security (production) ---------------------------------------------
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
}
