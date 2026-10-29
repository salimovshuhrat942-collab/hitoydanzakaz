const express = require('express');
const mongoose = require('mongoose');
const { ADMIN_ID, REGIONS } = require('./config');
const M = require('./models');
const { auth, requireStaff, requireAdmin, httpErr, verifyInitData } = require('./auth');
const botmod = require('./bot');
const promoSvc = require('./promo');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const isId = (v) => mongoose.isValidObjectId(v);
const str = (v, max) => String(v ?? '').trim().slice(0, max);

async function saveImage(dataUrl, priv) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw httpErr(400, "Rasm noto'g'ri formatda");
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) throw httpErr(400, 'Rasm juda katta (2 MB gacha)');
  const img = await M.Image.create({ data: buf, type: m[1], private: Boolean(priv) });
  return img._id;
}

const pubProduct = (p) => ({
  id: p._id,
  title: p.title,
  price: p.price,
  category: p.category,
  description: p.description,
  image: `/img/${p.image}`,
  views: p.views,
  orders: p.orders,
});

// ---------- Rasm (ochiq, <img> uchun) ----------
router.get(
  '/img/:id',
  wrap(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).end();
    const img = await M.Image.findById(req.params.id).lean();
    if (!img || img.private) return res.status(404).end();
    res.set('Content-Type', img.type);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(M.toBuf(img.data));
  })
);

// To'lov cheki: faqat buyurtma egasi, sotuvchi yoki admin ko'ra oladi
router.get(
  '/rimg/:id',
  wrap(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).end();
    const u = verifyInitData(String(req.query.d || ''));
    if (!u) return res.status(401).end();
    const order = await M.Order.findOne({ receipt: req.params.id }).lean();
    if (!order) return res.status(404).end();
    if (![order.seller, order.buyer, ADMIN_ID].includes(u.id)) return res.status(403).end();
    const img = await M.Image.findById(req.params.id).lean();
    if (!img) return res.status(404).end();
    res.set('Content-Type', img.type);
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(M.toBuf(img.data));
  })
);

// ---------- Hamma /api so'rovlar autentifikatsiyadan o'tadi ----------
router.use('/api', auth);

router.get(
  '/api/bootstrap',
  wrap(async (req, res) => {
    const [cats, ads] = await Promise.all([
      M.Category.find().sort({ order: 1, _id: 1 }).lean(),
      M.Ad.find({ active: true }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    res.json({
      me: { id: req.tg.id, name: req.tg.name, role: req.role },
      categories: cats.map((c) => ({ id: String(c._id), name: c.name, icon: c.icon })),
      ads: ads.map((a) => ({
        id: a._id,
        title: a.title,
        text: a.text,
        link: a.link,
        image: a.image ? `/img/${a.image}` : null,
      })),
      regions: REGIONS,
    });
  })
);

// ---------- Mahsulotlar ----------
router.get(
  '/api/products',
  wrap(async (req, res) => {
    const f = { active: true };
    if (req.query.cat && req.query.cat !== 'all') f.category = str(req.query.cat, 40);
    if (req.query.q) {
      const q = str(req.query.q, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (q) f.title = new RegExp(q, 'i');
    }
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const items = await M.Product.find(f).sort({ createdAt: -1 }).skip(page * 30).limit(30).lean();
    res.json(items.map(pubProduct));
  })
);

router.get(
  '/api/products/:id',
  wrap(async (req, res) => {
    if (!isId(req.params.id)) throw httpErr(404, 'Topilmadi');
    const p = await M.Product.findOneAndUpdate(
      { _id: req.params.id, active: true },
      { $inc: { views: 1 } },
      { new: true }
    ).lean();
    if (!p) throw httpErr(404, 'Mahsulot topilmadi');
    const seller = await M.Seller.findOne({ tgId: p.seller }).lean();
    res.json({
      ...pubProduct(p),
      seller: seller ? seller.channelTitle || seller.name : "Do'kon",
      pay: seller && seller.cardNumber ? { card: seller.cardNumber, holder: seller.cardHolder || '' } : null,
    });
  })
);

// ---------- Promo kodni tekshirish ----------
router.post(
  '/api/promo/check',
  wrap(async (req, res) => {
    const b = req.body || {};
    if (!isId(b.productId)) throw httpErr(400, "Mahsulot noto'g'ri");
    const product = await M.Product.findById(b.productId).lean();
    if (!product || !product.active) throw httpErr(404, 'Mahsulot topilmadi');
    const qty = Math.min(99, Math.max(1, parseInt(b.qty, 10) || 1));
    try {
      const r = await promoSvc.check(b.code, req.tg.id, product.price * qty);
      res.json({ ok: true, code: r.code, type: r.type, value: r.value, discount: r.discount });
    } catch (e) {
      if (e instanceof promoSvc.PromoError) throw httpErr(400, e.message);
      throw e;
    }
  })
);

// ---------- Buyurtma berish (Web App) ----------
router.post(
  '/api/orders',
  wrap(async (req, res) => {
    const b = req.body || {};
    if (!isId(b.productId)) throw httpErr(400, 'Mahsulot noto\'g\'ri');
    const product = await M.Product.findById(b.productId).lean();
    if (!product || !product.active) throw httpErr(404, 'Mahsulot topilmadi');

    const name = str(b.name, 60);
    const district = str(b.district, 80);
    const region = str(b.region, 40);
    const note = str(b.note, 300);
    const qty = parseInt(b.qty, 10);
    const digits = String(b.phone || '').replace(/\D/g, '');

    if (name.length < 2) throw httpErr(400, 'Ismingizni kiriting');
    if (digits.length < 9 || digits.length > 15) throw httpErr(400, "Telefon raqam noto'g'ri");
    if (!REGIONS.includes(region)) throw httpErr(400, 'Viloyatni tanlang');
    if (district.length < 2) throw httpErr(400, 'Tuman (shahar) nomini kiriting');
    if (!qty || qty < 1 || qty > 99) throw httpErr(400, "Soni noto'g'ri");

    const phone = digits.length === 9 ? '+998' + digits : '+' + digits;

    if (b.promo) {
      try {
        await promoSvc.check(b.promo, req.tg.id, product.price * qty);
      } catch (e) {
        if (e instanceof promoSvc.PromoError) throw httpErr(400, e.message);
        throw e;
      }
    }

    const sellerDoc = await M.Seller.findOne({ tgId: product.seller }).lean();
    let receipt;
    if (sellerDoc && sellerDoc.cardNumber) {
      if (!b.receipt) throw httpErr(400, "To'lov chekining rasmini yuklang");
      receipt = await saveImage(b.receipt, true);
    }

    let order;
    try {
      order = await botmod.createOrder({
        product,
        buyer: req.tg,
        name,
        phone,
        region,
        district,
        qty,
        note,
        receipt,
        promo: b.promo,
        source: 'webapp',
      });
    } catch (e) {
      if (e instanceof promoSvc.PromoError) throw httpErr(400, e.message);
      throw e;
    }
    res.json({ ok: true, id: order._id });
  })
);

router.get(
  '/api/my-orders',
  wrap(async (req, res) => {
    const list = await M.Order.find({ buyer: req.tg.id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json(
      list.map((o) => ({
        id: o._id,
        title: o.productTitle,
        image: o.productImage ? `/img/${o.productImage}` : null,
        price: o.price,
        qty: o.qty,
        discount: o.discount || 0,
        status: o.status,
        createdAt: o.createdAt,
      }))
    );
  })
);

// ---------- Sotuvchi / Admin: mahsulotlar ----------
const sellerFilter = (req) => (req.role === 'admin' ? {} : { seller: req.tg.id });

router.get(
  '/api/staff/stats',
  requireStaff,
  wrap(async (req, res) => {
    const f = sellerFilter(req);
    const [products, agg, orders, newOrders] = await Promise.all([
      M.Product.countDocuments({ ...f, active: true }),
      M.Product.aggregate([{ $match: { ...f, active: true } }, { $group: { _id: null, v: { $sum: '$views' } } }]),
      M.Order.countDocuments(f),
      M.Order.countDocuments({ ...f, status: 'new' }),
    ]);
    const top = await M.Product.find({ ...f, active: true }).sort({ orders: -1, views: -1 }).limit(5).lean();
    res.json({
      products,
      views: agg[0]?.v || 0,
      orders,
      newOrders,
      top: top.map((p) => ({ id: p._id, title: p.title, views: p.views, orders: p.orders })),
    });
  })
);

router.get(
  '/api/staff/products',
  requireStaff,
  wrap(async (req, res) => {
    const items = await M.Product.find({ ...sellerFilter(req), active: true })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json(items.map(pubProduct));
  })
);

router.post(
  '/api/staff/products',
  requireStaff,
  wrap(async (req, res) => {
    const seller =
      req.role === 'admin'
        ? await M.Seller.findOne({ tgId: req.tg.id }).lean()
        : req.seller;
    if (!seller) {
      throw httpErr(400, "Avval o'zingizni sotuvchi sifatida qo'shing (Sotuvchilar bo'limi)");
    }
    const b = req.body || {};
    const title = str(b.title, 100);
    const description = str(b.description, 700);
    const price = Math.round(Number(b.price));
    if (title.length < 3) throw httpErr(400, 'Mahsulot nomini kiriting');
    if (!price || price < 1 || price > 1e10) throw httpErr(400, "Narx noto'g'ri");
    if (!isId(b.category) || !(await M.Category.exists({ _id: b.category }))) {
      throw httpErr(400, "Bo'limni tanlang");
    }
    const imageId = await saveImage(b.image);

    const product = await M.Product.create({
      seller: seller.tgId,
      title,
      description,
      price,
      category: String(b.category),
      image: imageId,
    });

    let posted = false;
    let note = '';
    try {
      const msgId = await botmod.postToChannel(product, seller);
      await M.Product.updateOne({ _id: product._id }, { channelMsgId: msgId });
      posted = true;
    } catch (e) {
      note = "Mahsulot saqlandi, lekin kanalga joylab bo'lmadi: " + e.message;
    }
    res.json({ ok: true, id: product._id, posted, note });
  })
);

router.delete(
  '/api/staff/products/:id',
  requireStaff,
  wrap(async (req, res) => {
    if (!isId(req.params.id)) throw httpErr(404, 'Topilmadi');
    const p = await M.Product.findOne({ _id: req.params.id, ...sellerFilter(req) });
    if (!p) throw httpErr(404, 'Topilmadi');
    p.active = false;
    await p.save();
    const seller = await M.Seller.findOne({ tgId: p.seller }).lean();
    if (seller && p.channelMsgId) {
      botmod.bot.telegram.deleteMessage(seller.channel, p.channelMsgId).catch(() => {});
    }
    res.json({ ok: true });
  })
);

router.get(
  '/api/staff/orders',
  requireStaff,
  wrap(async (req, res) => {
    const list = await M.Order.find(sellerFilter(req)).sort({ createdAt: -1 }).limit(50).lean();
    res.json(
      list.map((o) => ({
        id: o._id,
        title: o.productTitle,
        price: o.price,
        qty: o.qty,
        discount: o.discount || 0,
        promo: o.promo || '',
        status: o.status,
        name: o.name,
        phone: o.phone,
        region: o.region,
        district: o.district,
        note: o.note,
        source: o.source,
        receipt: o.receipt ? String(o.receipt) : null,
        createdAt: o.createdAt,
      }))
    );
  })
);

// ---------- Sozlamalar: to'lov kartasi ----------
async function sellerForSettings(req) {
  const s = await M.Seller.findOne({ tgId: req.tg.id });
  if (!s) throw httpErr(400, "Avval o'zingizni sotuvchi sifatida qo'shing (Sotuvchilar bo'limi)");
  return s;
}

router.get(
  '/api/staff/settings',
  requireStaff,
  wrap(async (req, res) => {
    const s = await sellerForSettings(req);
    res.json({ cardNumber: s.cardNumber || '', cardHolder: s.cardHolder || '' });
  })
);

router.post(
  '/api/staff/settings',
  requireStaff,
  wrap(async (req, res) => {
    const s = await sellerForSettings(req);
    const card = String(req.body?.cardNumber || '').replace(/\D/g, '');
    const holder = str(req.body?.cardHolder, 40);
    if (card && card.length !== 16) throw httpErr(400, "Karta raqami 16 xonali bo'lishi kerak");
    if (card && holder.length < 2) throw httpErr(400, 'Karta egasining ismini kiriting');
    s.cardNumber = card;
    s.cardHolder = card ? holder : '';
    await s.save();
    res.json({ ok: true });
  })
);

// ---------- Admin ----------
router.get(
  '/api/admin/stats',
  requireAdmin,
  wrap(async (req, res) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const week = new Date(Date.now() - 7 * 864e5);

    const [users, usersToday, usersWeek, activeToday, sellers, products, orders, ordersToday, newOrders, viewsAgg] =
      await Promise.all([
        M.User.countDocuments(),
        M.User.countDocuments({ createdAt: { $gte: day } }),
        M.User.countDocuments({ createdAt: { $gte: week } }),
        M.User.countDocuments({ lastSeen: { $gte: day } }),
        M.Seller.countDocuments(),
        M.Product.countDocuments({ active: true }),
        M.Order.countDocuments(),
        M.Order.countDocuments({ createdAt: { $gte: day } }),
        M.Order.countDocuments({ status: 'new' }),
        M.Product.aggregate([{ $group: { _id: null, v: { $sum: '$views' } } }]),
      ]);

    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);
    const daily = await M.User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, c: { $sum: 1 } } },
    ]);
    const map = Object.fromEntries(daily.map((d) => [d._id, d.c]));
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(since.getTime() + i * 864e5);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key.slice(5), count: map[key] || 0 });
    }

    const top = await M.Product.find({ active: true }).sort({ orders: -1, views: -1 }).limit(5).lean();
    res.json({
      users,
      usersToday,
      usersWeek,
      activeToday,
      sellers,
      products,
      orders,
      ordersToday,
      newOrders,
      views: viewsAgg[0]?.v || 0,
      days,
      top: top.map((p) => ({ id: p._id, title: p.title, views: p.views, orders: p.orders })),
    });
  })
);

router.get(
  '/api/admin/sellers',
  requireAdmin,
  wrap(async (req, res) => {
    const list = await M.Seller.find().sort({ createdAt: -1 }).lean();
    const counts = await M.Product.aggregate([
      { $match: { active: true } },
      { $group: { _id: '$seller', c: { $sum: 1 } } },
    ]);
    const cm = Object.fromEntries(counts.map((c) => [c._id, c.c]));
    res.json(
      list.map((s) => ({
        tgId: s.tgId,
        name: s.name,
        channelTitle: s.channelTitle,
        channelUsername: s.channelUsername,
        products: cm[s.tgId] || 0,
      }))
    );
  })
);

router.post(
  '/api/admin/sellers',
  requireAdmin,
  wrap(async (req, res) => {
    const tgId = parseInt(req.body?.tgId, 10);
    if (!tgId || tgId < 1) throw httpErr(400, "Sotuvchi Telegram ID noto'g'ri");
    let channel = str(req.body?.channel, 80);
    if (!channel) throw httpErr(400, 'Kanal @username yoki ID sini kiriting');
    channel = /^-?\d+$/.test(channel) ? Number(channel) : channel.startsWith('@') ? channel : '@' + channel;

    let chat;
    try {
      chat = await botmod.bot.telegram.getChat(channel);
    } catch {
      throw httpErr(400, 'Kanal topilmadi. @username yoki -100... ID ni tekshiring');
    }
    if (chat.type !== 'channel') throw httpErr(400, 'Bu kanal emas');

    let me;
    try {
      me = await botmod.bot.telegram.getChatMember(chat.id, botmod.state.id);
    } catch {
      throw httpErr(400, "Bot kanalga qo'shilmagan. Botni kanalga admin qiling");
    }
    if (me.status !== 'administrator' || me.can_post_messages === false) {
      throw httpErr(400, "Bot kanalda admin emas yoki xabar yozish huquqi yo'q");
    }

    let name = 'Sotuvchi';
    const u = await M.User.findOne({ tgId }).lean();
    if (u) name = u.name;
    else {
      try {
        const c = await botmod.bot.telegram.getChat(tgId);
        name = [c.first_name, c.last_name].filter(Boolean).join(' ') || name;
      } catch {}
    }

    await M.Seller.updateOne(
      { tgId },
      {
        $set: {
          name,
          channel: String(chat.id),
          channelTitle: chat.title,
          channelUsername: chat.username || '',
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    botmod.bot.telegram
      .sendMessage(
        tgId,
        `🎉 Siz <b>${botmod.esc(chat.title)}</b> kanali uchun sotuvchi qilib qo'shildingiz!\n\nDo'konni ochib, pastdagi "Panel" bo'limidan mahsulot qo'shing. Buyurtmalar shu bot orqali sizga keladi.`,
        { parse_mode: 'HTML' }
      )
      .catch(() => {});

    res.json({ ok: true, channelTitle: chat.title });
  })
);

router.delete(
  '/api/admin/sellers/:tgId',
  requireAdmin,
  wrap(async (req, res) => {
    const tgId = parseInt(req.params.tgId, 10);
    await M.Seller.deleteOne({ tgId });
    await M.Product.updateMany({ seller: tgId }, { active: false });
    res.json({ ok: true });
  })
);

// Reklama
router.get(
  '/api/admin/ads',
  requireAdmin,
  wrap(async (req, res) => {
    const list = await M.Ad.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json(
      list.map((a) => ({
        id: a._id,
        title: a.title,
        text: a.text,
        link: a.link,
        image: a.image ? `/img/${a.image}` : null,
      }))
    );
  })
);

router.post(
  '/api/admin/ads',
  requireAdmin,
  wrap(async (req, res) => {
    const b = req.body || {};
    const title = str(b.title, 80);
    const text = str(b.text, 200);
    let link = str(b.link, 300);
    if (title.length < 2) throw httpErr(400, 'Reklama sarlavhasini kiriting');
    if (link && !/^https?:\/\//i.test(link)) {
      link = link.startsWith('@') ? 'https://t.me/' + link.slice(1) : 'https://' + link;
    }
    const image = b.image ? await saveImage(b.image) : undefined;
    await M.Ad.create({ title, text, link, image });
    res.json({ ok: true });
  })
);

router.delete(
  '/api/admin/ads/:id',
  requireAdmin,
  wrap(async (req, res) => {
    if (!isId(req.params.id)) throw httpErr(404, 'Topilmadi');
    await M.Ad.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  })
);

// Bo'limlar
router.post(
  '/api/admin/categories',
  requireAdmin,
  wrap(async (req, res) => {
    const name = str(req.body?.name, 30);
    const icon = str(req.body?.icon, 8) || '📦';
    if (name.length < 2) throw httpErr(400, "Bo'lim nomini kiriting");
    const count = await M.Category.countDocuments();
    await M.Category.create({ name, icon, order: count });
    res.json({ ok: true });
  })
);

router.delete(
  '/api/admin/categories/:id',
  requireAdmin,
  wrap(async (req, res) => {
    if (!isId(req.params.id)) throw httpErr(404, 'Topilmadi');
    await M.Category.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  })
);

// Promo kodlar
const pubPromo = (p) => ({
  id: p._id,
  code: p.code,
  type: p.type,
  value: p.value,
  maxUses: p.maxUses,
  used: p.used,
  oncePerUser: p.oncePerUser,
  expiresAt: p.expiresAt || null,
  active: p.active,
  expired: Boolean(p.expiresAt && p.expiresAt.getTime() < Date.now()),
});

router.get(
  '/api/admin/promos',
  requireAdmin,
  wrap(async (req, res) => {
    const list = await M.PromoCode.find().sort({ createdAt: -1 }).limit(200).lean();
    res.json(list.map(pubPromo));
  })
);

router.post(
  '/api/admin/promos',
  requireAdmin,
  wrap(async (req, res) => {
    const b = req.body || {};
    const code = promoSvc.normCode(b.code);
    if (!promoSvc.validFormat(code)) {
      throw httpErr(400, "Kod 3-20 belgidan iborat bo'lsin (lotin harflari, raqam, - yoki _)");
    }
    const type = b.type === 'fixed' ? 'fixed' : 'percent';
    const value = Math.round(Number(b.value));
    if (!value || value < 1) throw httpErr(400, 'Chegirma qiymatini kiriting');
    if (type === 'percent' && value > 100) throw httpErr(400, "Foiz 1 dan 100 gacha bo'lsin");
    if (type === 'fixed' && value > 1e9) throw httpErr(400, "Summa noto'g'ri");
    const maxUses = Math.max(0, Math.min(1e6, parseInt(b.maxUses, 10) || 0));

    let expiresAt;
    if (b.expires) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.expires))) throw httpErr(400, "Sana noto'g'ri");
      expiresAt = new Date(b.expires + 'T23:59:59+05:00'); // Toshkent vaqti
      if (isNaN(expiresAt) || expiresAt.getTime() < Date.now()) throw httpErr(400, "Muddat o'tib ketgan sana");
    }

    try {
      await M.PromoCode.create({
        code,
        type,
        value,
        maxUses,
        oncePerUser: b.oncePerUser !== false,
        expiresAt,
      });
    } catch (e) {
      if (e && e.code === 11000) throw httpErr(400, 'Bu kod allaqachon mavjud');
      throw e;
    }
    res.json({ ok: true, code });
  })
);

router.post(
  '/api/admin/promos/:id/toggle',
  requireAdmin,
  wrap(async (req, res) => {
    if (!isId(req.params.id)) throw httpErr(404, 'Topilmadi');
    const p = await M.PromoCode.findById(req.params.id);
    if (!p) throw httpErr(404, 'Topilmadi');
    p.active = !p.active;
    await p.save();
    res.json({ ok: true, active: p.active });
  })
);

router.delete(
  '/api/admin/promos/:id',
  requireAdmin,
  wrap(async (req, res) => {
    if (!isId(req.params.id)) throw httpErr(404, 'Topilmadi');
    await M.PromoCode.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  })
);

// Xatolik ushlagich
router.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.status ? err.message : 'Server xatosi, keyinroq urinib ko\'ring' });
});

module.exports = router;
