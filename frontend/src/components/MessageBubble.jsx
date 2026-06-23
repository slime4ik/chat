import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCheck, CornerUpLeft, FileText, X, Clock3, AlertCircle, Trash2, MoreVertical, Ban, Pencil } from "lucide-react";
import { formatTime, humanSize } from "../lib/format.js";

function ReadTicks({ read }) {
  return read ? (
    <CheckCheck size={15} className="text-sky-300" />
  ) : (
    <Check size={15} className="text-slate-300/70" />
  );
}

function ImageAttachment({ att }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img
        src={att.thumbnail_url || att.url}
        alt={att.original_name}
        loading="lazy"
        onClick={() => setOpen(true)}
        style={{ imageOrientation: "from-image" }}
        className="rounded-lg w-full max-w-[260px] max-h-[320px] object-cover cursor-pointer"
      />
      {open &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <button className="absolute top-4 right-4 z-10 text-white/80 hover:text-white">
              <X size={28} />
            </button>
            <img
              src={att.url}
              alt={att.original_name}
              style={{ imageOrientation: "from-image" }}
              className="max-h-full max-w-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

function Attachment({ att }) {
  if (att.kind === "image") return <ImageAttachment att={att} />;

  if (att.kind === "video") {
    return (
      <div className="relative">
        <video
          src={att.url}
          controls
          preload="metadata"
          poster={att.thumbnail_url || undefined}
          className="rounded-lg w-full max-w-[280px] max-h-[340px] bg-black"
        />
      </div>
    );
  }

  return (
    <a
      href={att.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 bg-black/20 rounded-lg px-3 py-2 hover:bg-black/30 max-w-[260px]"
    >
      <span className="shrink-0 h-9 w-9 rounded-lg bg-accent/30 grid place-items-center">
        <FileText size={18} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm">{att.original_name || "Файл"}</span>
        <span className="text-xs text-slate-400">{humanSize(att.size)}</span>
      </span>
    </a>
  );
}

export default function MessageBubble({ message, onReply, onDelete, onEdit }) {
  const mine = message.is_mine;
  const hasMedia = message.attachments?.length > 0;

  // A deleted message lives on as a muted, non-interactive tombstone.
  if (message.is_deleted) {
    return (
      <div className={`group flex items-end ${mine ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[85%] sm:max-w-[65%] min-w-0 rounded-2xl px-2.5 py-2 border border-dashed ${
            mine ? "border-white/15 rounded-br-md" : "border-ink-600 rounded-bl-md"
          } bg-transparent`}
        >
          <div className="flex items-center gap-1.5 text-[14px] italic text-slate-400/80">
            <Ban size={14} className="shrink-0" />
            <span>Сообщение удалено</span>
            <span className="text-[10px] not-italic text-slate-500 ml-1">
              {formatTime(message.created_at)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex items-end gap-1 ${mine ? "justify-end" : "justify-start"}`}>
      {/* Actions on the left for own messages: reply (quick) + protected menu.
          Delete is hidden until the message is actually saved on the server. */}
      {mine && (
        <div className="flex items-center">
          {!message.sending && !String(message.id).startsWith("tmp_") && (
            <MessageMenu onDelete={onDelete} onEdit={message.text ? onEdit : null} />
          )}
          <ReplyButton onReply={onReply} />
        </div>
      )}

      <div
        className={`relative max-w-[85%] sm:max-w-[65%] min-w-0 rounded-2xl px-2.5 py-2 ${
          mine ? "bg-accent-soft rounded-br-md" : "bg-ink-700 rounded-bl-md"
        }`}
      >
        {message.reply_to && (
          <div className="mb-1.5 border-l-2 border-white/40 pl-2 py-0.5 text-xs bg-black/15 rounded">
            <div className="font-medium opacity-90 truncate">
              {message.reply_to.sender_nickname}
            </div>
            <div className="opacity-70 truncate">
              {message.reply_to.is_deleted
                ? "Сообщение удалено"
                : message.reply_to.text ||
                  (message.reply_to.has_attachment ? "Вложение" : "")}
            </div>
          </div>
        )}

        {hasMedia && (
          <div className="space-y-1.5 mb-1">
            {message.attachments.map((a) => (
              <Attachment key={a.id} att={a} />
            ))}
          </div>
        )}

        {message.text && (
          <div className="whitespace-pre-wrap break-words text-[15px] leading-snug">
            {message.text}
          </div>
        )}

        <div className="flex items-center justify-end gap-1 mt-0.5 text-[10px] text-slate-200/70 select-none">
          {message.edited_at && <span className="italic opacity-80">ред.</span>}
          <span>{formatTime(message.created_at)}</span>
          {mine && message.error ? (
            <AlertCircle size={14} className="text-red-300" />
          ) : mine && message.sending ? (
            <Clock3 size={13} className="text-slate-300/70" />
          ) : mine ? (
            <ReadTicks read={message.is_read} />
          ) : null}
        </div>
      </div>

      {/* Reply button on the right for received messages */}
      {!mine && <ReplyButton onReply={onReply} />}
    </div>
  );
}

function ReplyButton({ onReply }) {
  return (
    <button
      onClick={onReply}
      className="shrink-0 h-7 w-7 grid place-items-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-ink-600 opacity-60 md:opacity-0 md:group-hover:opacity-100 transition mb-1"
      title="Ответить"
    >
      <CornerUpLeft size={15} />
    </button>
  );
}

// Delete sits behind a small menu (open → click) so it can't be hit by accident
// the way a one-tap button could. The dropdown is rendered in a portal with
// fixed positioning so it's never clipped by the scroll area and never creeps
// over the chat header — it flips above/below the button depending on room.
const MENU_W = 184;

function MessageMenu({ onDelete, onEdit }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  function place() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, r.right - MENU_W),
      window.innerWidth - MENU_W - 8
    );
    const openUp = window.innerHeight - r.bottom < 160;
    setPos(
      openUp
        ? { left, bottom: window.innerHeight - r.top + 6 }
        : { left, top: r.bottom + 6 }
    );
  }

  function toggle() {
    if (!open) place();
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    // Fixed menu doesn't follow the list — just close it on scroll/resize.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className={`shrink-0 h-7 w-7 grid place-items-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-ink-600 transition mb-1 ${
          open ? "opacity-100" : "opacity-60 md:opacity-0 md:group-hover:opacity-100"
        }`}
        title="Ещё"
      >
        <MoreVertical size={15} />
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              width: MENU_W,
            }}
            className="z-50 rounded-xl bg-ink-800 border border-ink-600 shadow-xl py-1 overflow-hidden"
          >
            {onEdit && (
              <button
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-ink-700 text-left"
              >
                <Pencil size={15} className="shrink-0" />
                Редактировать
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false);
                onDelete?.();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-300 hover:bg-ink-700 text-left"
            >
              <Trash2 size={15} className="shrink-0" />
              Удалить у всех
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
