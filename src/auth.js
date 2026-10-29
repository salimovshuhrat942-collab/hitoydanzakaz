const crypto = require('crypto');
const { BOT_TOKEN, ADMIN_ID } = require('./config');
const { User, Seller } = require('./models');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const httpErr = (status, message) => new HttpError(status, message);

// Telegram Web App initData ni tekshirish (soxta so'rovlardan himoya)
function verifyInitData(initData) {
  if (!initData || !BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheck = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');

  const a = Buffer.from(calc, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date')) || 0;
  if (Date.now() / 1000 - authDate > 60 * 60 * 24 * 7) return null; // 7 kundan eski

  try {
    return JSON.parse(params.get('user'));
  } catch {
    return null;
  }
}

async function auth(req, res, next) {
  try {
    const u = verifyInitData(req.get('x-init-data'));
    if (!u || !u.id) throw httpErr(401, 'Ilovani Telegram ichidan oching');

    const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Foydalanuvchi';
    await User.updateOne(
      { tgId: u.id },
      {
        $set: { name, username: u.username || '', lastSeen: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    req.tg = { id: u.id, name, username: u.username || '' };
    if (u.id === ADMIN_ID) {
      req.role = 'admin';
    } else {
      req.seller = await Seller.findOne({ tgId: u.id }).lean();
      req.role = req.seller ? 'seller' : 'user';
    }
    next();
  } catch (e) {
    next(e);
  }
}

const requireStaff = (req, res, next) =>
  req.role === 'admin' || req.role === 'seller' ? next() : next(httpErr(403, "Ruxsat yo'q"));

const requireAdmin = (req, res, next) =>
  req.role === 'admin' ? next() : next(httpErr(403, "Ruxsat yo'q"));

module.exports = { auth, requireStaff, requireAdmin, httpErr, HttpError, verifyInitData };
