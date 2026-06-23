from django.urls import path

from . import views

urlpatterns = [
    path("guest/", views.guest),
    path("register/", views.register),
    path("login/", views.login),
    path("me/", views.me),
    path("stats/", views.stats),
    path("rotate-code/", views.rotate_code),
]
