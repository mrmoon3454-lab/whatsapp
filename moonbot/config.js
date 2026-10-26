// config.js — সব সেটিং এখানে
module.exports = {
  // ⚠️ আপনার বটের WhatsApp নম্বর (দেশের কোডসহ, + বা 0 ছাড়া)
  phoneNumber: '8801712345678',

  // ⚠️ Owner নম্বর (owner কমান্ডের জন্য)
  ownerNumbers: ['8801712345678'],

  // 🔒 STATIC pairing code
  pairCode: 'MRMOON22',

  // 📱 Linked Devices-এ যে নাম দেখাবে
  botName: 'MRMOON22',

  // 💾 Session ফাইল কোথায় রাখবে
  sessionDir: './auth_info',

  // 🎯 কমান্ড প্রিফিক্স
  prefix: '.',

  // 🌐 Health check port
  port: process.env.PORT || 3000,
};
