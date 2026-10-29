const { Telegraf, Markup } = require('telegraf');
const { ADMIN_ID } = require('./config');
const M = require('./models');
const promoSvc = require('./promo');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(async (ctx, next) => {
  if (ctx.from) {
    await M.User.updateOne(
      { tgId: ctx.from.id },
      { $set: { name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '), lastSeen: new Date() } },
      { upsert: true }
    ).catch(() => {});
  }
  return next();
});

bot.start(async (ctx) => {
  const webAppUrl = process.env.BASE_URL || 'https://hitoydanzakaz-production.up.railway.app';
  await ctx.reply(
    `<b>Xitoydan O'zbekistonga ishonchli yetkazib beriladigan minglab mahsulotlar.</b>\n\nQuyidagi tugmani bosib do'konni oching.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.webApp("🛍 Do'konni ochish", webAppUrl)]
      ])
    }
  );
});

// Sotuvchi yoki Admin uchun promo-kod qo'shish buyrug'i: /addpromo KOD PERCENT FOIZ LIMIT
bot.command('addpromo', async (ctx) => {
  const userId = ctx.from.id;
  const isAdmin = String(userId) === String(ADMIN_ID);
  const isSeller = await M.Seller.exists({ tgId: userId });

  if (!isAdmin && !isSeller) {
    return ctx.reply("⚠️ Bu buyruq faqat sotuvchi va adminlar uchun!");
  }

  const args = ctx.message.text.split(/\s+/).slice(1);
  if (args.length < 4) {
    return ctx.reply(
      `⚠️ <b>Xato format!</b>\n\nTo‘g‘ri ishlatish:\n<code>/addpromo KOD percent FOIZ LIMIT</code>\n\nMisol: <code>/addpromo SALE percent 10 50</code> (10% skidka, 50 ta limit)`,
      { parse_mode: 'HTML' }
    );
  }

  const [codeRaw, typeRaw, valStr, limitStr] = args;
  const code = promoSvc.normCode(codeRaw);
  const type = typeRaw === 'fixed' ? 'fixed' : 'percent';
  const value = parseInt(valStr, 10);
  const maxUses = parseInt(limitStr, 10);

  if (!promoSvc.validFormat(code)) {
    return ctx.reply("⚠️ Kod formati noto'g'ri (3-20 ta lotin harfi yoki raqam bo'lishi kerak).");
  }
  if (isNaN(value) || value <= 0) {
    return ctx.reply("⚠️ Skidka qiymati noto'g'ri raqamda kiritildi.");
  }
  if (type === 'percent' && value > 100) {
    return ctx.reply("⚠️ Foiz 1 dan 100 gacha bo'lishi kerak.");
  }
  if (isNaN(maxUses) || maxUses < 0) {
    return ctx.reply("⚠️ Limit raqami noto'g'ri.");
  }

  try {
    await M.PromoCode.create({
      code,
      type,
      value,
      maxUses,
      oncePerUser: true,
      active: true,
      used: 0
    });
    return ctx.reply(`✅ <b>Muvaffaqiyatli qo'shildi!</b>\n\n🎟 Kod: <code>${code}</code>\n🔥 Skidka: ${value}%`, { parse_mode: 'HTML' });
  } catch (e) {
    if (e && e.code === 11000) {
      return ctx.reply("⚠️ Bu promo-kod allaqachon mavjud!");
    }
    return ctx.reply("⚠️ Xatolik yuz berdi: " + e.message);
  }
});

module.exports = {
  bot,
  state: { id: 0 },
  async initBot() {
    const me = await bot.telegram.getMe();
    this.state.id = me.id;
    console.log(`Bot: @${me.username}`);
  },
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  async postToChannel(product, seller) {
    const webAppUrl = process.env.BASE_URL || 'https://hitoydanzakaz-production.up.railway.app';
    const text = `<b>📦 ${this.esc(product.title)}</b>\n\n💰 <b>Narxi:</b> ${Number(product.price).toLocaleString('en-US').replace(/,/g, ' ')} so'm\n\n${this.esc(product.description || '')}`;
    const msg = await bot.telegram.sendPhoto(seller.channel, { source: M.toBuf(product.image.data) }, {
      caption: text,
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.webApp("🛒 Buyurtma berish", `${webAppUrl}`)]
      ])
    });
    return msg.message_id;
  },
  async createOrder(data) {
    const product = data.product;
    let discount = 0;
    if (data.promo) {
      try {
        const r = await promoSvc.check(data.promo, data.buyer.id, product.price * data.qty);
        discount = r.discount;
      } catch (e) {
        throw e;
      }
    }
    const order = await M.Order.create({
      product: product._id,
      productTitle: product.title,
      productImage: product.image,
      seller: product.seller,
      buyer: data.buyer.id,
      name: data.name,
      phone: data.phone,
      region: data.region,
      district: data.district,
      price: product.price,
      qty: data.qty,
      discount,
      promo: data.promo || '',
      note: data.note,
      receipt: data.receipt,
      source: data.source,
      status: 'new'
    });

    const sellerDoc = await M.Seller.findOne({ tgId: product.seller }).lean();
    if (sellerDoc) {
      const total = product.price * data.qty - discount;
      const tmsg = `<b>🔔 Yangi buyurtma! (#${order._id})</b>\n\n` +
        `📦 <b>Mahsulot:</b> ${this.esc(product.title)}\n` +
        `🔢 <b>Soni:</b> ${data.qty} ta\n` +
        `💵 <b>Summasi:</b> ${Number(total).toLocaleString('en-US').replace(/,/g, ' ')} so'm ${discount ? `(Chegirma bilan)` : ''}\n\n` +
        `👤 <b>Mijoz:</b> ${this.esc(data.name)}\n` +
        `📞 <b>Telefon:</b> ${data.phone}\n` +
        `📍 <b>Manzil:</b> ${this.esc(data.region)}, ${this.esc(data.district)}\n` +
        (data.note ? `💬 <b>Izoh:</b> ${this.esc(data.note)}\n` : '');

      bot.telegram.sendMessage(sellerDoc.tgId, tmsg, { parse_mode: 'HTML' }).catch(() => {});
    }
    return order;
  }
};
