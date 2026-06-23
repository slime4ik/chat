from django.urls import path

from . import views

urlpatterns = [
    path("init/", views.init_upload),
    path("<uuid:upload_id>/chunk/<int:index>/", views.upload_chunk),
    path("<uuid:upload_id>/complete/", views.complete_upload),
    path("<uuid:upload_id>/status/", views.upload_status),
]
