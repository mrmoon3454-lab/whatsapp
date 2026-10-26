// config.js — সব সেটিং এখানে
// ⚠️ শুধু নিচের ৩টা লাইন বদলান

export const config = {
  // ⚠️ আপনার বটের WhatsApp নম্বর (দেশের কোডসহ, + বা 0 ছাড়া)
  // বাংলাদেশি নম্বর হলে: 8801XXXXXXXXX
  phoneNumber: '8801712345678',

  // ⚠️ Owner নম্বর (owner কমান্ডের জন্য)
  ownerNumbers: ['8801712345678'],

  // 🔒 STATIC pairing code — কখনো বদলাবে না (৮ অক্ষর, A-Z 0-9)
  pairCode: 'MRMOON22',

  // 📱 Linked Devices-এ যে নাম দেখাবে
  botName: 'MRMOON22',

  // 💾 Session ফাইল কোথায় রাখবে (হাত দেবেন না)
  sessionDir: './auth_info',

  // 🎯 কমান্ড প্রিফিক্স
  prefix: '.',

  // 🌐 Health check port
  port: process.env.PORT || 3000,
};
