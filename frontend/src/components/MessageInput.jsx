import { useEffect, useRef, useState } from "react";
import { Paperclip, Send, X, FileText, Film, CornerUpLeft } from "lucide-react";
import { uploadFile, fileKind } from "../lib/upload.js";
import { humanSize } from "../lib/format.js";

let localId = 0;
const MAX_LEN = 1500;

export default function MessageInput({ replyTo, onCancelReply, onSend, onTyping }) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const fileRef = useRef(null);
  const typingRef = useRef(false);
  const idleTimer = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    return () => {
      clearTimeout(idleTimer.current);
      if (typingRef.current) onTyping(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function autoGrow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  function signalTyping() {
    if (!typingRef.current) {
      typingRef.current = true;
      onTyping(true);
    }
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      typingRef.current = false;
      onTyping(false);
    }, 2500);
  }

  function pickFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    files.forEach(startUpload);
  }

  function startUpload(file) {
    const id = ++localId;
    const isMedia = file.type.startsWith("image/") || file.type.startsWith("video/");
    const entry = {
      id, file, kind: fileKind(file), progress: 0, uploadId: null, error: null,
      previewUrl: isMedia ? URL.createObjectURL(file) : null,
    };
    setAttachments((a) => [...a, entry]);

    uploadFile(file, (p) =>
      setAttachments((a) => a.map((x) => (x.id === id ? { ...x, progress: p } : x)))
    )
      .then((uploadId) =>
        setAttachments((a) =>
          a.map((x) => (x.id === id ? { ...x, uploadId, progress: 1 } : x))
        )
      )
      .catch(() =>
        setAttachments((a) =>
          a.map((x) => (x.id === id ? { ...x, error: true } : x))
        )
      );
  }

  function removeAttachment(id) {
    setAttachments((a) => a.filter((x) => x.id !== id));
  }

  const uploading = attachments.some((a) => !a.uploadId && !a.error);
  const canSend = (text.trim() || attachments.some((a) => a.uploadId)) && !uploading;

  function submit() {
    if (!canSend) return;
    const ready = attachments.filter((a) => a.uploadId);
    const upload_ids = ready.map((a) => a.uploadId);
    // Data for instant optimistic rendering on the sender's side.
    const optimisticAttachments = ready.map((a) => ({
      id: "tmpa_" + a.id,
      kind: a.kind,
      url: a.previewUrl,
      thumbnail_url: a.kind === "image" ? a.previewUrl : null,
      original_name: a.file.name,
      size: a.file.size,
    }));
    onSend({ text: text.trim().slice(0, MAX_LEN), upload_ids, optimisticAttachments });
    setText("");
    setAttachments([]);
    typingRef.current = false;
    onTyping(false);
    requestAnimationFrame(() => {
      autoGrow();
      taRef.current?.focus();
    });
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-ink-700 bg-ink-800 px-2 sm:px-3 py-2 shrink-0">
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 bg-ink-900 border-l-2 border-accent rounded-lg px-3 py-1.5">
          <CornerUpLeft size={16} className="text-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-accent font-medium truncate">
              Ответ {replyTo.sender_nickname}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {replyTo.text || "Вложение"}
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="shrink-0 text-slate-400 hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="relative w-[72px] h-[72px] rounded-lg overflow-hidden bg-ink-900 border border-ink-600 grid place-items-center"
            >
              {a.previewUrl ? (
                <img src={a.previewUrl} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="text-center px-1 text-slate-300">
                  {a.kind === "video" ? <Film size={22} /> : <FileText size={22} />}
                  <div className="text-[9px] text-slate-500 truncate w-[60px] mt-0.5">
                    {humanSize(a.file.size)}
                  </div>
                </div>
              )}
              {!a.uploadId && !a.error && (
                <div className="absolute inset-0 bg-black/55 grid place-items-center text-xs font-medium">
                  {Math.round(a.progress * 100)}%
                </div>
              )}
              {a.error && (
                <div className="absolute inset-0 bg-red-900/70 grid place-items-center text-[10px] text-center px-1">
                  ошибка
                </div>
              )}
              <button
                onClick={() => removeAttachment(a.id)}
                className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 grid place-items-center hover:bg-black"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="h-10 w-10 shrink-0 rounded-full bg-ink-700 hover:bg-ink-600 grid place-items-center text-slate-300"
          title="Прикрепить фото или видео"
        >
          <Paperclip size={20} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={pickFiles}
        />
        <div className="flex-1 min-w-0 relative">
          <textarea
            ref={taRef}
            value={text}
            rows={1}
            maxLength={MAX_LEN}
            onChange={(e) => {
              setText(e.target.value.slice(0, MAX_LEN));
              autoGrow();
              signalTyping();
            }}
            onKeyDown={onKeyDown}
            placeholder="Напишите сообщение…"
            className="w-full resize-none px-3 py-2.5 rounded-2xl bg-ink-900 border border-ink-600 focus:border-accent outline-none text-[15px] leading-snug"
          />
          {text.length > MAX_LEN - 200 && (
            <span className="absolute -top-5 right-1 text-[11px] text-slate-500">
              {text.length}/{MAX_LEN}
            </span>
          )}
        </div>
        <button
          onClick={submit}
          disabled={!canSend}
          className="h-10 w-10 shrink-0 rounded-full bg-accent hover:bg-accent-soft grid place-items-center disabled:opacity-40 transition"
          title="Отправить"
        >
          <Send size={18} className="text-white -ml-0.5" />
        </button>
      </div>
    </div>
  );
}
