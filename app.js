const socket = io();

let chatList = [];
let contactList = [];
let currentChatId = null;
let renderedMessageIds = new Set();

const statusElement = document.getElementById("status");
const qrElement = document.getElementById("qr");
const chatsElement = document.getElementById("chats");
const contactsElement = document.getElementById("contacts");
const messagesElement = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");

function setStatus(text, connected = false) {
  if (!statusElement) return;

  statusElement.textContent = text;
  statusElement.dataset.connected = connected ? "true" : "false";
}

function showQr(qr) {
  if (!qrElement) {
    console.error('Missing element with id="qr"');
    return;
  }

  qrElement.replaceChildren();
  qrElement.hidden = false;

  if (typeof QRCode === "undefined") {
    qrElement.textContent =
      "QR library missing. Load a QRCode library in index.html.";
    return;
  }

  new QRCode(qrElement, {
    text: qr,
    width: 240,
    height: 240,
    correctLevel: QRCode.CorrectLevel.M
  });
}

function hideQr() {
  if (qrElement) {
    qrElement.replaceChildren();
    qrElement.hidden = true;
  }
}

socket.on("connect", () => {
  console.log("Connected to dashboard server.");
});

socket.on("disconnect", () => {
  setStatus("Dashboard disconnected. Reconnecting...");
});

socket.on("connection-status", (status) => {
  if (status.connected) {
    setStatus("WhatsApp Connected", true);
    hideQr();
  } else if (status.connecting) {
    setStatus("Connecting to WhatsApp...");
  } else {
    setStatus("WhatsApp Disconnected");
  }
});

socket.on("qr", (qr) => {
  setStatus("Scan QR code to link WhatsApp");
  showQr(qr);
});

socket.on("logged-out", () => {
  setStatus("WhatsApp logged out. Restart linking to continue.");
});

socket.on("server-error", (message) => {
  setStatus(message);
  console.error(message);
});

socket.on("chats", (items) => {
  chatList = Array.isArray(items) ? items : [];
  renderChats();
});

socket.on("contacts", (items) => {
  contactList = Array.isArray(items) ? items : [];
  renderContacts();
});

socket.on("new-message", (message) => {
  if (message.chatId === currentChatId) {
    renderMessage(message);
  }

  renderChats();
});

function renderChats() {
  if (!chatsElement) return;

  chatsElement.replaceChildren();

  if (chatList.length === 0) {
    const empty = document.createElement("p");
    empty.textContent =
      "Your chats will appear here after history synchronization or new messages.";
    chatsElement.appendChild(empty);
    return;
  }

  chatList.sort((a, b) => {
    return Number(b.timestamp || 0) - Number(a.timestamp || 0);
  });

  for (const chat of chatList) {
    if (!chat.id) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-item";
    button.dataset.chatId = chat.id;

    const title = document.createElement("strong");
    title.textContent = chat.name || chat.subject || chat.id;

    const preview = document.createElement("span");
    preview.textContent = chat.lastMessage || "Open chat";

    button.append(title, preview);

    if (chat.id === currentChatId) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => {
      selectChat(chat.id);
    });

    chatsElement.appendChild(button);
  }
}

function renderContacts() {
  if (!contactsElement) return;

  contactsElement.replaceChildren();

  if (contactList.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No contacts received yet.";
    contactsElement.appendChild(empty);
    return;
  }

  for (const contact of contactList) {
    if (!contact.id) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "contact-item";

    button.textContent =
      contact.name ||
      contact.notify ||
      contact.verifiedName ||
      contact.id;

    button.addEventListener("click", () => {
      selectChat(contact.id);
    });

    contactsElement.appendChild(button);
  }
}

function selectChat(jid) {
  currentChatId = jid;
  renderedMessageIds.clear();

  if (messagesElement) {
    messagesElement.replaceChildren();
  }

  if (messageInput) {
    messageInput.disabled = false;
  }

  if (sendButton) {
    sendButton.disabled = false;
  }

  socket.emit("get-messages", { jid }, (messages) => {
    if (!Array.isArray(messages)) return;

    for (const message of messages) {
      renderMessage(message);
    }
  });

  renderChats();
}

function renderMessage(message) {
  if (!messagesElement || !message) return;

  if (message.chatId !== currentChatId) return;

  if (message.id && renderedMessageIds.has(message.id)) {
    return;
  }

  if (message.id) {
    renderedMessageIds.add(message.id);
  }

  const element = document.createElement("div");

  element.className = message.fromMe
    ? "message message-outgoing"
    : "message message-incoming";

  element.textContent =
    message.text || "[Unsupported message type]";

  messagesElement.appendChild(element);
  messagesElement.scrollTop = messagesElement.scrollHeight;
}

function sendMessage() {
  if (!currentChatId) {
    alert("প্রথমে একটি chat নির্বাচন করো।");
    return;
  }

  if (!messageInput) return;

  const text = messageInput.value.trim();

  if (!text) return;

  if (sendButton) {
    sendButton.disabled = true;
  }

  socket.emit(
    "send-message",
    {
      jid: currentChatId,
      text
    },
    (result) => {
      if (sendButton) {
        sendButton.disabled = false;
      }

      if (result?.success) {
        messageInput.value = "";
      } else {
        alert(result?.error || "মেসেজ পাঠানো যায়নি।");
      }
    }
  );
}

if (sendButton) {
  sendButton.addEventListener("click", sendMessage);
  sendButton.disabled = true;
}

if (messageInput) {
  messageInput.disabled = true;

  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendMessage();
    }
  });
}

hideQr();
setStatus("Starting... Checking WhatsApp session");
