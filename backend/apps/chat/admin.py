from django.contrib import admin

from .models import Attachment, Conversation, Membership, Message


class MembershipInline(admin.TabularInline):
    model = Membership
    extra = 0


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "last_activity", "created_at")
    inlines = [MembershipInline]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "sender", "created_at", "is_deleted")
    search_fields = ("id", "text")


admin.site.register(Attachment)
