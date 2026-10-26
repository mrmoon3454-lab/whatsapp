const socket = io();

let currentChatId = null;
let chatList = [];
let contactList = [];

const statusElement = document.getElementById("status");
const qrElement = document.getElementById("qr");
const chatsElement = document.getElementById("chats");
const contactsElement = document.getElementById("contacts");
const messagesElement = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");

socket.on("connect", () => {
  console.log("Dashboard connected to server.");
});

socket.on("connection-status", (status) => {
  if (statusElement) {
    if (status.connected) {
      statusElement.textContent = "WhatsApp Connected";
    } else if (status.connecting) {
      statusElement.textContent = "Connecting to WhatsApp...";
    } else {
      statusElement.textContent = "WhatsApp Disconnected";
    }
  }
});

socket.on("qr", (qr) => {
  if (!qrElement) return;

  qrElement.replaceChildren();

  if (typeof QRCode !== "undefined") {
    new QRCode(qrElement, {
      text: qr,
      width: 220,
      height: 220
    });
  } else {
    qrElement.textContent =
      "QR code library is missing. Add a QRCode library to index.html.";
  }
});

socket.on("logged-out", () => {
  if (statusElement) {
    statusElement.textContent =
      "Logged out. Restart the WhatsApp connection to link again.";
  }
});

socket.on("server-error", (message) => {
  console.error(message);

  if (statusElement) {
    statusElement.textContent = message;
  }
});

socket.on("chats", (chats) => {
  chatList = Array.isArray(chats) ? chats : [];
  renderChats();
});

socket.on("contacts", (contacts) => {
  contactList = Array.isArray(contacts) ? contacts : [];
  renderContacts();
});

socket.on("new-message", (message) => {
  if (message.chatId === currentChatId) {
    renderMessage(message);
  }
});

function renderChats() {
  if (!chatsElement) return;

  chatsElement.replaceChildren();

  chatList.forEach((chat) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-item";
    button.textContent = chat.name || chat.id;
    button.addEventListener("click", () => {
      currentChatId = chat.id;

      if (messagesElement) {
        messagesElement.replaceChildren();
      }

      document.querySelectorAll(".chat-item").forEach((item) => {
        item.classList.remove("active");
      });

      button.classList.add("active");

      if (messageInput) {
        messageInput.disabled = false;
      }

      if (sendButton) {
        sendButton.disabled = false;
      }
    });

    chatsElement.appendChild(button);
  });
}

function renderContacts() {
  if (!contactsElement) return;

  contactsElement.replaceChildren();

  contactList.forEach((contact) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "contact-item";
    button.textContent =
      contact.name || contact.notify || contact.id || "Unknown contact";

    button.addEventListener("click", () => {
      if (!contact.id) return;

      currentChatId = contact.id;

      if (messagesElement) {
        messagesElement.replaceChildren();
      }

      if (messageInput) {
        messageInput.disabled = false;
      }

      if (sendButton) {
        sendButton.disabled = false;
      }
    });

    contactsElement.appendChild(button);
  });
}

function renderMessage(message) {
  if (!messagesElement) return;

  const element = document.createElement("div");
  element.className = message.fromMe
    ? "message message-outgoing"
    : "message message-incoming";

  element.textContent = message.text || "[Unsupported message type]";

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

  socket.emit(
    "send-message",
    {
      jid: currentChatId,
      text
    },
    (result) => {
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
}

if (messageInput) {
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendMessage();
    }
  });

  messageInput.disabled = true;
}

if (sendButton) {
  sendButton.disabled = true;
}
