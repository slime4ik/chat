import { useEffect, useState } from "react";
import { UserRound, LogIn, UserPlus, Loader2, ArrowLeft } from "lucide-react";
import { api } from "../lib/api.js";
import { saveAuth } from "../lib/auth.js";

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("choice"); // choice | login | register
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  
  // Инициализация online с сохранением в localStorage
  const [online, setOnline] = useState(() => {
    const now = Date.now();
    const lastUpdate = localStorage.getItem('lastUpdate');
    const storedValue = localStorage.getItem('onlineValue');
    
    // Если значение сохранено и прошло меньше 1.5 минут (90000 мс)
    if (storedValue && lastUpdate && (now - parseInt(lastUpdate)) < 90000) {
      return parseInt(storedValue);
    }
    
    // Генерируем новое значение в диапазоне 543-558
    const newValue = Math.floor(Math.random() * (558 - 543 + 1)) + 543;
    
    // Сохраняем в localStorage
    localStorage.setItem('onlineValue', newValue);
    localStorage.setItem('lastUpdate', now.toString());
    
    return newValue;
  });

  // Функция для обновления online
  const updateOnline = () => {
    const now = Date.now();
    const lastUpdate = localStorage.getItem('lastUpdate');
    
    // Если прошло меньше 1.5 минут - выходим
    if (lastUpdate && (now - parseInt(lastUpdate)) < 90000) {
      return;
    }
    
    // Генерируем изменение на + или - 4-5
    const change = Math.random() > 0.5 ? 1 : -1; // направление
    const delta = Math.floor(Math.random() * (5 - 4 + 1)) + 4; // 4 или 5
    const newValue = online + (change * delta);
    
    // Ограничиваем диапазон 543-558
    const clampedValue = Math.max(543, Math.min(558, newValue));
    
    setOnline(clampedValue);
    localStorage.setItem('onlineValue', clampedValue);
    localStorage.setItem('lastUpdate', now.toString());
  };

  useEffect(() => {
    // Первоначальная проверка
    updateOnline();
    
    // Проверяем каждые 1.5 минуты
    const intervalId = setInterval(() => {
      updateOnline();
    }, 90000); // 1.5 минуты
    
    return () => clearInterval(intervalId);
  }, []);

  // Остальной код компонента...
  
  async function go(fn, kind) {
    setBusy(true);
    setError("");
    try {
      const { token, user } = await fn();
      saveAuth(token, kind);
      onAuthed(user);
    } catch (e) {
      setError(e.message || "Что-то пошло не так");
    } finally {
      setBusy(false);
    }
  }

  const enterGuest = () => go(() => api.guest(), "guest");
  const doLogin = () => go(() => api.login(username, password), "account");
  const doRegister = () =>
    go(() => api.register(username, password, nickname), "account");

 return (
    <div className="h-full grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-grid place-items-center h-14 w-14 rounded-2xl bg-gradient-to-br from-accent to-accent-soft mb-3">
            <svg 
              width="" 
              height="" 
              viewBox="0 0 32 32" 
              fill="none" 
              
            >
              <g clipPath="url(#clip0_531_2)">
                <path d="M24 0H8C3.58172 0 0 3.58172 0 8V24C0 28.4183 3.58172 32 8 32H24C28.4183 32 32 28.4183 32 24V8C32 3.58172 28.4183 0 24 0Z" fill="#0339B8"/>
                <path d="M11.7257 20.8H20.2743C20.4267 20.8 20.5486 20.7543 20.64 20.6629C20.7467 20.5562 20.8 20.4267 20.8 20.2743V18.1257C20.8 17.9733 20.7467 17.8514 20.64 17.76C20.5486 17.6533 20.4267 17.6 20.2743 17.6H11.7257C11.5733 17.6 11.4438 17.6533 11.3371 17.76C11.2457 17.8514 11.2 17.9733 11.2 18.1257V20.2743C11.2 20.4267 11.2457 20.5562 11.3371 20.6629C11.4438 20.7543 11.5733 20.8 11.7257 20.8ZM11.7257 14.4H20.2743C20.4267 14.4 20.5486 14.3543 20.64 14.2629C20.7467 14.1562 20.8 14.0267 20.8 13.8743V11.7257C20.8 11.5733 20.7467 11.4514 20.64 11.36C20.5486 11.2533 20.4267 11.2 20.2743 11.2H11.7257C11.5733 11.2 11.4438 11.2533 11.3371 11.36C11.2457 11.4514 11.2 11.5733 11.2 11.7257V13.8743C11.2 14.0267 11.2457 14.1562 11.3371 14.2629C11.4438 14.3543 11.5733 14.4 11.7257 14.4ZM8 20.8V11.2C8 10.3162 8.31238 9.5619 8.93714 8.93714C9.5619 8.31238 10.3162 8 11.2 8H20.8C21.6838 8 22.4381 8.31238 23.0629 8.93714C23.6876 9.5619 24 10.3162 24 11.2V13.2571C24 14.019 23.7333 14.6667 23.2 15.2L22.4 16L23.2 16.8C23.7333 17.3333 24 17.981 24 18.7429V20.8C24 21.6838 23.6876 22.4381 23.0629 23.0629C22.4381 23.6876 21.6838 24 20.8 24H11.2C10.3162 24 9.5619 23.6876 8.93714 23.0629C8.31238 22.4381 8 21.6838 8 20.8Z" fill="#FFFFFF"/>
              </g>
              <defs>
                <clipPath id="clip0_531_2">
                  <rect width="32" height="32" fill="white"/>
                </clipPath>
              </defs>
            </svg>
          </div>
          <div className="text-3xl font-bold tracking-tight">Blank</div>
          <p className="text-slate-400 text-sm mt-1">
            Анонимный мессенджер без привязки к личности.
          </p>
          {online !== null && (
            <div className="inline-flex items-center gap-2 mt-3 text-sm text-slate-300 bg-ink-800 border border-ink-600 rounded-full px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Сейчас в сети: <b className="text-emerald-300">{online}</b>
            </div>
          )}
        </div>

        <div className="bg-ink-800 border border-ink-600 rounded-2xl p-6 shadow-xl">
          {error && (
            <div className="mb-4 text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {mode === "choice" && (
            <div className="space-y-3">
              <button
                onClick={enterGuest}
                disabled={busy}
                className="w-full py-3 rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors duration-200"
                style={{
                  backgroundColor: '#0339B8',
                  color: 'white'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#5B8CFF';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#0339B8';
                }}
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <UserRound size={18} />}
                Войти гостем
              </button>
              <p className="text-xs text-slate-500 text-center">
                Одноразовая личность с новым кодом дружбы — только на эту сессию.
              </p>
              <div className="flex items-center gap-3 py-1">
                <div className="h-px bg-ink-600 flex-1" />
                <span className="text-xs text-slate-500">или</span>
                <div className="h-px bg-ink-600 flex-1" />
              </div>
              <button
                onClick={() => setMode("login")}
                className="w-full py-2.5 rounded-xl border border-ink-500 hover:bg-ink-700 transition flex items-center justify-center gap-2"
              >
                <LogIn size={18} /> Войти
              </button>
              <button
                onClick={() => setMode("register")}
                className="w-full py-2.5 rounded-xl border border-ink-500 hover:bg-ink-700 transition flex items-center justify-center gap-2"
              >
                <UserPlus size={18} /> Создать аккаунт
              </button>
              <p className="text-xs text-slate-500 text-center pt-1">
                У аккаунта постоянный код дружбы и сохранённая история чатов.
              </p>
            </div>
          )}

          {(mode === "login" || mode === "register") && (
            <div className="space-y-3">
              <Field
                label="Логин"
                value={username}
                onChange={setUsername}
                placeholder="Логин"
              />
              {mode === "register" && (
                <Field
                  label="Имя (необязательно)"
                  value={nickname}
                  onChange={setNickname}
                  placeholder="Случайное, если оставить пустым"
                />
              )}
              <Field
                label="Пароль"
                value={password}
                onChange={setPassword}
                type="password"
                placeholder="••••••"
              />
              <button
                onClick={mode === "login" ? doLogin : doRegister}
                disabled={busy || !username || !password}
                className="w-full py-3 rounded-xl bg-accent hover:bg-accent-soft transition font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 size={18} className="animate-spin" />}
                {mode === "login" ? "Войти" : "Создать аккаунт"}
              </button>
              <button
                onClick={() => {
                  setMode("choice");
                  setError("");
                }}
                className="w-full text-sm text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1"
              >
                <ArrowLeft size={16} /> Назад
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-lg bg-ink-900 border border-ink-600 focus:border-accent outline-none"
      />
    </label>
  );
}
