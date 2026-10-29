const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const { BOT_TOKEN, ADMIN_ID, BASE_URL, REGIONS } = require('./config');
const { User, Product, Order, Image, Seller, toBuf } = require('./models');
const promoSvc = require('./promo');

const bot = new Telegraf(BOT_TOKEN);
const state = { id: 0, username: '' };

// ---------- yordamchi funksiyalar ----------
const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n) => Number(n || 0).toLocaleString('en-US').replace(/,/g, ' ') + " so'm";
const shortId = (id) => String(id).slice(-6).toUpperCase();

const STATUS_TEXT = {
  new: '🆕 Yangi',
  accepted: '✅ Qabul qilindi',
  rejected: '❌ Rad etildi',
  done: '🏁 Yakunlandi',
};

const fmtCard = (c) => String(c || '').replace(/(\d{4})(?=\d)/g, '$1 ');

async function saveTelegramPhoto(ctx, fileId) {
  const link = await ctx.telegram.getFileLink(fileId);
  const r = await fetch(String(link));
  if (!r.ok) throw new Error('Rasm yuklanmadi');
  const buf = Buffer.from(await r.arrayBuffer());
  const img = await Image.create({ data: buf, type: 'image/jpeg', private: true });
  return img._id;
}

function normPhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 9) return '+998' + digits;
  if (digits.length >= 10 && digits.length <= 15) return '+' + digits;
  return null;
}

async function touchUser(from) {
  if (!from) return;
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || 'Foydalanuvchi';
  await User.updateOne(
    { tgId: from.id },
    {
      $set: { name, username: from.username || '', lastSeen: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
}

// ---------- buyurtma xabari ----------
function orderText(o) {
  const total = (o.price || 0) * (o.qty || 1) - (o.discount || 0);
  const buyer = o.buyerUsername ? `@${esc(o.buyerUsername)}` : `ID ${o.buyer}`;
  return [
    `🆕 <b>Yangi buyurtma #${shortId(o._id)}</b>`,
    '',
    `📦 <b>${esc(o.productTitle)}</b>`,
    `💰 ${money(o.price)} × ${o.qty}`,
    o.discount ? `🎟 Promo ${esc(o.promo)}: −${money(o.discount)}` : null,
    `💵 Jami: <b>${money(total)}</b>`,
    '',
    `👤 Ism: ${esc(o.name)}`,
    `📞 Telefon: ${esc(o.phone)}`,
    `📍 Manzil: ${esc(o.region)}, ${esc(o.district)}`,
    o.note ? `📝 Izoh: ${esc(o.note)}` : null,
    `🔗 Telegram: ${buyer}`,
    `🌐 Manba: ${o.source === 'bot' ? 'Bot' : 'Web App'}`,
    o.receipt ? "💳 To'lov: chek yuborilgan (pastdagi rasm)" : null,
    '',
    `Holat: <b>${STATUS_TEXT[o.status] || o.status}</b>`,
  ]
    .filter((x) => x !== null)
    .join('\n');
}

function orderKeyboard(o) {
  const rows = [];
  if (o.status === 'new') {
    rows.push([
      Markup.button.callback('✅ Qabul qilish', `st:acc:${o._id}`),
      Markup.button.callback('❌ Rad etish', `st:rej:${o._id}`),
    ]);
  } else if (o.status === 'accepted') {
    rows.push([Markup.button.callback('🏁 Yakunlandi', `st:done:${o._id}`)]);
  }
  rows.push([Markup.button.url('👤 Mijoz bilan bog\'lanish', `tg://user?id=${o.buyer}`)]);
  return Markup.inlineKeyboard(rows);
}

async function sendOrderMessage(chatId, order) {
  const opts = { parse_mode: 'HTML', ...orderKeyboard(order) };
  const img = order.productImage ? await Image.findById(order.productImage).lean() : null;
  if (img) {
    return bot.telegram.sendPhoto(chatId, { source: toBuf(img.data) }, { caption: orderText(order), ...opts });
  }
  return bot.telegram.sendMessage(chatId, orderText(order), opts);
}

async function notifySeller(order) {
  try {
    await sendOrderMessage(order.seller, order);
    if (order.receipt) {
      const rc = await Image.findById(order.receipt).lean();
      if (rc) {
        await bot.telegram.sendPhoto(
          order.seller,
          { source: toBuf(rc.data) },
          { caption: `🧾 To'lov cheki — buyurtma #${shortId(order._id)}` }
        );
      }
    }
  } catch (e) {
    console.error('Sotuvchiga yuborib bo\'lmadi:', e.message);
    // Zaxira: adminga yuboramiz
    try {
      await bot.telegram.sendMessage(
        ADMIN_ID,
        `⚠️ Sotuvchiga (ID ${order.seller}) buyurtma yetkazilmadi. Sotuvchi botga /start bosmagan bo'lishi mumkin.`
      );
      await sendOrderMessage(ADMIN_ID, order);
    } catch (e2) {
      console.error('Adminga ham yuborib bo\'lmadi:', e2.message);
    }
  }
}

// Web App va Bot uchun umumiy buyurtma yaratish
async function createOrder({ product, buyer, name, phone, region, district, qty, note, receipt, source, promo }) {
  // Promo kod (bo'lsa) — chegirmani server o'zi hisoblaydi
  let promoCode = '';
  let discount = 0;
  if (promo) {
    const r = await promoSvc.redeem(promo, buyer.id, product.price * qty);
    promoCode = r.code;
    discount = r.discount;
  }
  let order;
  try {
    order = await Order.create({
    product: product._id,
    productTitle: product.title,
    productImage: product.image,
    price: product.price,
    qty,
    seller: product.seller,
    buyer: buyer.id,
    buyerName: buyer.name,
    buyerUsername: buyer.username || '',
    name,
    phone,
    region,
    district,
    note: note || '',
    promo: promoCode,
    discount,
    receipt: receipt || undefined,
    source,
  });
  } catch (e) {
    if (promoCode) await promoSvc.release(promoCode, buyer.id);
    throw e;
  }
  await Product.updateOne({ _id: product._id }, { $inc: { orders: 1 } });

  notifySeller(order).catch(() => {});
  bot.telegram
    .sendMessage(
      buyer.id,
      `✅ <b>Buyurtmangiz qabul qilindi!</b>\n\n📦 ${esc(product.title)}\n🔢 Soni: ${qty}\n${discount ? `🎟 Promo ${esc(promoCode)}: −${money(discount)}\n` : ''}💰 Jami: ${money(
        product.price * qty - discount
      )}\n\n${receipt ? "To'lov chekingiz sotuvchiga yuborildi. " : ''}Sotuvchi tez orada siz bilan bog'lanadi. Buyurtma raqami: #${shortId(order._id)}`,
      { parse_mode: 'HTML' }
    )
    .catch(() => {});
  return order;
}

// ---------- kanalga mahsulot joylash ----------
async function postToChannel(product, seller) {
  const img = await Image.findById(product.image).lean();
  const caption = [
    `🔥 <b>${esc(product.title)}</b>`,
    '',
    esc(product.description || ''),
    '',
    `💰 Narxi: <b>${money(product.price)}</b>`,
    '🚚 Xitoydan O\'zbekistonga yetkazib beriladi',
  ]
    .join('\n')
    .slice(0, 1000);

  const kb = Markup.inlineKeyboard([
    [Markup.button.url('🛒 Buyurtma berish', `https://t.me/${state.username}?start=order_${product._id}`)],
    [Markup.button.url("🛍 Do'konga o'tish", `https://t.me/${state.username}`)],
  ]);
  const msg = await bot.telegram.sendPhoto(
    seller.channel,
    { source: toBuf(img.data) },
    { caption, parse_mode: 'HTML', ...kb }
  );
  return msg.message_id;
}

// ---------- bot ichida buyurtma berish (qadamma-qadam) ----------
const flows = new Map(); // tgId -> { step, productId, data }

const cancelKb = Markup.keyboard([['❌ Bekor qilish']]).oneTime().resize();

async function startFlow(ctx, productId) {
  const p = mongoose.isValidObjectId(productId) ? await Product.findById(productId).lean() : null;
  if (!p || !p.active) return ctx.reply('Kechirasiz, bu mahsulot topilmadi yoki sotuvdan olingan.');

  flows.set(ctx.from.id, { step: 'name', productId: String(p._id), data: {} });
  const caption = `<b>${esc(p.title)}</b>\n💰 ${money(p.price)}\n\nBuyurtma berish uchun bir necha savolga javob bering.\n\n👤 <b>Ismingizni yozing:</b>`;
  const kb = Markup.keyboard([[ctx.from.first_name || 'Mijoz'], ['❌ Bekor qilish']]).oneTime().resize();
  const img = await Image.findById(p.image).lean();
  if (img) {
    return ctx.replyWithPhoto({ source: toBuf(img.data) }, { caption, parse_mode: 'HTML', ...kb });
  }
  return ctx.reply(caption, { parse_mode: 'HTML', ...kb });
}

async function askRegion(ctx) {
  await ctx.reply('👌 Rahmat!', Markup.removeKeyboard());
  const rows = [];
  for (let i = 0; i < REGIONS.length; i += 2) {
    rows.push(
      REGIONS.slice(i, i + 2).map((r, j) => Markup.button.callback(r, `reg:${i + j}`))
    );
  }
  return ctx.reply('📍 <b>Viloyatingizni tanlang:</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
}

function askQty(ctx) {
  return ctx.reply(
    '🔢 <b>Nechta dona kerak?</b> (raqam yozing yoki tanlang)',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [1, 2, 3, 5, 10].map((n) => Markup.button.callback(String(n), `qty:${n}`)),
      ]),
    }
  );
}

// Soni tanlangach — promo kod so'raymiz
function askPromo(ctx, flow) {
  flow.step = 'promo';
  return ctx.reply(
    '🎟 <b>Promo kodingiz bormi?</b>\n\nKodni yozing yoki o\'tkazib yuboring.',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('⏭ Promo kod yo\'q', 'promo:skip')]]),
    }
  );
}

const flowTotal = (p, d) => p.price * d.qty - (d.discount || 0);

async function afterQty(ctx, flow) {
  const p = await Product.findById(flow.productId).lean();
  const seller = p ? await Seller.findOne({ tgId: p.seller }).lean() : null;
  if (seller && seller.cardNumber) {
    flow.step = 'receipt';
    const total = flowTotal(p, flow.data);
    return ctx.reply(
      `💳 <b>To'lov</b>\n\nJami: <b>${money(total)}</b>\n\nKarta raqami:\n<code>${fmtCard(seller.cardNumber)}</code>\n` +
        `Karta egasi: <b>${esc(seller.cardHolder || '')}</b>\n\n` +
        `Pulni o'tkazing va <b>to'lov cheki rasmini (skrinshot)</b> shu yerga yuboring 📸`,
      { parse_mode: 'HTML', ...cancelKb }
    );
  }
  return showConfirm(ctx, flow);
}

async function showConfirm(ctx, flow) {
  const p = await Product.findById(flow.productId).lean();
  const d = flow.data;
  flow.step = 'confirm';
  const text = [
    '📋 <b>Buyurtmani tekshiring:</b>',
    '',
    `📦 ${esc(p.title)}`,
    `🔢 Soni: ${d.qty}`,
    d.discount ? `🎟 Promo ${esc(d.promo)}: −${money(d.discount)}` : null,
    `💰 Jami: <b>${money(flowTotal(p, d))}</b>`,
    '',
    `👤 ${esc(d.name)}`,
    `📞 ${esc(d.phone)}`,
    `📍 ${esc(d.region)}, ${esc(d.district)}`,
    d.receipt ? "🧾 To'lov cheki: ✅ yuklandi" : null,
  ]
    .filter((x) => x !== null)
    .join('\n');
  return ctx.reply(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('✅ Tasdiqlash', 'ok'), Markup.button.callback('❌ Bekor qilish', 'cancel')],
    ]),
  });
}

// ---------- handlerlar ----------
bot.use(async (ctx, next) => {
  touchUser(ctx.from).catch(() => {});
  return next();
});

bot.start(async (ctx) => {
  const payload = (ctx.startPayload || '').trim();
  if (payload.startsWith('order_')) {
    return startFlow(ctx, payload.slice(6));
  }
  flows.delete(ctx.from.id);
  const text =
    `🇨🇳 ✈️ 🇺🇿\n\n<b>Xitoy mahsulotlari do'koniga xush kelibsiz!</b>\n\n` +
    `Xitoydan O'zbekistonga ishonchli yetkazib beriladigan minglab mahsulotlar. ` +
    `Quyidagi tugmani bosib do'konni oching.`;
  if (BASE_URL) {
    return ctx.reply(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.webApp("🛍 Do'konni ochish", BASE_URL)]]),
    });
  }
  return ctx.reply(text + '\n\n(BASE_URL sozlanmagan)', { parse_mode: 'HTML' });
});

bot.command('cancel', (ctx) => {
  flows.delete(ctx.from.id);
  return ctx.reply('Bekor qilindi.', Markup.removeKeyboard());
});

bot.on('contact', async (ctx) => {
  const f = flows.get(ctx.from.id);
  if (!f || f.step !== 'phone') return;
  const ph = normPhone(ctx.message.contact.phone_number);
  if (!ph) return ctx.reply("Raqam noto'g'ri. Qaytadan yuboring.");
  f.data.phone = ph;
  f.step = 'region';
  return askRegion(ctx);
});

bot.on('photo', async (ctx) => {
  const f = flows.get(ctx.from.id);
  if (!f || f.step !== 'receipt') return;
  try {
    const photos = ctx.message.photo;
    f.data.receipt = await saveTelegramPhoto(ctx, photos[photos.length - 1].file_id);
  } catch (e) {
    return ctx.reply("Rasmni yuklab bo'lmadi, qaytadan yuboring.");
  }
  return showConfirm(ctx, f);
});

bot.on('text', async (ctx) => {
  const t = ctx.message.text.trim();
  const f = flows.get(ctx.from.id);
  if (!f) {
    return ctx.reply("Do'konni ochish uchun /start ni bosing.");
  }
  if (t === '❌ Bekor qilish') {
    flows.delete(ctx.from.id);
    return ctx.reply('Buyurtma bekor qilindi.', Markup.removeKeyboard());
  }

  switch (f.step) {
    case 'name': {
      if (t.length < 2 || t.length > 60) return ctx.reply("Ismni to'g'ri kiriting (2-60 belgi).");
      f.data.name = t;
      f.step = 'phone';
      return ctx.reply(
        '📞 <b>Telefon raqamingizni yuboring</b> yoki yozing (masalan: +998901234567):',
        {
          parse_mode: 'HTML',
          ...Markup.keyboard([[Markup.button.contactRequest('📞 Raqamni yuborish')], ['❌ Bekor qilish']])
            .oneTime()
            .resize(),
        }
      );
    }
    case 'phone': {
      const ph = normPhone(t);
      if (!ph) return ctx.reply("Raqam noto'g'ri. Masalan: +998901234567");
      f.data.phone = ph;
      f.step = 'region';
      return askRegion(ctx);
    }
    case 'district': {
      if (t.length < 2) return ctx.reply('Tuman nomini yozing.');
      f.data.district = t.slice(0, 80);
      f.step = 'qty';
      return askQty(ctx);
    }
    case 'qty': {
      const n = parseInt(t, 10);
      if (!n || n < 1 || n > 99) return ctx.reply('1 dan 99 gacha raqam yozing.');
      f.data.qty = n;
      return askPromo(ctx, f);
    }
    case 'promo': {
      const p = await Product.findById(f.productId).lean();
      try {
        const r = await promoSvc.check(t, ctx.from.id, p.price * f.data.qty);
        f.data.promo = r.code;
        f.data.discount = r.discount;
      } catch (e) {
        if (e instanceof promoSvc.PromoError) {
          return ctx.reply('❌ ' + e.message + '\n\nBoshqa kod yozing yoki "Promo kod yo\'q" tugmasini bosing.');
        }
        throw e;
      }
      await ctx.reply(`✅ Promo qabul qilindi! Chegirma: <b>${money(f.data.discount)}</b>`, { parse_mode: 'HTML' });
      return afterQty(ctx, f);
    }
    case 'receipt':
      return ctx.reply("🧾 Iltimos, to'lov chekining <b>rasmini</b> yuboring (matn emas).", { parse_mode: 'HTML' });
    default:
      return ctx.reply('Yuqoridagi tugmalardan birini tanlang.');
  }
});

bot.action(/^reg:(\d+)$/, async (ctx) => {
  const f = flows.get(ctx.from.id);
  await ctx.answerCbQuery();
  if (!f || f.step !== 'region') return;
  const region = REGIONS[Number(ctx.match[1])];
  if (!region) return;
  f.data.region = region;
  f.step = 'district';
  await ctx.editMessageText(`📍 Viloyat: <b>${esc(region)}</b>`, { parse_mode: 'HTML' }).catch(() => {});
  return ctx.reply('🏘 <b>Tuman (shahar) nomini yozing:</b>', { parse_mode: 'HTML', ...cancelKb });
});

bot.action(/^qty:(\d+)$/, async (ctx) => {
  const f = flows.get(ctx.from.id);
  await ctx.answerCbQuery();
  if (!f || f.step !== 'qty') return;
  f.data.qty = Number(ctx.match[1]);
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  return askPromo(ctx, f);
});

bot.action('promo:skip', async (ctx) => {
  const f = flows.get(ctx.from.id);
  await ctx.answerCbQuery();
  if (!f || f.step !== 'promo') return;
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  return afterQty(ctx, f);
});

bot.action('cancel', async (ctx) => {
  flows.delete(ctx.from.id);
  await ctx.answerCbQuery('Bekor qilindi');
  return ctx.editMessageText('❌ Buyurtma bekor qilindi.').catch(() => {});
});

bot.action('ok', async (ctx) => {
  const f = flows.get(ctx.from.id);
  if (!f || f.step !== 'confirm') return ctx.answerCbQuery('Muddati o\'tgan, qaytadan boshlang');
  const product = await Product.findById(f.productId).lean();
  if (!product || !product.active) {
    flows.delete(ctx.from.id);
    return ctx.answerCbQuery('Mahsulot topilmadi');
  }
  flows.delete(ctx.from.id);
  await ctx.answerCbQuery('Yuborilmoqda...');
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  try {
    await createOrder({
      product,
      buyer: {
        id: ctx.from.id,
        name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        username: ctx.from.username || '',
      },
      ...f.data,
      source: 'bot',
    });
  } catch (e) {
    if (e instanceof promoSvc.PromoError) {
      return ctx.reply('❌ ' + e.message + '\n\nBuyurtmani promo kodsiz qaytadan boshlang.');
    }
    throw e;
  }
});

// Sotuvchi buyurtma holatini o'zgartiradi
bot.action(/^st:(acc|rej|done):([a-f0-9]{24})$/, async (ctx) => {
  const [, act, id] = ctx.match;
  const order = await Order.findById(id);
  if (!order) return ctx.answerCbQuery('Buyurtma topilmadi');
  if (ctx.from.id !== order.seller && ctx.from.id !== ADMIN_ID) {
    return ctx.answerCbQuery("Ruxsat yo'q");
  }
  order.status = { acc: 'accepted', rej: 'rejected', done: 'done' }[act];
  await order.save();
  await ctx.answerCbQuery(STATUS_TEXT[order.status]);

  const opts = { parse_mode: 'HTML', ...orderKeyboard(order) };
  try {
    await ctx.editMessageCaption(orderText(order), opts);
  } catch {
    await ctx.editMessageText(orderText(order), opts).catch(() => {});
  }
  bot.telegram
    .sendMessage(
      order.buyer,
      `📦 Buyurtma #${shortId(order._id)} (${esc(order.productTitle)})\nHolat: <b>${STATUS_TEXT[order.status]}</b>`,
      { parse_mode: 'HTML' }
    )
    .catch(() => {});
});

bot.catch((err, ctx) => {
  console.error('Bot xatosi:', err.message, ctx?.updateType);
});

async function initBot() {
  const me = await bot.telegram.getMe();
  state.id = me.id;
  state.username = me.username;
  console.log('Bot:', '@' + me.username);
  return me;
}

module.exports = { bot, state, initBot, createOrder, postToChannel, esc, money };
