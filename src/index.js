const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cfg = require('./config');
const { Category } = require('./models');
const { bot, initBot } = require('./bot');
const api = require('./api');

async function main() {
  // Muhim sozlamalarni tekshirish
  const missing = [];
  if (!cfg.BOT_TOKEN) missing.push('BOT_TOKEN');
  if (!cfg.ADMIN_ID) missing.push('ADMIN_ID');
  if (!cfg.MONGO_URI) missing.push('MONGO_URI');
  if (missing.length) {
    console.error('❌ Quyidagi sozlamalar yo\'q:', missing.join(', '));
    process.exit(1);
  }

  await mongoose.connect(cfg.MONGO_URI);
  console.log('✅ MongoDB ulandi');

  // Birinchi ishga tushishda standart bo'limlarni yaratish
  if ((await Category.countDocuments()) === 0) {
    await Category.insertMany(cfg.DEFAULT_CATEGORIES.map((c, i) => ({ ...c, order: i })));
    console.log("✅ Standart bo'limlar yaratildi");
  }

  await initBot();

  const app = express();
  app.set('trust proxy', 1);

  app.get('/health', (req, res) => res.send('ok'));

  // Telegram webhook (JSON parserdan oldin)
  const useWebhook = Boolean(cfg.BASE_URL);
  if (useWebhook) {
    app.use(bot.webhookCallback(cfg.WEBHOOK_PATH));
  }

  app.use(express.json({ limit: '4mb' }));
  app.use(api);
  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

  app.listen(cfg.PORT, () => console.log('🚀 Server port', cfg.PORT));

  if (useWebhook) {
    await bot.telegram.setWebhook(cfg.BASE_URL + cfg.WEBHOOK_PATH, {
      allowed_updates: ['message', 'callback_query'],
    });
    try {
      await bot.telegram.setChatMenuButton({
        menuButton: { type: 'web_app', text: "🛍 Do'kon", web_app: { url: cfg.BASE_URL } },
      });
    } catch (e) {
      console.warn('Menu tugmasi o\'rnatilmadi:', e.message);
    }
    console.log('✅ Webhook:', cfg.BASE_URL + cfg.WEBHOOK_PATH);
  } else {
    // Lokal test: BASE_URL yo'q bo'lsa polling
    await bot.telegram.deleteWebhook();
    bot.launch();
    console.log('ℹ️ Polling rejimi (BASE_URL sozlanmagan)');
  }

  process.once('SIGINT', () => process.exit(0));
  process.once('SIGTERM', () => process.exit(0));
}

main().catch((e) => {
  console.error('❌ Ishga tushmadi:', e);
  process.exit(1);
});
