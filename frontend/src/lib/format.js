export function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatLastSeen(iso) {
  if (!iso) return "не в сети";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "был(а) только что";
  if (diff < 3600) return `был(а) ${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `был(а) ${Math.floor(diff / 3600)} ч назад`;
  return `был(а) ${d.toLocaleDateString()}`;
}

export function shortPreview(message) {
  if (!message) return "Сообщений пока нет";
  if (message.is_deleted) return "Сообщение удалено";
  if (message.text) return message.text;
  const att = message.attachments && message.attachments[0];
  if (att) {
    if (att.kind === "image") return "Фото";
    if (att.kind === "video") return "Видео";
    return "Файл";
  }
  return "";
}

export function initials(name) {
  if (!name) return "?";
  return name.replace(/[0-9]/g, "").slice(0, 2).toUpperCase();
}

export function humanSize(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
