const { PromoCode } = require('./models');

// Promo kod xatosi — foydalanuvchiga ko'rsatiladigan matn bilan
class PromoError extends Error {}

const normCode = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, '');
const validFormat = (c) => /^[A-Z0-9_-]{3,20}$/.test(c);

// Chegirma summasini hisoblash
function calcDiscount(promo, subtotal) {
  let d = promo.type === 'fixed' ? promo.value : Math.floor((subtotal * promo.value) / 100);
  d = Math.max(0, Math.min(d, subtotal));
  return d;
}

function checkRules(promo, userId) {
  if (!promo || !promo.active) throw new PromoError('Promo kod topilmadi');
  if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) throw new PromoError('Promo kod muddati tugagan');
  if (promo.maxUses > 0 && promo.used >= promo.maxUses) throw new PromoError('Promo kod limiti tugagan');
  if (promo.oncePerUser && (promo.usedBy || []).includes(userId)) {
    throw new PromoError('Siz bu promo koddan allaqachon foydalangansiz');
  }
}

// Faqat tekshirish (hisobdan o'chirmaydi)
async function check(codeRaw, userId, subtotal) {
  const code = normCode(codeRaw);
  if (!code) throw new PromoError('Promo kodni kiriting');
  const promo = await PromoCode.findOne({ code });
  checkRules(promo, userId);
  return { code, type: promo.type, value: promo.value, discount: calcDiscount(promo, subtotal) };
}

// Buyurtma yaratishda ishlatish (atomik — limitdan oshib ketmaydi)
async function redeem(codeRaw, userId, subtotal) {
  const code = normCode(codeRaw);
  const promo = await PromoCode.findOne({ code });
  checkRules(promo, userId);

  const now = new Date();
  const filter = {
    _id: promo._id,
    active: true,
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] },
      { $or: [{ maxUses: 0 }, { $expr: { $lt: ['$used', '$maxUses'] } }] },
    ],
  };
  if (promo.oncePerUser) filter.usedBy = { $ne: userId };

  const upd = await PromoCode.updateOne(filter, { $inc: { used: 1 }, $addToSet: { usedBy: userId } });
  if (!upd.modifiedCount) throw new PromoError('Promo kod hozir ishlamaydi. Boshqa kod kiriting');
  return { code, discount: calcDiscount(promo, subtotal) };
}

// Buyurtma yaratilmay qolsa — promo'ni qaytarib beramiz
async function release(code, userId) {
  await PromoCode.updateOne({ code }, { $inc: { used: -1 }, $pull: { usedBy: userId } }).catch(() => {});
}

module.exports = { PromoError, normCode, validFormat, calcDiscount, check, redeem, release };
