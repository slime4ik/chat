import { useState } from "react";
import {
  Copy, Check, RefreshCw, LogOut, UserPlus, MessageSquare,
} from "lucide-react";
import { api } from "../lib/api.js";
import { formatTime, shortPreview, initials } from "../lib/format.js";

export default function Sidebar({
  me, setMe, conversations, activeId, onOpen, onAddContact, onLogout,
  wsOnline, peerPresence, requestCount = 0,
}) {
  const [code, setCode] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(me.friend_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  async function rotate() {
    try {
      const { friend_code } = await api.rotateCode();
      setMe({ ...me, friend_code });
    } catch {}
  }

  async function submitAdd(e) {
    e.preventDefault();
    setAddError("");
    setAdding(true);
    try {
      await onAddContact(code.trim());
      setCode("");
    } catch (err) {
      setAddError(err.message || "Не удалось добавить контакт");
    } finally {
      setAdding(false);
    }
  }

  return (
    <aside
      className={`${
        activeId ? "hidden md:flex" : "flex"
      } w-full md:w-[340px] shrink-0 border-r border-ink-700 flex-col bg-ink-800 min-w-0`}
    >
      {/* Profile */}
      <div className="p-4 border-b border-ink-700">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-accent to-accent-soft grid place-items-center font-semibold text-sm">
              {initials(me.nickname)}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-800 ${
                wsOnline ? "bg-emerald-400" : "bg-slate-500"
              }`}
              title={wsOnline ? "Подключено" : "Переподключение…"}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold truncate">{me.nickname}</span>
              {me.is_guest && (
                <span className="text-[10px] uppercase tracking-wide bg-ink-600 px-1.5 py-0.5 rounded text-slate-300 shrink-0">
                  гость
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {wsOnline ? "в сети" : "подключение…"}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="shrink-0 h-9 w-9 grid place-items-center rounded-lg text-slate-400 hover:text-red-300 hover:bg-ink-700"
            title="Выйти"
          >
            <LogOut size={18} />
          </button>
        </div>

        {/* Friend code */}
        <div className="mt-4 rounded-xl bg-ink-900 border border-ink-600 p-3">
          <div className="text-xs text-slate-400 mb-2">Твой код дружбы</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 text-center tracking-[0.25em] font-bold text-lg overflow-x-auto whitespace-nowrap no-scrollbar">
              {me.friend_code}
            </code>
            <button
              onClick={copyCode}
              className="shrink-0 h-9 w-9 grid place-items-center rounded-lg bg-ink-700 hover:bg-ink-600"
              title="Скопировать"
            >
              {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
            </button>
            <button
              onClick={rotate}
              className="shrink-0 h-9 w-9 grid place-items-center rounded-lg bg-ink-700 hover:bg-ink-600"
              title="Сгенерировать новый код"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Поделись кодом, чтобы тебе написали.
          </p>
        </div>

        {/* Add contact */}
        <form onSubmit={submitAdd} className="mt-3 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Введите чужой код…"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-ink-900 border border-ink-600 focus:border-accent outline-none tracking-widest text-sm"
          />
          <button
            disabled={adding || !code.trim()}
            className="shrink-0 h-[38px] px-3 rounded-lg bg-accent hover:bg-accent-soft font-medium disabled:opacity-50 flex items-center gap-1"
          >
            <UserPlus size={16} />
          </button>
        </form>
        {addError && <p className="text-xs text-red-300 mt-1.5">{addError}</p>}
        {requestCount > 0 && (
          <p className="text-xs text-accent mt-2">
            Новых запросов на чат: {requestCount}
          </p>
        )}
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-500 flex flex-col items-center gap-3">
            <MessageSquare size={32} className="text-ink-500" />
            <span>Чатов пока нет.<br />Поделись своим кодом или введи чужой.</span>
          </div>
        )}
        {conversations.map((c) => {
          const pres = peerPresence(c);
          const online = pres?.is_online;
          return (
            <button
              key={c.id}
              onClick={() => onOpen(c)}
              className={`w-full text-left px-3 py-3 flex gap-3 items-center hover:bg-ink-700/60 transition border-b border-ink-700/40 min-w-0 ${
                activeId === c.id ? "bg-ink-700" : ""
              }`}
            >
              <div className="relative shrink-0">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-accent-soft to-ink-500 grid place-items-center font-semibold">
                  {initials(c.peer?.nickname)}
                </div>
                {online && (
                  <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-ink-800" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="font-medium truncate">
                    {c.peer?.nickname || "Неизвестный"}
                  </span>
                  <span className="text-[11px] text-slate-500 shrink-0">
                    {c.last_message ? formatTime(c.last_message.created_at) : ""}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2 mt-0.5">
                  <span className="text-sm text-slate-400 truncate">
                    {shortPreview(c.last_message)}
                  </span>
                  {c.unread_count > 0 && (
                    <span className="shrink-0 min-w-[20px] h-5 px-1.5 grid place-items-center text-xs font-semibold rounded-full bg-accent text-white">
                      {c.unread_count > 99 ? "99+" : c.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
