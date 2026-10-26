// index.js — MRMOON22 WhatsApp Bot with Web UI
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion, 
  makeCacheableSignalKeyStore, 
  jidNormalizedUser 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./config.js');

const logger = pino({ level: 'silent' });
let sock = null;
let isStarting = false;
let isConnecting = false;

// ═════════════════════════════════════════════════════
// 🌐 Web UI Server Setup (Express)
// ═════════════════════════════════════════════════════
const app = express();
app.use(express.json());

// HTML UI (Frontend)
const htmlUI = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MRMOON22 Bot Pairing</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .container { background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); width: 100%; max-width: 400px; text-align: center; }
        h1 { color: #10b981; margin-bottom: 10px; }
        p { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
        input { width: 100%; padding: 12px; margin: 10px 0; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; font-size: 16px; }
        button { width: 100%; padding: 12px; background: #10b981; color: #fff; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; font-weight: bold; transition: 0.3s; }
        button:hover { background: #059669; }
        button:disabled { background: #475569; cursor: not-allowed; }
        .code-box { display: none; margin-top: 20px; padding: 15px; background: #0f172a; border: 2px dashed #10b981; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #10b981; }
        .status { margin-top: 15px; font-size: 14px; font-weight: bold; }
        .error { color: #ef4444; }
        .success { color: #10b981; }
    </style>
</head>
<body>
    <div class="container">
        <h1>MRMOON22 Bot</h1>
        <p>Enter WhatsApp number to get pairing code</p>
        
        <input type="text" id="phone" placeholder="e.g. 8801712345678" />
        <button id="btn" onclick="getCode()">Get Pairing Code</button>
        
        <div id="codeBox" class="code-box"></div>
        <div id="status" class="status"></div>
    </div>

    <script>
        async function getCode() {
            const phone = document.getElementById('phone').value.trim();
            const btn = document.getElementById('btn');
            const status = document.getElementById('status');
            const codeBox = document.getElementById('codeBox');

            if (!phone) {
                status.innerHTML = '<span class="error">Please enter a phone number!</span>';
                return;
            }

            btn.disabled = true;
            status.innerHTML = '<span style="color:#f59e0b">Requesting code, please wait...</span>';
            codeBox.style.display = 'none';

            try {
                const res = await fetch('/api/pair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone })
                });
                
                const data = await res.json();
                
                if (data.error) {
                    status.innerHTML = '<span class="error">❌ ' + data.error + '</span>';
                } else {
                    status.innerHTML = '<span class="success">✅ Enter this code in WhatsApp:</span>';
                    codeBox.style.display = 'block';
                    codeBox.textContent = data.code;
                }
            } catch (err) {
                status.innerHTML = '<span class="error">❌ Server error. Try again.</span>';
            }
            
            btn.disabled = false;
        }
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(htmlUI));

app.get('/api/status', (req, res) => {
  const online = !!sock?.user;
  res.json({
    bot: config.botName,
    status: online ? 'online' : 'offline',
    jid: sock?.user?.id || null,
    uptime: Math.floor(process.uptime()) + 's'
  });
});

app.post('/api/pair', async (req, res) => {
  if (sock?.authState?.creds?.registered) {
    return res.json({ error: 'Bot is already linked to a device!' });
  }
  
  const { phone } = req.body;
  if (!phone) return res.json({ error: 'Phone number required' });

  try {
    console.log(`\n⏳ Requesting code for ${phone} via UI...`);
    const code = await sock.requestPairingCode(phone, config.pairCode);
    const formatted = code.match(/.{1,4}/g)?.join('-') || code;
    
    console.log(`✅ Pairing Code Generated: ${formatted}`);
    res.json({ code: formatted });
  } catch (err) {
    console.error('❌ Pairing Error:', err.message);
    res.json({ error: err.message || 'Failed to generate code' });
  }
});

app.listen(config.port, () => {
  console.log(`🌐 UI & Health check running on port ${config.port}`);
});

// ═════════════════════════════════════════════════════
// 🚀 WhatsApp Bot Setup
// ═════════════════════════════════════════════════════
async function startBot() {
  if (isStarting || isConnecting) return;
  isStarting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: [config.botName, 'Chrome', '1.0.0'],
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      getMessage: async () => undefined,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'close') {
        isConnecting = false;
        const statusCode = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : 0;

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('\n❌ Logged out! Unlinking device.');
          try { fs.rmSync(config.sessionDir, { recursive: true, force: true }); } catch {}
          process.exit(1);
        } else {
          console.log(`\n🔄 Connection closed (${statusCode}) — 3s Reconnecting...`);
          isStarting = false;
          setTimeout(() => startBot(), 3000);
        }
      } else if (connection === 'open') {
        isStarting = false;
        isConnecting = false;
        console.log('\n╔═══════════════════════════════════════════╗');
        console.log('║   ✅ MRMOON22 Bot CONNECTED!              ║');
        console.log('╚═══════════════════════════════════════════╝');
        console.log(`   JID: ${sock.user?.id}`);
        console.log('   🏓 "ping" লিখে টেস্ট করুন\n');
      }
    });

    // মেসেজ হ্যান্ডলার
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const m of messages) {
        try {
          if (!m.message || m.key.fromMe || m.key.remoteJid === 'status@broadcast') continue;

          const from = m.key.remoteJid;
          const sender = jidNormalizedUser(m.key.participant || m.key.remoteJid);
          const senderNum = sender.split('@')[0].split(':')[0];

          const text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || m.message.videoMessage?.caption || '';
          if (!text) continue;

          console.log(`📩 ${senderNum}: ${text}`);
          const body = text.trim().toLowerCase();
          const isOwner = config.ownerNumbers.some((n) => senderNum === n);

          if (body === 'ping') {
            await sock.sendMessage(from, { text: 'pong 🏓' }, { quoted: m });
            continue;
          }

          if (body === 'help' || body === `${config.prefix}help`) {
            const help = `╭─「 *${config.botName}* 」─╮\n│\n│ 🏓 *ping*  → pong\n│ 📖 *help*  → কমান্ড লিস্ট\n╰───────────────────────╯`;
            await sock.sendMessage(from, { text: help }, { quoted: m });
            continue;
          }
        } catch (err) {
          console.error('Handler error:', err.message);
        }
      }
    });
  } catch (err) {
    isStarting = false;
    console.error('❌ Start error:', err.message);
    setTimeout(() => startBot(), 5000);
  }
}

startBot();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
