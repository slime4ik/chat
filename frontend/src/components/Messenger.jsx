import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { ChatSocket } from "../lib/ws.js";
import {
  requestNotifyPermission,
  showNotification,
  playPing,
  setUnreadTitle,
} from "../lib/notify.js";
import { shortPreview } from "../lib/format.js";
import Sidebar from "./Sidebar.jsx";
import ChatWindow from "./ChatWindow.jsx";
import RequestModal from "./RequestModal.jsx";

const newClientId = () =>
  (crypto?.randomUUID ? crypto.randomUUID() : "c" + Date.now() + Math.random().toString(16).slice(2));

function sortConvs(list) {
  return [...list].sort(
    (a, b) => new Date(b.last_activity) - new Date(a.last_activity)
  );
}

// Merge message arrays by id; an incoming server message also replaces the
// optimistic placeholder that carries the same client_id.
function mergeMessages(existing = [], incoming = []) {
  const map = new Map();
  const byClient = new Map();
  for (const m of existing) {
    map.set(m.id, m);
    if (m.client_id && String(m.id).startsWith("tmp_")) byClient.set(m.client_id, m.id);
  }
  for (const m of incoming) {
    if (m.client_id && byClient.has(m.client_id)) map.delete(byClient.get(m.client_id));
    map.set(m.id, m);
  }
  return [...map.values()].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
}

export default function Messenger({ me, setMe, onLogout }) {
  const [conversations, setConversations] = useState([]);
  const [requests, setRequests] = useState([]); // incoming pending invites
  const [activeId, setActiveId] = useState(null);
  const [messagesByConv, setMessagesByConv] = useState({});
  const [presence, setPresence] = useState({});
  const [typing, setTyping] = useState({});
  const [hasMore, setHasMore] = useState({});
  const [wsOnline, setWsOnline] = useState(false);

  const socketRef = useRef(null);
  const activeIdRef = useRef(null);
  const conversationsRef = useRef([]);
  const messagesRef = useRef({});
  const loadedHistory = useRef(new Set());
  const typingTimers = useRef({});
  const handlerRef = useRef(() => {});
  activeIdRef.current = activeId;
  conversationsRef.current = conversations;
  messagesRef.current = messagesByConv;

  // --- initial load ---------------------------------------------------
  useEffect(() => {
    refreshConversations();
    refreshRequests();
    requestNotifyPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unread badge in the tab title.
  useEffect(() => {
    const total = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);
    setUnreadTitle(total + requests.length);
  }, [conversations, requests]);

  // --- websocket ------------------------------------------------------
  useEffect(() => {
    const socket = new ChatSocket();
    socketRef.current = socket;
    const off = socket.subscribe((evt) => handlerRef.current(evt));
    socket.connect();
    return () => {
      off();
      socket.close();
    };
  }, []);

  // Refresh on focus + reliability catch-up poll (covers any missed WS event).
  useEffect(() => {
    const onFocus = () => resync();
    window.addEventListener("focus", onFocus);
    let tick = 0;
    const id = setInterval(() => {
      if (document.hidden) return;
      tick++;
      catchUpActive();
      if (tick % 3 === 0) {
        refreshConversations();
        refreshRequests();
      }
    }, 9000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  handlerRef.current = (evt) => {
    switch (evt.type) {
      case "_status":
        setWsOnline(evt.online);
        if (evt.online) resync();
        return;
      case "message":
        onIncomingMessage(evt.message);
        return;
      case "message_error":
        onMessageError(evt);
        return;
      case "read":
        onRead(evt);
        return;
      case "typing":
        onTyping(evt);
        return;
      case "presence":
        setPresence((p) => ({
          ...p,
          [evt.user_id]: { is_online: evt.is_online, last_seen: evt.last_seen },
        }));
        return;
      case "chat_request":
        onChatRequest(evt);
        return;
      case "chat_status":
        onChatStatus(evt);
        return;
      default:
        return;
    }
  };

  // --- data refresh ---------------------------------------------------
  function refreshConversations() {
    return api.conversations().then((l) => setConversations(sortConvs(l))).catch(() => {});
  }
  function refreshRequests() {
    return api.requests().then(setRequests).catch(() => {});
  }

  async function resync() {
    await refreshConversations();
    refreshRequests();
    const cid = activeIdRef.current;
    if (cid) {
      try {
        const data = await api.messages(cid, {});
        loadedHistory.current.add(cid);
        setHasMore((h) => ({ ...h, [cid]: data.has_more }));
        setMessagesByConv((m) => ({ ...m, [cid]: mergeMessages(m[cid], data.results) }));
        markRead(cid);
      } catch {}
    }
  }

  // Lightweight: pull only messages newer than the latest real one we hold.
  async function catchUpActive() {
    const cid = activeIdRef.current;
    if (!cid) return;
    const list = (messagesRef.current[cid] || []).filter(
      (x) => !String(x.id).startsWith("tmp_")
    );
    const last = list[list.length - 1];
    try {
      const data = await api.messages(cid, last ? { after: last.created_at } : {});
      if (data.results?.length) {
        setMessagesByConv((m) => ({ ...m, [cid]: mergeMessages(m[cid], data.results) }));
        if (data.results.some((x) => !x.is_mine)) markRead(cid);
      }
    } catch {}
  }

  // --- realtime handlers ----------------------------------------------
  function onIncomingMessage(msg) {
    const convId = msg.conversation_id;
    setMessagesByConv((m) => ({ ...m, [convId]: mergeMessages(m[convId], [msg]) }));

    setConversations((cs) => {
      let found = false;
      const updated = cs.map((c) => {
        if (c.id !== convId) return c;
        found = true;
        const isActive = activeIdRef.current === convId;
        return {
          ...c,
          last_message: msg,
          last_activity: msg.created_at,
          unread_count: isActive || msg.is_mine ? 0 : (c.unread_count || 0) + 1,
        };
      });
      if (!found) {
        refreshConversations();
        return cs;
      }
      return sortConvs(updated);
    });

    if (activeIdRef.current === convId && !msg.is_mine) {
      markRead(convId);
      return;
    }
    if (!msg.is_mine && (document.hidden || activeIdRef.current !== convId)) {
      playPing();
      showNotification(msg.sender_nickname || "Новое сообщение", shortPreview(msg), () => {
        const c = conversationsRef.current.find((x) => x.id === convId);
        if (c) openConversation(c);
      });
    }
  }

  function onMessageError(evt) {
    // Mark the matching optimistic message as failed.
    setMessagesByConv((m) => {
      const out = { ...m };
      for (const cid of Object.keys(out)) {
        out[cid] = out[cid].map((x) =>
          x.client_id === evt.client_id ? { ...x, sending: false, error: true } : x
        );
      }
      return out;
    });
  }

  function onRead(evt) {
    if (evt.reader_id === me.id) return;
    setMessagesByConv((m) => {
      const list = m[evt.conversation_id];
      if (!list) return m;
      const at = evt.read_at;
      return {
        ...m,
        [evt.conversation_id]: list.map((msg) =>
          msg.is_mine && !msg.is_read && msg.created_at <= at ? { ...msg, is_read: true } : msg
        ),
      };
    });
  }

  function onTyping(evt) {
    const cid = evt.conversation_id;
    setTyping((t) => ({ ...t, [cid]: evt.is_typing }));
    clearTimeout(typingTimers.current[cid]);
    if (evt.is_typing) {
      typingTimers.current[cid] = setTimeout(
        () => setTyping((t) => ({ ...t, [cid]: false })),
        5000
      );
    }
  }

  function onChatRequest(evt) {
    playPing();
    showNotification(
      "Новый запрос на чат",
      `${evt.from_nickname} хочет начать чат`,
      () => window.focus()
    );
    refreshRequests();
  }

  function onChatStatus(evt) {
    if (evt.status === "accepted") {
      refreshConversations();
    } else if (evt.status === "declined") {
      setConversations((cs) => cs.filter((c) => c.id !== evt.conversation_id));
      setRequests((rs) => rs.filter((r) => r.id !== evt.conversation_id));
      if (activeIdRef.current === evt.conversation_id) setActiveId(null);
    }
  }

  // --- actions --------------------------------------------------------
  async function openConversation(conv) {
    setActiveId(conv.id);
    socketRef.current?.send({ type: "subscribe", conversation_id: conv.id });
    if (!loadedHistory.current.has(conv.id)) {
      try {
        const data = await api.messages(conv.id, {});
        loadedHistory.current.add(conv.id);
        setHasMore((h) => ({ ...h, [conv.id]: data.has_more }));
        setMessagesByConv((m) => ({ ...m, [conv.id]: mergeMessages(m[conv.id], data.results) }));
      } catch {
        setMessagesByConv((m) => ({ ...m, [conv.id]: m[conv.id] || [] }));
      }
    }
    markRead(conv.id);
    setConversations((cs) => cs.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c)));
  }

  async function loadOlder(convId) {
    const list = messagesByConv[convId] || [];
    const oldestReal = list.find((x) => !String(x.id).startsWith("tmp_"));
    if (!oldestReal) return;
    try {
      const data = await api.messages(convId, { before: oldestReal.created_at });
      setHasMore((h) => ({ ...h, [convId]: data.has_more }));
      setMessagesByConv((m) => ({ ...m, [convId]: mergeMessages(data.results, m[convId]) }));
    } catch {}
  }

  function markRead(convId) {
    if (!socketRef.current?.send({ type: "read", conversation_id: convId })) {
      api.markRead(convId).catch(() => {});
    }
  }

  async function addContact(code) {
    const conv = await api.addContact(code);
    setConversations((cs) => (cs.some((c) => c.id === conv.id) ? cs : sortConvs([conv, ...cs])));
    openConversation(conv);
    return conv;
  }

  async function acceptRequest(convId) {
    try {
      await api.acceptRequest(convId);
    } catch {}
    setRequests((rs) => rs.filter((r) => r.id !== convId));
    await refreshConversations();
    const c = conversationsRef.current.find((x) => x.id === convId);
    if (c) openConversation(c);
  }

  async function declineRequest(convId) {
    try {
      await api.declineRequest(convId);
    } catch {}
    setRequests((rs) => rs.filter((r) => r.id !== convId));
  }

  function sendMessage(convId, payload) {
    const client_id = newClientId();
    const now = new Date().toISOString();
    const optimistic = {
      id: "tmp_" + client_id,
      client_id,
      conversation_id: convId,
      sender_id: me.id,
      sender_nickname: me.nickname,
      text: payload.text || "",
      attachments: payload.optimisticAttachments || [],
      reply_to: payload.replyToPreview || null,
      is_read: false,
      is_mine: true,
      created_at: now,
      sending: true,
    };
    setMessagesByConv((m) => ({ ...m, [convId]: [...(m[convId] || []), optimistic] }));
    setConversations((cs) =>
      sortConvs(cs.map((c) => (c.id === convId ? { ...c, last_message: optimistic, last_activity: now } : c)))
    );

    const body = {
      conversation_id: convId,
      text: payload.text || "",
      reply_to: payload.reply_to || null,
      upload_ids: payload.upload_ids || [],
      client_id,
    };
    const sent = socketRef.current?.send({ type: "message", ...body });
    if (!sent) {
      api.sendMessage(convId, body).then(onIncomingMessage).catch(() => onMessageError({ client_id }));
    }
  }

  function sendTyping(convId, isTyping) {
    socketRef.current?.send({ type: "typing", conversation_id: convId, is_typing: isTyping });
  }

  // --- derived --------------------------------------------------------
  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );

  function peerPresence(conv) {
    const pid = conv?.peer?.id;
    if (!pid) return null;
    return presence[pid] || { is_online: conv.peer.is_online, last_seen: conv.peer.last_seen };
  }

  // Composer is locked while an invite is awaiting confirmation.
  const composerLocked = activeConv?.pending;
  const lockReason = activeConv?.pending
    ? activeConv.is_initiator
      ? "Ожидаем, пока собеседник подтвердит чат…"
      : "Подтвердите чат, чтобы начать переписку."
    : "";

  return (
    <div className="h-full flex">
      <Sidebar
        me={me}
        setMe={setMe}
        conversations={conversations}
        activeId={activeId}
        onOpen={openConversation}
        onAddContact={addContact}
        onLogout={onLogout}
        wsOnline={wsOnline}
        peerPresence={peerPresence}
        requestCount={requests.length}
      />
      <ChatWindow
        me={me}
        conv={activeConv}
        messages={activeConv ? messagesByConv[activeConv.id] || [] : []}
        peerPresence={activeConv ? peerPresence(activeConv) : null}
        peerTyping={activeConv ? !!typing[activeConv.id] : false}
        hasMore={activeConv ? !!hasMore[activeConv.id] : false}
        onLoadOlder={activeConv ? () => loadOlder(activeConv.id) : undefined}
        onSend={sendMessage}
        onTyping={sendTyping}
        onBack={() => setActiveId(null)}
        composerLocked={composerLocked}
        lockReason={lockReason}
      />
      {requests.length > 0 && (
        <RequestModal
          request={requests[0]}
          remaining={requests.length - 1}
          onAccept={() => acceptRequest(requests[0].id)}
          onDecline={() => declineRequest(requests[0].id)}
        />
      )}
    </div>
  );
}
