import { MessageSquarePlus, Check, X } from "lucide-react";
import { initials } from "../lib/format.js";

// Shown to the user who did NOT enter the code: confirm starting the chat.
export default function RequestModal({ request, remaining, onAccept, onDecline }) {
  const nick = request.peer?.nickname || "Аноним";
  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center px-4">
      <div className="w-full max-w-sm bg-ink-800 border border-ink-600 rounded-2xl p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-accent to-accent-soft grid place-items-center mb-3">
            <MessageSquarePlus size={26} className="text-white" />
          </div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-soft to-ink-500 grid place-items-center text-xs font-semibold">
              {initials(nick)}
            </div>
            <span className="font-semibold">{nick}</span>
          </div>
          <p className="text-slate-300 mt-2">
            Пользователь <b>{nick}</b> хочет начать чат с вами.
          </p>
          {remaining > 0 && (
            <p className="text-xs text-slate-500 mt-1">
              и ещё запросов: {remaining}
            </p>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onDecline}
            className="flex-1 py-2.5 rounded-xl border border-ink-500 hover:bg-ink-700 transition flex items-center justify-center gap-2"
          >
            <X size={18} /> Отказаться
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-soft font-semibold transition flex items-center justify-center gap-2"
          >
            <Check size={18} /> Начать чат
          </button>
        </div>
      </div>
    </div>
  );
}
