const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT || 10000);
const HOST = "0.0.0.0";

const AUTH_DIR = path.join(__dirname, "auth_info_baileys");

app.use(express.json());
app.use(express.static(__dirname));

let sock = null;
let isConnected = false;
let isConnecting = false;
let reconnectTimer = null;
let shouldReconnect = true;

const chats = new Map();
const contacts = new Map();
const messageHistory = new Map();

app.get("/api/status", (req, res) => {
  res.json({
    connected: isConnected,
    connecting: isConnecting
  });
});

app.get("/api/chats", (req, res) => {
  res.json(Array.from(chats.values()));
});

app.get("/api/contacts", (req, res) => {
  res.json(Array.from(contacts.values()));
});

function emitStatus() {
  io.emit("connection-status", {
    connected: isConnected,
    connecting: isConnecting
  });
}

function getMessageText(message) {
  if (!message) return "";

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    ""
  );
}

function saveMessage(message) {
  const jid = message?.key?.remoteJid;

  if (!jid || !message.message) return;

  // Ignore status broadcasts.
  if (jid === "status@broadcast") return;

  const text = getMessageText(message.message);
  const messageId = message.key.id || `${Date.now()}`;

  const item = {
    id: messageId,
    chatId: jid,
    fromMe: Boolean(message.key.fromMe),
    text,
    timestamp: Number(message.messageTimestamp || Date.now() / 1000)
  };

  if (!messageHistory.has(jid)) {
    messageHistory.set(jid, []);
  }

  const history = messageHistory.get(jid);

  if (!history.some((existing) => existing.id === item.id)) {
    history.push(item);

    // Keep memory usage bounded.
    if (history.length > 200) {
      history.shift();
    }
  }

  const existingChat = chats.get(jid) || {
    id: jid,
    name: jid,
    unreadCount: 0
  };

  const contact = contacts.get(jid);

  existingChat.name =
    existingChat.name !== jid
      ? existingChat.name
      : contact?.name || contact?.notify || jid;

  existingChat.lastMessage = text || "[Unsupported message]";
  existingChat.timestamp = item.timestamp;

  if (!item.fromMe) {
    existingChat.unreadCount =
      Number(existingChat.unreadCount || 0) + 1;
  }

  chats.set(jid, existingChat);

  io.emit("new-message", item);
  io.emit("chats", Array.from(chats.values()));
}

async function startWhatsApp() {
  if (isConnecting || isConnected) return;

  isConnecting = true;
  emitStatus();

  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true });

    const { state, saveCreds } =
      await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ["Personal Chat Dashboard", "Chrome", "1.0.0"],
      syncFullHistory: true,
      markOnlineOnConnect: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr) {
        console.log("WhatsApp QR code generated.");
        io.emit("qr", qr);
      }

      if (connection === "connecting") {
        isConnecting = true;
        isConnected = false;
        emitStatus();
      }

      if (connection === "open") {
        isConnected = true;
        isConnecting = false;

        console.log("WhatsApp connected successfully.");

        emitStatus();
      }

      if (connection === "close") {
        isConnected = false;
        isConnecting = false;

        emitStatus();

        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        console.log(
          "WhatsApp connection closed:",
          statusCode || "unknown status"
        );

        if (
          shouldReconnect &&
          statusCode !== DisconnectReason.loggedOut
        ) {
          clearTimeout(reconnectTimer);

          reconnectTimer = setTimeout(() => {
            startWhatsApp();
          }, 5000);
        } else if (statusCode === DisconnectReason.loggedOut) {
          io.emit("logged-out");
          console.log(
            "WhatsApp logged out. Re-linking is required."
          );
        }
      }
    });

    sock.ev.on("contacts.upsert", (items) => {
      for (const contact of items) {
        if (!contact.id) continue;

        const old = contacts.get(contact.id) || {};

        const updated = {
          ...old,
          ...contact
        };

        contacts.set(contact.id, updated);

        const existingChat = chats.get(contact.id);

        if (existingChat) {
          existingChat.name =
            updated.name ||
            updated.notify ||
            existingChat.name;

          chats.set(contact.id, existingChat);
        }
      }

      io.emit("contacts", Array.from(contacts.values()));
      io.emit("chats", Array.from(chats.values()));
    });

    sock.ev.on("contacts.update", (items) => {
      for (const contact of items) {
        if (!contact.id) continue;

        const old = contacts.get(contact.id) || {};

        contacts.set(contact.id, {
          ...old,
          ...contact
        });
      }

      io.emit("contacts", Array.from(contacts.values()));
    });

    sock.ev.on("messaging-history.set", (data) => {
      const historyContacts = data.contacts || [];
      const historyChats = data.chats || [];
      const historyMessages = data.messages || [];

      for (const contact of historyContacts) {
        if (contact.id) {
          contacts.set(contact.id, {
            ...contacts.get(contact.id),
            ...contact
          });
        }
      }

      for (const chat of historyChats) {
        if (!chat.id) continue;

        const contact = contacts.get(chat.id);

        chats.set(chat.id, {
          ...chats.get(chat.id),
          ...chat,
          id: chat.id,
          name:
            chat.name ||
            contact?.name ||
            contact?.notify ||
            chat.id
        });
      }

      for (const message of historyMessages) {
        saveMessage(message);
      }

      io.emit("contacts", Array.from(contacts.values()));
      io.emit("chats", Array.from(chats.values()));

      console.log("WhatsApp history synchronization received.");
    });

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      for (const message of messages || []) {
        saveMessage(message);
      }

      if (type === "notify") {
        io.emit("chats", Array.from(chats.values()));
      }
    });

    sock.ev.on("chats.upsert", (items) => {
      for (const chat of items) {
        if (!chat.id) continue;

        const contact = contacts.get(chat.id);
        const old = chats.get(chat.id) || {};

        chats.set(chat.id, {
          ...old,
          ...chat,
          id: chat.id,
          name:
            chat.name ||
            contact?.name ||
            contact?.notify ||
            old.name ||
            chat.id
        });
      }

      io.emit("chats", Array.from(chats.values()));
    });

    sock.ev.on("chats.update", (items) => {
      for (const chat of items) {
        if (!chat.id) continue;

        const old = chats.get(chat.id) || {};

        chats.set(chat.id, {
          ...old,
          ...chat,
          id: chat.id
        });
      }

      io.emit("chats", Array.from(chats.values()));
    });

    sock.ev.on("groups.upsert", (groups) => {
      for (const group of groups) {
        if (!group.id) continue;

        chats.set(group.id, {
          ...chats.get(group.id),
          ...group,
          id: group.id,
          name: group.subject || group.id,
          isGroup: true
        });
      }

      io.emit("chats", Array.from(chats.values()));
    });

  } catch (error) {
    isConnected = false;
    isConnecting = false;

    emitStatus();

    console.error("WhatsApp startup error:", error.message);

    io.emit(
      "server-error",
      "WhatsApp connection could not start. Check Render logs."
    );

    clearTimeout(reconnectTimer);

    if (shouldReconnect) {
      reconnectTimer = setTimeout(startWhatsApp, 10000);
    }
  }
}

io.on("connection", (socket) => {
  console.log("Dashboard client connected:", socket.id);

  socket.emit("connection-status", {
    connected: isConnected,
    connecting: isConnecting
  });

  socket.emit("chats", Array.from(chats.values()));
  socket.emit("contacts", Array.from(contacts.values()));

  socket.on("get-messages", (data, callback) => {
    const jid = String(data?.jid || "");
    const messages = messageHistory.get(jid) || [];

    if (typeof callback === "function") {
      callback(messages);
    }
  });

  socket.on("send-message", async (data, callback) => {
    try {
      if (!sock || !isConnected) {
        throw new Error("WhatsApp is not connected.");
      }

      const jid = String(data?.jid || "");
      const text = String(data?.text || "").trim();

      if (!jid || !text) {
        throw new Error("Chat ID and message are required.");
      }

      if (
        !jid.endsWith("@s.whatsapp.net") &&
        !jid.endsWith("@g.us")
      ) {
        throw new Error("Invalid chat ID.");
      }

      await sock.sendMessage(jid, { text });

      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (error) {
      if (typeof callback === "function") {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Dashboard listening on ${HOST}:${PORT}`);
  startWhatsApp();
});

process.on("SIGTERM", () => {
  shouldReconnect = false;
  clearTimeout(reconnectTimer);

  if (sock) {
    sock.end(undefined);
  }

  server.close(() => {
    process.exit(0);
  });
});
