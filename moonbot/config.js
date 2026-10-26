// config.js — সব সেটিং এখানে
module.exports = {
  // ⚠️ Owner নম্বর (owner কমান্ডের জন্য)
  ownerNumbers: ['8801712345678'],

  // 🔒 STATIC pairing code (ঐচ্ছিক)
  pairCode: 'MRMOON22',

  // 📱 Linked Devices-এ যে নাম দেখাবে
  botName: 'MRMOON22',

  // 💾 Session ফাইল কোথায় রাখবে
  sessionDir: './auth_info',

  // 🎯 কমান্ড প্রিফিক্স
  prefix: '.',

  // 🌐 Health check এবং UI port
  port: process.env.PORT || 3000,
};
