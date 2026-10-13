require('dotenv').config();
const crypto = require('crypto');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : '';
const BASE_URL = (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || railwayUrl || '').replace(/\/$/, '');

// Webhook yo'li tokendan hosil qilinadi (boshqalar topa olmasligi uchun)
const WEBHOOK_PATH =
  '/tg/' + crypto.createHash('sha256').update(BOT_TOKEN).digest('hex').slice(0, 24);

const REGIONS = [
  'Toshkent shahri',
  'Toshkent viloyati',
  'Andijon',
  'Buxoro',
  "Farg'ona",
  'Jizzax',
  'Xorazm',
  'Namangan',
  'Navoiy',
  'Qashqadaryo',
  "Qoraqalpog'iston",
  'Samarqand',
  'Sirdaryo',
  'Surxondaryo',
];

const DEFAULT_CATEGORIES = [
  { name: 'Elektronika', icon: '📱' },
  { name: 'Kiyim-kechak', icon: '👗' },
  { name: 'Poyabzal', icon: '👟' },
  { name: "Uy-ro'zg'or", icon: '🏠' },
  { name: "Go'zallik", icon: '💄' },
  { name: 'Bolalar uchun', icon: '🧸' },
  { name: 'Avto', icon: '🚗' },
  { name: 'Asboblar', icon: '🔧' },
  { name: 'Sport', icon: '⚽' },
  { name: 'Aksessuarlar', icon: '🎒' },
];

module.exports = {
  BOT_TOKEN,
  ADMIN_ID: Number(process.env.ADMIN_ID) || 0,
  MONGO_URI: process.env.MONGO_URI || '',
  BASE_URL,
  PORT: Number(process.env.PORT) || 3000,
  WEBHOOK_PATH,
  REGIONS,
  DEFAULT_CATEGORIES,
};
