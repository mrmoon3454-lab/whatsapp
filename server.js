const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT || 10000);
const HOST = "0.0.0.0";

app.use(express.json());
app.use(express.static(path.join(__dirname)));

let sock;
let isConnecting = false;
let isConnected = false;
let chats = [];
let contacts = [];

app.get("/api/status", (req, res) => {
  res.json({
    connected: isConnected,
    connecting: isConnecting
  });
});

app.get("/api/chats", (req, res) => {
  res.json(chats);
});

app.get("/api/contacts", (req, res) => {
  res.json(contacts);
});

async function startWhatsApp() {
  if (isConnecting) return;

  isConnecting = true;
  io.emit("connection-status", {
    connected: isConnected,
    connecting: true
  });

  try {
    const { state, saveCreds } =
      await useMultiFileAuthState("auth_info_baileys");

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ["Chat Dashboard", "Chrome", "1.0.0"]
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        io.emit("qr", qr);
      }

      if (connection === "open") {
        isConnected = true;
        isConnecting = false;

        io.emit("connection-status", {
          connected: true,
          connecting: false
        });

        try {
          const result = await sock.groupFetchAllParticipating();
          chats = Object.values(result).map(group => ({
            id: group.id,
            name: group.subject || group.id,
            isGroup: true
          }));

          io.emit("chats", chats);
        } catch (error) {
          console.error("Group fetch error:", error.message);
        }
      }

      if (connection === "close") {
        isConnected = false;
        isConnecting = false;

        io.emit("connection-status", {
          connected: false,
          connecting: false
        });

        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        if (statusCode !== DisconnectReason.loggedOut) {
          setTimeout(startWhatsApp, 5000);
        } else {
          io.emit("logged-out");
        }
      }
    });

    sock.ev.on("contacts.upsert", (items) => {
      for (const contact of items) {
        const index = contacts.findIndex(c => c.id === contact.id);

        if (index >= 0) {
          contacts[index] = {
            ...contacts[index],
            ...contact
          };
        } else {
          contacts.push(contact);
        }
      }

      io.emit("contacts", contacts);
    });

    sock.ev.on("messages.upsert", ({ messages }) => {
      for (const message of messages) {
        if (!message.message || !message.key.remoteJid) continue;

        const jid = message.key.remoteJid;
        const text =
          message.message.conversation ||
          message.message.extendedTextMessage?.text ||
          "";

        const item = {
          id: message.key.id,
          chatId: jid,
          fromMe: Boolean(message.key.fromMe),
          text,
          timestamp: Number(message.messageTimestamp || Date.now() / 1000)
        };

        io.emit("new-message", item);
      }
    });

  } catch (error) {
    isConnecting = false;
    console.error("WhatsApp startup error:", error);
    io.emit("server-error", "WhatsApp connection could not start.");
  }
}

io.on("connection", (socket) => {
  socket.emit("connection-status", {
    connected: isConnected,
    connecting: isConnecting
  });

  socket.emit("chats", chats);
  socket.emit("contacts", contacts);

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

      if (jid.endsWith("@g.us")) {
        // Group JID is accepted for group messages.
      } else if (!jid.endsWith("@s.whatsapp.net")) {
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
  console.log(`Dashboard server running on port ${PORT}`);
  startWhatsApp();
});
