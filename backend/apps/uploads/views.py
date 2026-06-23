import os
import shutil

from django.conf import settings
from django.core.files import File
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .models import Upload
from .serializers import UploadInitSerializer, UploadStatusSerializer


def _chunk_dir(upload_id) -> str:
    return os.path.join(settings.CHUNK_TMP_ROOT, str(upload_id))


def _chunk_path(upload_id, index) -> str:
    return os.path.join(_chunk_dir(upload_id), f"{int(index):08d}.part")


@api_view(["POST"])
def init_upload(request):
    serializer = UploadInitSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    if data["total_size"] > settings.MAX_UPLOAD_SIZE:
        return Response(
            {"detail": f"File too large (max {settings.MAX_UPLOAD_SIZE} bytes)."},
            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )

    upload = Upload.objects.create(
        owner=request.user,
        filename=os.path.basename(data["filename"])[:255],
        mime=data.get("mime", ""),
        total_size=data["total_size"],
        total_chunks=data["total_chunks"],
        status=Upload.PENDING,
    )
    os.makedirs(_chunk_dir(upload.id), exist_ok=True)
    return Response({"upload_id": str(upload.id)}, status=status.HTTP_201_CREATED)


@api_view(["PUT", "POST"])
@parser_classes([MultiPartParser, FormParser])
def upload_chunk(request, upload_id, index):
    upload = get_object_or_404(Upload, id=upload_id, owner=request.user)
    if upload.status == Upload.COMPLETED:
        return Response({"detail": "Upload already completed."},
                        status=status.HTTP_409_CONFLICT)

    index = int(index)
    if index < 0 or index >= upload.total_chunks:
        return Response({"detail": "Chunk index out of range."},
                        status=status.HTTP_400_BAD_REQUEST)

    chunk = request.FILES.get("chunk")
    if chunk is None:
        return Response({"detail": "Missing 'chunk' file part."},
                        status=status.HTTP_400_BAD_REQUEST)
    if chunk.size > settings.MAX_CHUNK_SIZE:
        return Response({"detail": "Chunk too large."},
                        status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

    os.makedirs(_chunk_dir(upload_id), exist_ok=True)
    # Idempotent: rewriting the same index is safe (resume/retry friendly).
    with open(_chunk_path(upload_id, index), "wb") as fh:
        for piece in chunk.chunks():
            fh.write(piece)

    received = len([f for f in os.listdir(_chunk_dir(upload_id)) if f.endswith(".part")])
    upload.received_chunks = received
    upload.status = Upload.UPLOADING
    upload.save(update_fields=["received_chunks", "status", "updated_at"])

    return Response({"index": index, "received_chunks": received,
                     "total_chunks": upload.total_chunks})


@api_view(["POST"])
def complete_upload(request, upload_id):
    upload = get_object_or_404(Upload, id=upload_id, owner=request.user)
    if upload.status == Upload.COMPLETED:
        return Response(UploadStatusSerializer(upload).data)

    chunk_dir = _chunk_dir(upload_id)
    missing = [i for i in range(upload.total_chunks)
               if not os.path.exists(_chunk_path(upload_id, i))]
    if missing:
        return Response(
            {"detail": "Upload incomplete.", "missing_chunks": missing},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Assemble chunks in order into one temp file, then hand it to FileField.
    assembled_path = os.path.join(chunk_dir, "_assembled.bin")
    with open(assembled_path, "wb") as out:
        for i in range(upload.total_chunks):
            with open(_chunk_path(upload_id, i), "rb") as part:
                shutil.copyfileobj(part, out, length=1024 * 1024)

    actual_size = os.path.getsize(assembled_path)
    if upload.total_size and actual_size != upload.total_size:
        return Response(
            {"detail": "Size mismatch — please re-upload.",
             "expected": upload.total_size, "actual": actual_size},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with open(assembled_path, "rb") as fh:
        upload.file.save(upload.filename, File(fh), save=False)
    upload.status = Upload.COMPLETED
    upload.total_size = actual_size
    upload.save(update_fields=["file", "status", "total_size", "updated_at"])

    # Clean up the chunk scratch directory.
    shutil.rmtree(chunk_dir, ignore_errors=True)

    return Response(UploadStatusSerializer(upload).data)


@api_view(["GET"])
def upload_status(request, upload_id):
    upload = get_object_or_404(Upload, id=upload_id, owner=request.user)
    return Response(UploadStatusSerializer(upload).data)
