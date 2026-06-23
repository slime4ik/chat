import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, MessageSquare, ChevronDown, Clock3 } from "lucide-react";
import MessageBubble from "./MessageBubble.jsx";
import MessageInput from "./MessageInput.jsx";
import { formatLastSeen, initials } from "../lib/format.js";

export default function ChatWindow({
  me, conv, messages, peerPresence, peerTyping, hasMore, onLoadOlder,
  onSend, onDelete, onEditSave, onTyping, onBack, composerLocked, lockReason,
}) {
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const restoreHeight = useRef(0);
  const openedConvId = useRef(null);

  useEffect(() => {
    setReplyTo(null);
    setEditing(null);
  }, [conv?.id]);

  // При открытии чата сразу прыгаем к самым свежим сообщениям (как в обычных
  // мессенджерах). Срабатывает один раз на каждый открытый чат — дальше скролл
  // вверх подгружает старые, а новые входящие докручивают вниз (эффект ниже).
  useLayoutEffect(() => {
    if (conv?.id && conv.id !== openedConvId.current && messages.length > 0) {
      openedConvId.current = conv.id;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [conv?.id, messages]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && restoreHeight.current) {
      el.scrollTop = el.scrollHeight - restoreHeight.current;
      restoreHeight.current = 0;
    }
  }, [messages]);

  useEffect(() => {
    if (restoreHeight.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 250;
    if (nearBottom || messages.length <= 1) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages.length, peerTyping]);

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 400);
    if (!loadingOlder && hasMore && onLoadOlder && el.scrollTop < 80) {
      setLoadingOlder(true);
      restoreHeight.current = el.scrollHeight;
      await onLoadOlder();
      setLoadingOlder(false);
    }
  }

  if (!conv) {
    return (
      <main className="hidden md:flex flex-1 items-center justify-center text-slate-500 bg-ink-900">
        <div className="text-center flex flex-col items-center gap-3">
          <MessageSquare size={48} className="text-ink-600" />
          <p>Выбери чат или добавь контакт по коду.</p>
        </div>
      </main>
    );
  }

  const online = peerPresence?.is_online;
  const status = peerTyping
    ? "печатает…"
    : online
    ? "в сети"
    : formatLastSeen(peerPresence?.last_seen);

  function handleSend(payload) {
    onSend(conv.id, {
      ...payload,
      reply_to: replyTo?.id || null,
      replyToPreview: replyTo
        ? {
            sender_nickname: replyTo.sender_nickname,
            text: replyTo.text,
            has_attachment: (replyTo.attachments || []).length > 0,
          }
        : null,
    });
    setReplyTo(null);
  }

  return (
    <main className="flex-1 flex flex-col bg-ink-900 min-w-0 relative">
      {/* Header */}
      <header className="px-2 sm:px-4 py-2.5 border-b border-ink-700 flex items-center gap-2 sm:gap-3 bg-ink-800 shrink-0">
        <button
          onClick={onBack}
          className="md:hidden h-9 w-9 shrink-0 grid place-items-center rounded-full hover:bg-ink-700 text-slate-300"
          title="Назад"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="relative shrink-0">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-accent-soft to-ink-500 grid place-items-center font-semibold">
            {initials(conv.peer?.nickname)}
          </div>
          {online && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-400 border-2 border-ink-800" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{conv.peer?.nickname}</div>
          <div className={`text-xs truncate ${peerTyping ? "text-accent" : online ? "text-emerald-400" : "text-slate-500"}`}>
            {status}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-2 sm:px-4 py-4 space-y-1"
      >
        {loadingOlder && (
          <div className="text-center text-xs text-slate-500 py-2">Загрузка…</div>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onReply={() => {
              setEditing(null);
              setReplyTo(m);
            }}
            onDelete={() => onDelete(conv.id, m.id)}
            onEdit={() => {
              setReplyTo(null);
              setEditing(m);
            }}
          />
        ))}
        {peerTyping && (
          <div className="flex justify-start">
            <div className="bg-ink-700 rounded-2xl rounded-bl-md px-3 py-2.5">
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick scroll-to-bottom */}
      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          className="absolute right-4 bottom-24 h-10 w-10 rounded-full bg-ink-700 hover:bg-ink-600 border border-ink-500 grid place-items-center shadow-lg text-slate-200"
          title="Вниз"
        >
          <ChevronDown size={22} />
        </button>
      )}

      {/* Composer (locked while invite pending) */}
      {composerLocked ? (
        <div className="border-t border-ink-700 bg-ink-800 px-4 py-4 text-center text-sm text-slate-400 flex items-center justify-center gap-2 shrink-0">
          <Clock3 size={16} /> {lockReason}
        </div>
      ) : (
        <MessageInput
          key={conv.id}
          replyTo={replyTo}
          editing={editing}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onEditSave={(text) => {
            onEditSave(conv.id, editing.id, text);
            setEditing(null);
          }}
          onSend={handleSend}
          onTyping={(t) => onTyping(conv.id, t)}
        />
      )}
    </main>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-1 items-center h-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}
