# 🇨🇳 ✈️ 🇺🇿 Xitoy mahsulotlari — Telegram bot + Web App do'kon

## Imkoniyatlar

- `/start` → "🛍 Do'konni ochish" tugmasi (Web App)
- Web App: bo'limlar (Yandex uslubida), qidiruv, mahsulotlar, buyurtma berish, "Buyurtmalarim"
- Tepada **reklama bo'limi** (admin joylaydi, avtomatik aylanadi)
- **Admin paneli** faqat `ADMIN_ID` ga ko'rinadi: umumiy statistika, sotuvchilar, reklama, bo'limlar
- **Sotuvchi**: admin sotuvchi ID + kanalini qo'shadi → sotuvchi faqat mahsulot qo'shadi (rasm, bo'lim), o'z statistikasi va buyurtmalarini ko'radi
- Mahsulot sotuvchi kanaliga joylanadi, ostida **🛒 Buyurtma berish** tugmasi bor. Bosilsa bot ochiladi, mijozdan ism, telefon, viloyat, tuman, soni so'raladi va **rasmi bilan** sotuvchiga yuboriladi
- Web App'dan berilgan buyurtma ham xuddi shunday sotuvchiga boradi
- Sotuvchi buyurtmani botning o'zida ✅ qabul / ❌ rad / 🏁 yakunlandi qiladi, mijozga xabar boradi

## Fayllar tuzilishi

```
xitoy-bot/
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── src/
│   ├── index.js    ← server, webhook, MongoDB
│   ├── config.js   ← sozlamalar, viloyatlar, standart bo'limlar
│   ├── models.js   ← baza modellari
│   ├── auth.js     ← Telegram initData tekshiruvi, rollar
│   ├── bot.js      ← bot: /start, buyurtma jarayoni, kanalga joylash
│   └── api.js      ← Web App uchun API
└── public/
    ├── index.html  ← Web App (sarlavha: bayroqlar + samolyot)
    ├── style.css   ← ko'k-oq dizayn va animatsiyalar
    └── app.js      ← Web App mantiqi
```

## Deploy (hammasi bepul)

### 1) Bot yaratish
1. Telegramda **@BotFather** → `/newbot` → **BOT_TOKEN** ni oling.
2. **@userinfobot** ga `/start` → sizning ID raqamingiz = **ADMIN_ID**.

### 2) Bepul baza — MongoDB Atlas
Render'da fayl saqlanmaydi (qayta ishga tushganda o'chadi), shuning uchun baza tashqarida turadi.
1. https://www.mongodb.com/cloud/atlas → ro'yxatdan o'ting → **M0 (Free)** cluster yarating.
2. **Database Access** → foydalanuvchi yarating (login/parol).
3. **Network Access** → `Add IP Address` → **Allow access from anywhere** (`0.0.0.0/0`).
4. **Connect → Drivers** → ulanish manzilini nusxalang. `<password>` o'rniga parolingizni yozing. Bu **MONGO_URI**.

### 3) GitHub'ga yuklash
```bash
cd xitoy-bot
git init
git add .
git commit -m "birinchi versiya"
git branch -M main
git remote add origin https://github.com/SIZNING_LOGIN/xitoy-bot.git
git push -u origin main
```
`.env` fayli GitHub'ga **yuklanmaydi** (`.gitignore` da bor) — tokenlar xavfsiz.

### 4) Render'da ishga tushirish
1. https://render.com → **New + → Web Service** → GitHub repo'ni tanlang.
2. Sozlamalar:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
3. **Environment** bo'limida qo'shing:
   | Kalit | Qiymat |
   |---|---|
   | `BOT_TOKEN` | BotFather tokeni |
   | `ADMIN_ID` | sizning ID |
   | `MONGO_URI` | Atlas manzili |
4. **Create Web Service**. Tayyor bo'lgach manzil chiqadi (`https://xxx.onrender.com`). `BASE_URL` ni yozish shart emas — Render o'zi beradi (`RENDER_EXTERNAL_URL`). Webhook ham avtomatik o'rnatiladi.
5. Botga `/start` yozing — "🛍 Do'konni ochish" tugmasi chiqadi.

### 5) Bot "uxlab qolmasligi" uchun
Render bepul tarifi 15 daqiqa so'rov bo'lmasa uxlaydi (keyingi so'rovda ~30–50 soniyada uyg'onadi). Oldini olish:
1. https://uptimerobot.com (bepul) → **Add New Monitor** → HTTP(s)
2. URL: `https://SIZNING-ILOVA.onrender.com/health`, interval: 5 daqiqa.

## Sotuvchi qo'shish

1. Sotuvchi o'z **kanalini** yaratadi va botni kanalga **administrator** qiladi (xabar yozish huquqi bilan).
2. Sotuvchi botga **/start** bosadi (aks holda bot unga xabar yubora olmaydi).
3. Siz Web App → **Admin → Sotuvchilar** bo'limida sotuvchining Telegram ID si va kanal `@username` ini kiritasiz. Bot kanalda admin ekanini avtomatik tekshiradi.
4. Sotuvchi Web App'ni ochganda pastda **Panel** bo'limi paydo bo'ladi.

> Agar o'zingiz ham mahsulot qo'shmoqchi bo'lsangiz, o'zingizni ham (o'z ID va kanalingiz bilan) sotuvchi sifatida qo'shing.

## Lokal sinash (ixtiyoriy)
```bash
cp .env.example .env     # to'ldiring
npm install
npm start                # BASE_URL yo'q bo'lsa bot polling rejimida ishlaydi
```
Web App faqat Telegram ichida to'liq ishlaydi (HTTPS manzil kerak).

## Eslatmalar
- Rasmlar MongoDB'da saqlanadi (telefonda avtomatik 900px gacha kichraytiriladi). Atlas bepul 512 MB — minglab mahsulotga yetadi.
- Mahsulot o'chirilsa, kanaldagi post ham o'chiriladi.
- Bot sozlamalarini o'zgartirgach Render'da **Manual Deploy → Deploy latest commit** qiling.
