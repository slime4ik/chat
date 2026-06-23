from django.contrib import admin

from .models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("nickname", "username", "is_guest", "friend_code",
                    "is_online", "last_seen", "created_at")
    list_filter = ("is_guest",)
    search_fields = ("nickname", "username", "friend_code", "id")
    readonly_fields = ("id", "token", "created_at")
