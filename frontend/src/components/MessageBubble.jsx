import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCheck, CornerUpLeft, FileText, X, Clock3, AlertCircle } from "lucide-react";
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

export default function MessageBubble({ message, onReply }) {
  const mine = message.is_mine;
  const hasMedia = message.attachments?.length > 0;

  return (
    <div className={`group flex items-end gap-1 ${mine ? "justify-end" : "justify-start"}`}>
      {/* Reply button on the left for own messages */}
      {mine && (
        <ReplyButton onReply={onReply} />
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
              {message.reply_to.text ||
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
