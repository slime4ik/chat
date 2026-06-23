from django.urls import path

from . import views

urlpatterns = [
    path("conversations/", views.conversation_list),
    path("requests/", views.request_list),
    path("contacts/add/", views.add_contact),
    path("conversations/<uuid:conversation_id>/accept/", views.accept_request),
    path("conversations/<uuid:conversation_id>/decline/", views.decline_request),
    path("conversations/<uuid:conversation_id>/messages/", views.messages),
    path("conversations/<uuid:conversation_id>/read/", views.read),
]
