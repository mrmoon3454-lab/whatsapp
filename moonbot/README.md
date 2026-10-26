# 🌙 MRMOON22 WhatsApp Bot

Baileys দিয়ে বানানো WhatsApp bot — static pairing code সহ।

## Features
- 🔒 Static pairing code: `MRMOON22`
- 📱 Linked Devices-এ নাম: `MRMOON22`
- 🏓 ping-pong, help, info কমান্ড
- ♻️ Auto-reconnect
- 🌐 HTTP health check
- 💾 Session persist

## Setup

```bash
npm install
# config.js-এ phoneNumber বসান
npm start
```

## Pairing (প্রথমবার)

1. `npm start` চালান
2. টার্মিনালে কোড দেখাবে: `MRMO-ON22`
3. ফোনে: WhatsApp → Settings → Linked Devices → Link a Device → **"Link with phone number instead"**
4. টাইপ করুন: `MRMOON22` (দাশ ছাড়া)

## Commands

| Command | কাজ |
|---------|-----|
| `ping` | pong |
| `help` | কমান্ড লিস্ট |
| `info` | বটের তথ্য |
| `.restart` | রিস্টার্ট (owner) |
| `.shutdown` | বন্ধ (owner) |

## Notes
- Pairing code `MRMOON22` — কখনো বদলাবে না
- `auth_info/` ফোল্ডার কাউকে দেবেন না
- আলাদা WhatsApp নম্বর ব্যবহার করুন
