// index.js — MRMOON22 WhatsApp Bot (Baileys + Static Pair Code)
import * as baileys from '@whiskeysockets/baileys';
const makeWASocket = baileys.default || baileys.makeWASocket;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
} = baileys;

import { Boom } from '@hapi/boom';
import pino from 'pino';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

const logger = pino({ level: 'silent' });
let sock = null;
let isStarting = false;

// ═════════════════════════════════════════════════════
// 🌐 Health Check Server (Render/Railway-এর জন্য)
// ═════════════════════════════════════════════════════
http
  .createServer((req, res) => {
    const online = !!sock?.user;
    res.writeHead(online ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        bot: config.botName,
        status: online ? 'online' : 'offline',
        jid: sock?.user?.id || null,
        uptime: Math.floor(process.uptime()) + 's',
      })
    );
  })
  .listen(config.port, () => {
    console.log(`🌐 Health check: http://localhost:${config.port}`);
  });

// ═════════════════════════════════════════════════════
// 🚀 বট শুরু
// ═════════════════════════════════════════════════════
async function startBot() {
  if (isStarting) return;
  isStarting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`\n🚀 ${config.botName} চালু হচ্ছে... (Baileys v${version.join('.')})`);

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

    // ────── Pairing Code (শুধু প্রথমবার) ──────
    if (!sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          console.log('\n⏳ Static pairing code চাওয়া হচ্ছে...');

          // ২য় প্যারামিটার = STATIC code (MRMOON22)
          const code = await sock.requestPairingCode(
            config.phoneNumber,
            config.pairCode
          );

          const pretty = code.match(/.{1,4}/g)?.join('-') || code;

          console.log('\n╔═══════════════════════════════════════════════╗');
          console.log(`║   📱 PAIRING CODE:  ${pretty.padEnd(20)}     ║`);
          console.log('╚═══════════════════════════════════════════════╝');
          console.log('\n📋 ফোনে যা করবেন:');
          console.log('   1. WhatsApp খুলুন');
          console.log('   2. Settings → Linked Devices');
          console.log('   3. "Link a Device" চাপুন');
          console.log('   4. "Link with phone number instead" সিলেক্ট করুন');
          console.log(`   5. কোড টাইপ করুন: ${config.pairCode}`);
          console.log(`\n   ⏱️  ~60 সেকেন্ডে expire হবে — দ্রুত টাইপ করুন!`);
          console.log(`   📱 Linked Devices-এ নাম: "${config.botName}"\n`);
        } catch (err) {
          console.error('\n❌ Pairing code পাওয়া যায়নি:', err.message);
          console.error('   চেক করুন: phoneNumber = 8801XXXXXXXXX (দেশের কোড, + ছাড়া)\n');
        }
      }, 3000);
    }

    // ────── Connection update ──────
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'close') {
        const statusCode =
          lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output?.statusCode
            : 0;

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('\n❌ Logged out! ফোন থেকে unlink হয়েছে।');
          console.log('   → auth_info/ ডিলিট করে আবার চালান\n');
          try {
            fs.rmSync(config.sessionDir, { recursive: true, force: true });
          } catch {}
          process.exit(1);
        } else {
          console.log(`\n🔄 Connection closed (${statusCode}) — 3s পরে reconnect...`);
          isStarting = false;
          setTimeout(() => startBot(), 3000);
        }
      } else if (connection === 'open') {
        isStarting = false;
        console.log('\n╔═══════════════════════════════════════════╗');
        console.log('║   ✅ MRMOON22 Bot CONNECTED!              ║');
        console.log('╚═══════════════════════════════════════════╝');
        console.log(`   JID: ${sock.user?.id}`);
        console.log(`   Device Name: ${config.botName}`);
        console.log(`   Session: ${config.sessionDir}/\n`);
        console.log('   🏓 "ping" লিখে টেস্ট করুন\n');
      }
    });

    // ────── মেসেজ হ্যান্ডলার ──────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const m of messages) {
        try {
          if (!m.message) continue;
          if (m.key.fromMe) continue;
          if (m.key.remoteJid === 'status@broadcast') continue;

          const from = m.key.remoteJid;
          const sender = jidNormalizedUser(m.key.participant || m.key.remoteJid);
          const senderNum = sender.split('@')[0].split(':')[0];

          const text =
            m.message.conversation ||
            m.message.extendedTextMessage?.text ||
            m.message.imageMessage?.caption ||
            m.message.videoMessage?.caption ||
            '';

          if (!text) continue;

          console.log(`📩 ${senderNum}: ${text}`);

          const body = text.trim().toLowerCase();
          const isOwner = config.ownerNumbers.some((n) => senderNum === n);

          // ping
          if (body === 'ping') {
            await sock.sendMessage(from, { text: 'pong 🏓' }, { quoted: m });
            continue;
          }

          // help
          if (body === 'help' || body === `${config.prefix}help`) {
            const help =
              `╭─「 *${config.botName}* 」─╮\n` +
              `│\n` +
              `│ 🏓 *ping*  → pong\n` +
              `│ 📖 *help*  → কমান্ড লিস্ট\n` +
              `│ ℹ️  *info*  → বটের তথ্য\n` +
              (isOwner
                ? `│ 🔄 *${config.prefix}restart* → রিস্টার্ট\n` +
                  `│ 🔌 *${config.prefix}shutdown* → বন্ধ\n`
                : '') +
              `╰───────────────────────╯`;
            await sock.sendMessage(from, { text: help }, { quoted: m });
            continue;
          }

          // info
          if (body === 'info' || body === `${config.prefix}info`) {
            const info =
              `🤖 *Bot Info*\n\n` +
              `Name: ${config.botName}\n` +
              `Number: ${sock.user?.id?.split(':')[0]}\n` +
              `Uptime: ${Math.floor(process.uptime())}s\n` +
              `Node: ${process.version}`;
            await sock.sendMessage(from, { text: info }, { quoted: m });
            continue;
          }

          // Owner commands
          if (isOwner && body === `${config.prefix}shutdown`) {
            await sock.sendMessage(from, { text: '🔌 বন্ধ হচ্ছে...' }, { quoted: m });
            setTimeout(() => process.exit(0), 800);
            continue;
          }

          if (isOwner && body === `${config.prefix}restart`) {
            await sock.sendMessage(from, { text: '🔄 রিস্টার্ট হচ্ছে...' }, { quoted: m });
            setTimeout(() => process.exit(1), 800);
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

// ═════════════════════════════════════════════════════
startBot();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 বন্ধ হচ্ছে...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('\n👋 Terminating...');
  process.exit(0);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err?.message || err);
});
