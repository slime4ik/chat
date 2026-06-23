from rest_framework import serializers

from .models import Upload


class UploadInitSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    mime = serializers.CharField(max_length=120, required=False, allow_blank=True)
    total_size = serializers.IntegerField(min_value=0)
    total_chunks = serializers.IntegerField(min_value=1)


class UploadStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Upload
        fields = ["id", "filename", "mime", "total_size", "total_chunks",
                  "received_chunks", "status"]
