import { getToken } from "./auth.js";

// Telegram-style chunked upload: init -> upload each chunk (with retries) ->
// complete. Returns the upload_id to attach to a message. `onProgress` gets a
// 0..1 fraction so the UI can show a progress bar for big videos.
const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB — keep in sync with MAX_CHUNK_SIZE

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Token ${token}` } : {};
}

async function postJSON(path, body) {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`init failed: ${res.status}`);
  return res.json();
}

async function putChunk(uploadId, index, blob, attempt = 0) {
  const form = new FormData();
  form.append("chunk", blob);
  try {
    const res = await fetch(`/api/uploads/${uploadId}/chunk/${index}/`, {
      method: "PUT",
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) throw new Error(`chunk ${index} -> ${res.status}`);
    return res.json();
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      return putChunk(uploadId, index, blob, attempt + 1);
    }
    throw err;
  }
}

export async function uploadFile(file, onProgress) {
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

  const { upload_id } = await postJSON("/uploads/init/", {
    filename: file.name,
    mime: file.type || "application/octet-stream",
    total_size: file.size,
    total_chunks: totalChunks,
  });

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const blob = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
    await putChunk(upload_id, i, blob);
    if (onProgress) onProgress((i + 1) / totalChunks);
  }

  await postJSON(`/uploads/${upload_id}/complete/`, {});
  return upload_id;
}

// Pull lightweight client-side metadata so the UI can show previews/aspect.
export function fileKind(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}
