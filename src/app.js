/* Xitoy mahsulotlari — Telegram Web App */
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor('#1457e6');
    tg.setBackgroundColor('#f2f6ff');
    tg.setBottomBarColor && tg.setBottomBarColor('#ffffff');
  } catch (e) {}
}

const S = { me: null, cats: [], ads: [], regions: [], cat: 'all', q: '', tab: 'home', ptab: null };
let adTimer = null;

/* ---------- yordamchilar ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n || 0).toLocaleString('en-US').replace(/,/g, ' ') + " so'm";
const fdate = (d) =>
  new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtCard = (n) => String(n || '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
const rurl = (id) => `/rimg/${id}?d=${encodeURIComponent((tg && tg.initData) || '')}`;
function copyText(t) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
  } catch (e) {}
  return new Promise((res, rej) => {
    const a = document.createElement('textarea');
    a.value = t; a.style.position = 'fixed'; a.style.opacity = '0';
    document.body.appendChild(a); a.select();
    try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); }
    a.remove();
  });
}
const calcDisc = (pr, sub) => {
  if (!pr) return 0;
  const d = pr.type === 'fixed' ? pr.value : Math.floor((sub * pr.value) / 100);
  return Math.max(0, Math.min(d, sub));
};
const promoLabel = (pr) => (pr.type === 'fixed' ? `−${money(pr.value)}` : `−${pr.value}%`);
const STATUS = { new: '🆕 Yangi', accepted: '✅ Qabul qilindi', rejected: '❌ Rad etildi', done: '🏁 Yakunlandi' };

function haptic(type = 'light') {
  try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(type); } catch (e) {}
}
let toastTimer;
function toast(msg, isErr) {
  const t = $('#toast');
  if (!t) return alert(msg);
  t.textContent = msg;
  t.className = 'show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), 2800);
  if (isErr) { try { tg.HapticFeedback.notificationOccurred('error'); } catch (e) {} }
}
function ask(msg) {
  return new Promise((res) => {
    if (tg && tg.showConfirm) tg.showConfirm(msg, (ok) => res(ok));
    else res(window.confirm(msg));
  });
}
function openLink(u) {
  if (!u) return;
  if (/^https?:\/\/t\.me\//i.test(u) && tg && tg.openTelegramLink) tg.openTelegramLink(u);
  else if (tg && tg.openLink) tg.openLink(u);
  else window.open(u, '_blank');
}

async function api(path, opts) {
  opts = opts || {};
  const r = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'x-init-data': (tg && tg.initData) || '' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error || 'Xatolik yuz berdi');
  return j;
}

function compress(file, max, q) {
  max = max || 900; q = q || 0.8;
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * k);
        c.height = Math.round(im.height * k);
        const x = c.getContext('2d');
        x.fillStyle = '#fff';
        x.fillRect(0, 0, c.width, c.height);
        x.drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', q));
      };
      im.onerror = rej;
      im.src = fr.result;
    };
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}
const pickHtml = (label) =>
  `<label class="pick"><span>📷 ${label}</span><img alt=""><input type="file" accept="image/*"></label>`;
function imgPicker(root, max, q) {
  const st = { data: null };
  const inp = $('input', root), pv = $('img', root), lb = $('span', root);
  if (inp) {
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        st.data = await compress(f, max, q);
        pv.src = st.data; pv.style.display = 'block'; lb.style.display = 'none';
      } catch (e) { toast("Rasmni o'qib bo'lmadi", true); }
    };
  }
  return st;
}

/* ---------- pastdan chiquvchi oyna ---------- */
function openSheet(html) {
  closeSheet(true);
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.id = 'ov';
  ov.innerHTML = `<div class="sheet"><div class="grab"></div><div id="sc">${html}</div></div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov) closeSheet(); });
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
}
function setSheet(html) { const s = $('#sc'); if (s) s.innerHTML = html; }
function closeSheet(now) {
  const ov = $('#ov');
  if (!ov) return;
  document.body.style.overflow = '';
  if (now) return ov.remove();
  ov.classList.add('out');
  setTimeout(() => ov.remove(), 220);
}

/* ---------- pastki menyu ---------- */
function renderTabs() {
  const t = [['home', '🏠', 'Do\'kon'], ['orders', '📦', 'Buyurtmalarim']];
  if (S.me.role !== 'user') t.push(['panel', '⚙️', S.me.role === 'admin' ? 'Admin' : 'Panel']);
  $('#tabs').innerHTML = t
    .map(([k, i, n]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-t="${k}"><span>${i}</span>${n}</button>`)
    .join('');
}
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  haptic();
  S.tab = b.dataset.t;
  renderTabs();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function render() {
  clearInterval(adTimer);
  const v = $('#view');
  v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
  if (S.tab === 'home') return renderHome();
  if (S.tab === 'orders') return renderOrders();
  return renderPanel();
}

/* ===================== BOSH SAHIFA ===================== */
function adsHtml() {
  if (!S.ads.length) {
    return `<div class="ads single"><div class="ad ph"><div class="tx"><b>📢 Reklama joyi</b><span>Reklama joylash uchun admin bilan bog'laning</span></div></div></div>`;
  }
  return `<div class="ads ${S.ads.length === 1 ? 'single' : ''}" id="ads">${S.ads
    .map(
      (a) => `<div class="ad" data-l="${esc(a.link || '')}">
        ${a.image ? `<img src="${a.image}" alt="" loading="lazy">` : ''}<div class="shade"></div>
        <div class="tx"><b>${esc(a.title)}</b>${a.text ? `<span>${esc(a.text)}</span>` : ''}</div></div>`
    )
    .join('')}</div>`;
}
function catsHtml() {
  const all = [{ id: 'all', icon: '✨', name: 'Hammasi' }].concat(S.cats);
  return all
    .map((c) => `<button class="cat ${S.cat === c.id ? 'on' : ''}" data-c="${esc(c.id)}"><i>${esc(c.icon)}</i><span>${esc(c.name)}</span></button>`)
    .join('');
}

function renderHome() {
  $('#view').innerHTML = `${adsHtml()}
    <div class="search"><input id="q" type="search" placeholder="Mahsulot qidirish..." value="${esc(S.q)}"></div>
    <div class="cats" id="cats">${catsHtml()}</div>
    <div class="grid" id="grid">${'<div class="sk card-sk"></div>'.repeat(4)}</div>`;

  const ads = $('#ads');
  if (ads) {
    ads.addEventListener('click', (e) => { const a = e.target.closest('.ad'); if (a && a.dataset.l) openLink(a.dataset.l); });
    if (S.ads.length > 1) {
      let i = 0;
      adTimer = setInterval(() => {
        i = (i + 1) % S.ads.length;
        const el = ads.children[i];
        if (el) ads.scrollTo({ left: el.offsetLeft - ads.offsetLeft - 14, behavior: 'smooth' });
      }, 4500);
    }
  }
  let dt;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(dt);
    dt = setTimeout(() => { S.q = e.target.value.trim(); loadProducts(); }, 350);
  });
  $('#cats').addEventListener('click', (e) => {
    const b = e.target.closest('.cat');
    if (!b) return;
    haptic();
    S.cat = b.dataset.c;
    $('#cats').innerHTML = catsHtml();
    loadProducts();
  });
  $('#grid').addEventListener('click', (e) => {
    const c = e.target.closest('.card');
    if (c) { haptic(); openProduct(c.dataset.id); }
  });
  loadProducts();
}

async function loadProducts() {
  const g = $('#grid');
  if (!g) return;
  try {
    const list = await api(`/products?cat=${encodeURIComponent(S.cat)}&q=${encodeURIComponent(S.q)}`);
    if (!$('#grid')) return;
    if (!list.length) {
      g.style.display = 'block';
      g.innerHTML = `<div class="empty"><b>🛍</b>Hozircha mahsulot yo'q.<br>Boshqa bo'limni tanlang yoki qidiruvni o'zgartiring.</div>`;
      return;
    }
    g.style.display = '';
    g.innerHTML = list
      .map((p, i) => {
        const c = S.cats.find((x) => x.id === p.category);
        return `<div class="card" data-id="${p.id}" style="animation-delay:${Math.min(i, 10) * 45}ms">
          <div class="im"><img src="${p.image}" alt="" loading="lazy" onload="this.classList.add('ld')">${c ? `<span class="tag">${esc(c.icon)} ${esc(c.name)}</span>` : ''}</div>
          <div class="bd"><div class="nm">${esc(p.title)}</div><div class="pr">${money(p.price)}</div></div></div>`;
      })
      .join('');
  } catch (e) {
    g.style.display = 'block';
    g.innerHTML = `<div class="empty"><b>⚠️</b>${esc(e.message)}</div>`;
  }
}

/* ---------- mahsulot oynasi ---------- */
async function openProduct(id) {
  openSheet('<div class="sk" style="height:380px;margin:10px"></div>');
  try {
    const p = await api('/products/' + id);
    const c = S.cats.find((x) => x.id === p.category);
    setSheet(`<img class="pimg" src="${p.image}" alt="">
      <div class="pbody">
        <span class="ptag">${c ? esc(c.icon) + ' ' + esc(c.name) : '📦 Boshqa'}</span>
        <h2>${esc(p.title)}</h2>
        <div class="pprice">${money(p.price)}</div>
        <div class="pdesc">${esc(p.description || '')}</div>
        <div class="ship">🇨🇳 ✈️ 🇺🇿 Xitoydan O'zbekistonga yetkazib beriladi</div>
        <div class="pmeta">👁 ${p.views} ko'rish · 🛒 ${p.orders} buyurtma · 🏪 ${esc(p.seller)}</div>
        <button class="btn" id="buy">🛒 Buyurtma berish</button>
      </div>`);
    $('#buy').onclick = () => { haptic('medium'); openOrder(p); };
  } catch (e) {
    closeSheet(true);
    toast(e.message, true);
  }
}

/* ---------- buyurtma formasi ---------- */
function openOrder(p) {
  let prof = {};
  try { prof = JSON.parse(localStorage.getItem('prof') || '{}'); } catch (e) {}
  const u = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) || {};
  let qty = 1;
  setSheet(`<div class="form">
    <h3>📝 Buyurtma berish</h3>
    <div class="li" style="box-shadow:none;background:var(--sky);margin-bottom:14px">
      <img class="th" src="${p.image}" alt=""><div class="in"><b>${esc(p.title)}</b><span class="p">${money(p.price)}</span></div>
    </div>
    <div class="fld"><label>Ismingiz</label><input id="o-name" value="${esc(prof.name || u.first_name || '')}" maxlength="60" placeholder="Ism familiya"></div>
    <div class="fld"><label>Telefon raqam</label><input id="o-phone" type="tel" inputmode="tel" value="${esc(prof.phone || '+998')}" placeholder="+998 90 123 45 67"></div>
    <div class="row2">
      <div class="fld"><label>Viloyat</label><select id="o-reg"><option value="">Tanlang</option>${S.regions
        .map((r) => `<option ${prof.region === r ? 'selected' : ''}>${esc(r)}</option>`)
        .join('')}</select></div>
      <div class="fld"><label>Tuman / shahar</label><input id="o-dis" value="${esc(prof.district || '')}" maxlength="80" placeholder="Tuman nomi"></div>
    </div>
    <div class="fld"><label>Soni</label><div class="stepper"><button id="m">−</button><b id="qv">1</b><button id="pl">+</button></div></div>
    <div class="fld"><label>Izoh (ixtiyoriy)</label><input id="o-note" maxlength="300" placeholder="Rang, o'lcham va hokazo"></div>
    ${p.pay ? `<div class="paybox">
        <div class="pb-t">💳 To'lov kartasi</div>
        <div class="pb-c">${esc(fmtCard(p.pay.card))}</div>
        <div class="pb-h">${esc(p.pay.holder)}</div>
        <button class="btn light sm" id="cp" type="button">📋 Raqamni nusxalash</button>
        <div class="pb-s">Jami summani shu kartaga o'tkazing, so'ng to'lov chekining rasmini (skrinshot) yuklang.</div>
      </div>
      <div class="fld" id="rcw">${pickHtml('Chek rasmini yuklang')}</div>` : ''}
    <div class="fld"><label>🎟 Promo kod (ixtiyoriy)</label>
      <div class="promo-row"><input id="o-promo" maxlength="20" placeholder="PROMO10" autocapitalize="characters" autocomplete="off">
      <button class="btn light sm" id="o-pa" type="button">Qo'llash</button></div>
      <div class="promo-msg" id="o-pm"></div></div>
    <div class="total" id="dsr" style="display:none"><span>🎟 Chegirma:</span><b class="ds" id="dsv"></b></div>
    <div class="total"><span>Jami:</span><b id="tot">${money(p.price)}</b></div>
    <button class="btn" id="send">✅ Buyurtmani yuborish</button>
  </div>`);

  const rc = p.pay ? imgPicker($('#rcw'), 1200, 0.85) : { data: null };
  if (p.pay) {
    $('#cp').onclick = () =>
      copyText(p.pay.card).then(() => { toast('📋 Karta raqami nusxalandi'); haptic(); }, () => toast("Nusxalab bo'mladi, raqamni qo'lda belgilang", true));
  }
  let promo = null;
  const upd = () => {
    $('#qv').textContent = qty;
    const sub = p.price * qty;
    const ds = calcDisc(promo, sub);
    $('#dsr').style.display = ds ? 'flex' : 'none';
    $('#dsv').textContent = '−' + money(ds);
    $('#tot').textContent = money(sub - ds);
  };
  const pm = $('#o-pm'), pin = $('#o-promo'), pa = $('#o-pa');
  const resetPromo = () => { promo = null; pm.textContent = ''; pm.className = 'promo-msg'; pin.disabled = false; pa.textContent = "Qo'llash"; upd(); };
  pin.addEventListener('input', () => { pin.value = pin.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''); });
  pa.onclick = async () => {
    if (promo) { pin.value = ''; return resetPromo(); }
    const code = pin.value.trim();
    if (!code) return toast('Promo kodni kiriting', true);
    pa.disabled = true;
    try {
      const r = await api('/promo/check', { method: 'POST', body: { code, productId: p.id, qty } });
      promo = { code: r.code, type: r.type, value: r.value };
      pm.textContent = '✅ Promo qo\'llandi: ' + promoLabel(promo);
      pm.className = 'promo-msg ok';
      pin.disabled = true; pa.textContent = 'Bekor qilish';
      haptic('medium'); upd();
    } catch (e) {
      pm.textContent = '❌ ' + e.message; pm.className = 'promo-msg bad';
    }
    pa.disabled = false;
  };
  $('#m').onclick = () => { if (qty > 1) { qty--; upd(); haptic(); } };
  $('#pl').onclick = () => { if (qty < 99) { qty++; upd(); haptic(); } };

  $('#send').onclick = async () => {
    const d = {
      productId: p.id,
      name: $('#o-name').value.trim(),
      phone: $('#o-phone').value.trim(),
      region: $('#o-reg').value,
      district: $('#o-dis').value.trim(),
      note: $('#o-note').value.trim(),
      qty,
      promo: promo ? promo.code : '',
      receipt: rc.data,
    };
    const digits = d.phone.replace(/\D/g, '');
    if (d.name.length < 2) return toast('Ismingizni kiriting', true);
    if (digits.length < 9 || digits.length > 15) return toast("Telefon raqam noto'g'ri", true);
    if (!d.region) return toast('Viloyatni tanlang', true);
    if (d.district.length < 2) return toast('Tuman (shahar) nomini kiriting', true);
    if (p.pay && !d.receipt) return toast("To'lov chekining rasmini yuklang", true);

    const btn = $('#send');
    btn.disabled = true; btn.textContent = '⏳ Yuborilmoqda...';
    try {
      await api('/orders', { method: 'POST', body: d });
      try { localStorage.setItem('prof', JSON.stringify({ name: d.name, phone: d.phone, region: d.region, district: d.district })); } catch (e) {}
      try { tg.HapticFeedback.notificationOccurred('success'); } catch (e) {}
      setSheet(`<div class="done">
        <svg class="check" viewBox="0 0 90 90"><circle cx="45" cy="45" r="41"/><path d="M27 47l12 12 25-27"/></svg>
        <h3>Buyurtma yuborildi!</h3>
        <p>Sotuvchi tez orada siz bilan bog'lanadi. Holatini “Buyurtmalarim” bo'limida ko'rasiz.</p>
        <button class="btn" id="cl">Yopish</button></div>`);
      $('#cl').onclick = () => closeSheet();
    } catch (e) {
      btn.disabled = false; btn.textContent = '✅ Buyurtmani yuborish';
      toast(e.message, true);
    }
  };
}

/* ===================== BUYURTMALARIM ===================== */
async function renderOrders() {
  $('#view').innerHTML = `<h2 class="sec">📦 Buyurtmalarim</h2><div class="list" id="ol"><div class="sk" style="height:76px"></div></div>`;
  try {
    const list = await api('/my-orders');
    const ol = $('#ol');
    if (!ol) return;
    if (!list.length) { ol.innerHTML = `<div class="empty"><b>📭</b>Hali buyurtma bermadingiz</div>`; return; }
    ol.innerHTML = list
      .map(
        (o, i) => `<div class="li" style="animation-delay:${i * 40}ms">
        ${o.image ? `<img class="th" src="${o.image}" alt="">` : '<div class="th"></div>'}
        <div class="in"><b>${esc(o.title)}</b>
        <span class="p">${money(o.price * o.qty - (o.discount || 0))}</span>
        <small>${o.qty} dona · ${fdate(o.createdAt)}</small></div>
        <span class="badge ${o.status}">${STATUS[o.status] || o.status}</span></div>`
      )
      .join('');
  } catch (e) { $('#ol').innerHTML = `<div class="empty"><b>⚠️</b>${esc(e.message)}</div>`; }
}

/* ===================== PANEL (sotuvchi / admin) ===================== */
const PT = {
  seller: [['stats', '📊 Statistika'], ['add', "➕ Mahsulot qo'shish"], ['mine', '📦 Mahsulotlarim'], ['sorders', '🧾 Buyurtmalar'], ['settings', '💳 Karta']],
  admin: [['astats', '📈 Umumiy'], ['sellers', '🏪 Sotuvchilar'], ['ads', '📢 Reklama'], ['promos', '🎟 Promo kod'], ['cats', "🗂 Bo'limlar"], ['add', '➕ Mahsulot'], ['mine', '📦 Mahsulotlar'], ['sorders', '🧾 Buyurtmalar'], ['settings', '💳 Karta']],
};

function renderPanel() {
  const tabs = PT[S.me.role];
  if (!tabs) { S.tab = 'home'; return render(); }
  if (!S.ptab || !tabs.some((t) => t[0] === S.ptab)) S.ptab = tabs[0][0];
  $('#view').innerHTML = `<div class="pt" id="pt">${tabs
    .map(([k, n]) => `<button data-p="${k}" class="${S.ptab === k ? 'on' : ''}">${n}</button>`)
    .join('')}</div><div id="pv"></div>`;
  $('#pt').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    haptic();
    S.ptab = b.dataset.p;
    [...$('#pt').children].forEach((x) => x.classList.toggle('on', x === b));
    panelView();
  });
  panelView();
}
function panelView() {
  const v = { stats: viewStats, astats: viewAdminStats, add: viewAdd, mine: viewMine, sorders: viewStaffOrders, sellers: viewSellers, ads: viewAds, promos: viewPromos, cats: viewCats, settings: viewSettings }[S.ptab];
  $('#pv').innerHTML = '<div class="sk" style="height:120px"></div>';
  v().catch((e) => { const pv = $('#pv'); if (pv) pv.innerHTML = `<div class="empty"><b>⚠️</b>${esc(e.message)}</div>`; });
}

const statCard = (n, l, hl) => `<div class="st ${hl ? 'hl' : ''}"><b>${n}</b><span>${l}</span></div>`;
const topList = (top) =>
  top.length
    ? `<h2 class="sec">🏆 Eng yaxshi mahsulotlar</h2><div class="list">${top
        .map((t) => `<div class="li"><div class="in"><b>${esc(t.title)}</b><small>👁 ${t.views} · 🛒 ${t.orders}</small></div></div>`)
        .join('')}</div>`
    : '';

async function viewStats() {
  const s = await api('/staff/stats');
  $('#pv').innerHTML = `<div class="stats">
    ${statCard(s.products, '📦 Mahsulotlar', true)}${statCard(s.views, "👁 Ko'rishlar")}
    ${statCard(s.orders, '🛒 Buyurtmalar')}${statCard(s.newOrders, '🆕 Yangi buyurtmalar')}</div>${topList(s.top)}`;
}

async function viewAdminStats() {
  const s = await api('/admin/stats');
  const max = Math.max(1, ...s.days.map((d) => d.count));
  $('#pv').innerHTML = `<div class="stats">
    ${statCard(s.users, '👥 Foydalanuvchilar', true)}${statCard(s.activeToday, '🟢 Bugun faol')}
    ${statCard(s.usersToday, "➕ Bugun qo'shildi")}${statCard(s.usersWeek, "📅 7 kunda qo'shildi")}
    ${statCard(s.sellers, '🏪 Sotuvchilar')}${statCard(s.products, '📦 Mahsulotlar')}
    ${statCard(s.orders, '🛒 Jami buyurtma')}${statCard(s.ordersToday, '🛒 Bugungi buyurtma')}
    ${statCard(s.newOrders, '🆕 Yangi buyurtmalar')}${statCard(s.views, "👁 Ko'rishlar")}</div>
    <h2 class="sec">📈 Yangi foydalanuvchilar (7 kun)</h2>
    <div class="chart">${s.days
      .map((d) => `<div><em>${d.count}</em><i style="height:${Math.max(3, (d.count / max) * 80)}px"></i>${esc(d.date)}</div>`)
      .join('')}</div>${topList(s.top)}`;
}

async function viewAdd() {
  $('#pv').innerHTML = `<div class="form" style="padding:0">
    <div class="fld">${pickHtml('Mahsulot rasmini tanlang')}</div>
    <div class="fld"><label>Nomi</label><input id="a-t" maxlength="100" placeholder="Masalan: Simsiz quloqchin"></div>
    <div class="row2">
      <div class="fld"><label>Narxi (so'm)</label><input id="a-p" type="number" inputmode="numeric" placeholder="150000"></div>
      <div class="fld"><label>Bo'lim</label><select id="a-c"><option value="">Tanlang</option>${S.cats
        .map((c) => `<option value="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</option>`)
        .join('')}</select></div>
    </div>
    <div class="fld"><label>Tavsif</label><textarea id="a-d" maxlength="700" placeholder="Mahsulot haqida qisqacha"></textarea></div>
    <button class="btn" id="a-s">🚀 Kanalga joylash</button></div>`;
  const pic = imgPicker($('#pv'));
  $('#a-s').onclick = async () => {
    const body = {
      title: $('#a-t').value.trim(),
      price: $('#a-p').value,
      category: $('#a-c').value,
      description: $('#a-d').value.trim(),
      image: pic.data,
    };
    if (!pic.data) return toast('Rasm tanlang', true);
    if (body.title.length < 3) return toast('Nomini kiriting', true);
    if (!body.price || Number(body.price) < 1) return toast('Narxni kiriting', true);
    if (!body.category) return toast("Bo'limni tanlang", true);
    const b = $('#a-s');
    b.disabled = true; b.textContent = '⏳ Joylanmoqda...';
    try {
      const r = await api('/staff/products', { method: 'POST', body });
      if (r.posted) toast('✅ Mahsulot kanalga joylandi!');
      else toast(r.note || "Kanalga joylab bo'lmadi", true);
      viewAdd();
    } catch (e) {
      b.disabled = false; b.textContent = '🚀 Kanalga joylash';
      toast(e.message, true);
    }
  };
}

async function viewMine() {
  const list = await api('/staff/products');
  const pv = $('#pv');
  if (!list.length) { pv.innerHTML = `<div class="empty"><b>📦</b>Hali mahsulot yo'q</div>`; return; }
  pv.innerHTML = `<div class="list">${list
    .map(
      (p, i) => `<div class="li" style="animation-delay:${Math.min(i, 10) * 35}ms">
      <img class="th" src="${p.image}" alt=""><div class="in"><b>${esc(p.title)}</b><span class="p">${money(p.price)}</span>
      <small>👁 ${p.views} · 🛒 ${p.orders}</small></div><button class="x" data-d="${p.id}">🗑</button></div>`
    )
    .join('')}</div>`;
  pv.onclick = async (e) => {
    const b = e.target.closest('[data-d]');
    if (!b || !(await ask("Mahsulotni o'chirasizmi? (kanaldagi post ham o'chadi)"))) return;
    try { await api('/staff/products/' + b.dataset.d, { method: 'DELETE' }); toast("🗑 O'chirildi"); viewMine(); }
    catch (er) { toast(er.message, true); }
  };
}

async function viewStaffOrders() {
  const list = await api('/staff/orders');
  const pv = $('#pv');
  if (!list.length) { pv.innerHTML = `<div class="empty"><b>🧾</b>Buyurtmalar hali yo'q</div>`; return; }
  pv.innerHTML = `<div class="list">${list
    .map(
      (o, i) => `<div class="li col" style="animation-delay:${Math.min(i, 10) * 35}ms">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${esc(o.title)}</b><span class="badge ${o.status}">${STATUS[o.status] || o.status}</span></div>
      <div class="in" style="margin-top:6px"><span class="p">${money(o.price * o.qty - (o.discount || 0))}</span> <small style="display:inline">· ${o.qty} dona · ${fdate(o.createdAt)}</small>
      ${o.discount ? `<small>🎟 ${esc(o.promo)}: −${money(o.discount)}</small>` : ''}
      <small>👤 ${esc(o.name)} · <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></small>
      <small>📍 ${esc(o.region)}, ${esc(o.district)}</small>${o.note ? `<small>📝 ${esc(o.note)}</small>` : ''}
      ${o.receipt ? `<small>🧾 <a href="#" data-r="${o.receipt}">To'lov chekini ko'rish</a></small>` : ''}</div></div>`
    )
    .join('')}</div>`;
  pv.onclick = (e) => {
    const a = e.target.closest('[data-r]');
    if (!a) return;
    e.preventDefault();
    openSheet(`<img class="pimg" style="aspect-ratio:auto;max-height:80vh;object-fit:contain" src="${rurl(a.dataset.r)}" alt="">`);
  };
}

async function viewSettings() {
  const s = await api('/staff/settings');
  $('#pv').innerHTML = `<div class="form" style="padding:0">
    <div class="ship">💳 Mijoz buyurtma berayotganda shu kartaga to'lov qiladi va chek rasmini yuboradi. Chek sizga botda keladi. Karta kiritmasangiz, to'lov so'ralmaydi.</div>
    <div class="fld"><label>Karta raqami (16 xona)</label><input id="k-n" inputmode="numeric" maxlength="19" placeholder="8600 0000 0000 0000" value="${esc(fmtCard(s.cardNumber))}"></div>
    <div class="fld"><label>Karta egasi</label><input id="k-h" maxlength="40" placeholder="ISM FAMILIYA" value="${esc(s.cardHolder)}"></div>
    <button class="btn" id="k-s">💾 Saqlash</button>
    ${s.cardNumber ? '<button class="btn danger" id="k-d" style="margin-top:10px">🗑 Kartani olib tashlash</button>' : ''}</div>`;
  const kn = $('#k-n');
  kn.addEventListener('input', () => { kn.value = fmtCard(kn.value.replace(/\D/g, '').slice(0, 16)); });
  $('#k-s').onclick = async () => {
    const cardNumber = kn.value.replace(/\D/g, '');
    const cardHolder = $('#k-h').value.trim();
    if (cardNumber.length !== 16) return toast("Karta raqami 16 xonali bo'lsin", true);
    if (cardHolder.length < 2) return toast('Karta egasining ismini kiriting', true);
    try { await api('/staff/settings', { method: 'POST', body: { cardNumber, cardHolder } }); toast('✅ Karta saqlandi'); viewSettings(); }
    catch (e) { toast(e.message, true); }
  };
  const kd = $('#k-d');
  if (kd) kd.onclick = async () => {
    if (!(await ask("Kartani olib tashlaysizmi? Mijozlardan to'lov so'ralmaydi."))) return;
    try { await api('/staff/settings', { method: 'POST', body: { cardNumber: '', cardHolder: '' } }); toast('🗑 Olib tashlandi'); viewSettings(); }
    catch (e) { toast(e.message, true); }
  };
}

async function viewSellers() {
  const list = await api('/admin/sellers');
  $('#pv').innerHTML = `<div class="form" style="padding:0">
    <div class="fld"><label>Sotuvchi Telegram ID</label><input id="s-id" type="number" inputmode="numeric" placeholder="123456789"></div>
    <div class="fld"><label>Sotuvchi kanali (@username yoki -100... ID)</label><input id="s-ch" placeholder="@kanal_nomi"></div>
    <div class="ship">ℹ️ Avval botni kanalga admin qiling (xabar yozish huquqi bilan). Sotuvchi esa botga /start bosishi kerak.</div>
    <button class="btn" id="s-add">➕ Sotuvchi qo'shish</button></div>
    <h2 class="sec">🏪 Sotuvchilar (${list.length})</h2>
    <div class="list" id="sl">${
      list.length
        ? list.map((s) => `<div class="li"><div class="in"><b>${esc(s.channelTitle || s.name)}</b>
          <small>${esc(s.name)} · ID ${s.tgId}</small><small>${s.channelUsername ? '@' + esc(s.channelUsername) + ' · ' : ''}📦 ${s.products} mahsulot</small></div>
          <button class="x" data-d="${s.tgId}">🗑</button></div>`).join('')
        : `<div class="empty"><b>🏪</b>Sotuvchi yo'q</div>`
    }</div>`;
  $('#s-add').onclick = async () => {
    const tgId = $('#s-id').value.trim(), channel = $('#s-ch').value.trim();
    if (!tgId || !channel) return toast('ID va kanalni kiriting', true);
    const b = $('#s-add');
    b.disabled = true; b.textContent = '⏳ Tekshirilmoqda...';
    try {
      const r = await api('/admin/sellers', { method: 'POST', body: { tgId, channel } });
      toast('✅ Qo\'shildi: ' + r.channelTitle);
      viewSellers();
    } catch (e) { b.disabled = false; b.textContent = "➕ Sotuvchi qo'shish"; toast(e.message, true); }
  };
  $('#sl').onclick = async (e) => {
    const b = e.target.closest('[data-d]');
    if (!b || !(await ask("Sotuvchini o'chirasizmi? Uning mahsulotlari ham yashiriladi."))) return;
    try { await api('/admin/sellers/' + b.dataset.d, { method: 'DELETE' }); toast("🗑 O'chirildi"); viewSellers(); }
    catch (er) { toast(er.message, true); }
  };
}

async function viewAds() {
  const list = await api('/admin/ads');
  $('#pv').innerHTML = `<div class="form" style="padding:0">
    <div class="fld">${pickHtml('Reklama rasmi (ixtiyoriy)')}</div>
    <div class="fld"><label>Sarlavha</label><input id="r-t" maxlength="80" placeholder="Masalan: Katta chegirma!"></div>
    <div class="fld"><label>Qisqa matn</label><input id="r-x" maxlength="200" placeholder="Reklama matni"></div>
    <div class="fld"><label>Havola (ixtiyoriy)</label><input id="r-l" placeholder="https://t.me/... yoki @kanal"></div>
    <button class="btn" id="r-s">📢 Reklamani joylash</button></div>
    <h2 class="sec">📢 Joylangan reklamalar (${list.length})</h2>
    <div class="list" id="rl">${
      list.length
        ? list.map((a) => `<div class="li">${a.image ? `<img class="th" src="${a.image}" alt="">` : '<div class="th"></div>'}
          <div class="in"><b>${esc(a.title)}</b><small>${esc(a.text || '')}</small></div><button class="x" data-d="${a.id}">🗑</button></div>`).join('')
        : `<div class="empty"><b>📢</b>Reklama yo'q</div>`
    }</div>`;
  const pic = imgPicker($('#pv'));
  $('#r-s').onclick = async () => {
    const body = { title: $('#r-t').value.trim(), text: $('#r-x').value.trim(), link: $('#r-l').value.trim(), image: pic.data };
    if (body.title.length < 2) return toast('Sarlavhani kiriting', true);
    const b = $('#r-s');
    b.disabled = true;
    try {
      await api('/admin/ads', { method: 'POST', body });
      const a = await api('/bootstrap'); S.ads = a.ads;
      toast('✅ Reklama joylandi');
      viewAds();
    } catch (e) { b.disabled = false; toast(e.message, true); }
  };
  $('#rl').onclick = async (e) => {
    const b = e.target.closest('[data-d]');
    if (!b || !(await ask("Reklamani o'chirasizmi?"))) return;
    try {
      await api('/admin/ads/' + b.dataset.d, { method: 'DELETE' });
      const a = await api('/bootstrap'); S.ads = a.ads;
      toast("🗑 O'chirildi"); viewAds();
    } catch (er) { toast(er.message, true); }
  };
}

async function viewPromos() {
  const list = await api('/admin/promos');
  const info = (c) => {
    const val = c.type === 'fixed' ? money(c.value) : c.value + '%';
    const lim = c.maxUses ? `${c.used}/${c.maxUses}` : `${c.used}/∞`;
    const exp = c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('ru-RU') : 'muddatsiz';
    return `${val} chegirma · ishlatilgan: ${lim} · ${exp}${c.oncePerUser ? ' · 1 kishiga 1 marta' : ''}`;
  };
  const state = (c) => (c.expired ? '⌛ Muddati tugagan' : c.maxUses && c.used >= c.maxUses ? '🚫 Limit tugagan' : c.active ? '🟢 Faol' : '⏸ O\'chirilgan');
  $('#pv').innerHTML = `<div class="form" style="padding:0">
    <div class="fld"><label>Promo kod (qo'lda yozing)</label>
      <div class="promo-row"><input id="p-c" maxlength="20" placeholder="MASALAN: YANGI10" autocapitalize="characters" autocomplete="off">
      <button class="btn light sm" id="p-g" type="button">🎲 Tasodifiy</button></div></div>
    <div class="row2">
      <div class="fld"><label>Turi</label><select id="p-t"><option value="percent">Foiz (%)</option><option value="fixed">Summa (so'm)</option></select></div>
      <div class="fld"><label id="p-vl">Foiz (1-100)</label><input id="p-v" type="number" inputmode="numeric" placeholder="10"></div>
    </div>
    <div class="row2">
      <div class="fld"><label>Limit (0 = cheksiz)</label><input id="p-m" type="number" inputmode="numeric" value="0"></div>
      <div class="fld"><label>Muddati (ixtiyoriy)</label><input id="p-e" type="date"></div>
    </div>
    <div class="fld"><label>Foydalanish</label><select id="p-o"><option value="1">Har kim 1 marta</option><option value="0">Cheklovsiz (limit ichida)</option></select></div>
    <button class="btn" id="p-s">🎟 Promo kod qo'shish</button></div>
    <h2 class="sec">🎟 Promo kodlar (${list.length})</h2>
    <div class="list" id="pl">${
      list.length
        ? list.map((c) => `<div class="li"><div class="in"><b>${esc(c.code)}</b><small>${esc(info(c))}</small><small>${state(c)}</small></div>
          <button class="x" data-t="${c.id}" title="Yoqish/o'chirish">${c.active ? '⏸' : '▶️'}</button><button class="x" data-d="${c.id}">🗑</button></div>`).join('')
        : `<div class="empty"><b>🎟</b>Promo kod yo'q</div>`
    }</div>`;

  const typ = $('#p-t');
  typ.onchange = () => {
    $('#p-vl').textContent = typ.value === 'fixed' ? "Summa (so'm)" : 'Foiz (1-100)';
    $('#p-v').placeholder = typ.value === 'fixed' ? '20000' : '10';
  };
  const pc = $('#p-c');
  pc.addEventListener('input', () => { pc.value = pc.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''); });
  $('#p-g').onclick = () => {
    const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    pc.value = Array.from({ length: 8 }, () => ch[Math.floor(Math.random() * ch.length)]).join('');
  };
  $('#p-s').onclick = async () => {
    const body = {
      code: pc.value.trim(),
      type: typ.value,
      value: $('#p-v').value,
      maxUses: $('#p-m').value || 0,
      expires: $('#p-e').value,
      oncePerUser: $('#p-o').value === '1',
    };
    if (body.code.length < 3) return toast('Promo kodni kiriting (kamida 3 belgi)', true);
    if (!body.value || Number(body.value) < 1) return toast('Chegirma qiymatini kiriting', true);
    const b = $('#p-s');
    b.disabled = true;
    try { await api('/admin/promos', { method: 'POST', body }); toast('✅ Promo kod qo\'shildi'); viewPromos(); }
    catch (e) { b.disabled = false; toast(e.message, true); }
  };
  $('#pl').onclick = async (e) => {
    const t = e.target.closest('[data-t]');
    if (t) {
      try { await api('/admin/promos/' + t.dataset.t + '/toggle', { method: 'POST' }); viewPromos(); }
      catch (er) { toast(er.message, true); }
      return;
    }
    const b = e.target.closest('[data-d]');
    if (!b || !(await ask("Promo kodni o'chirasizmi?"))) return;
    try { await api('/admin/promos/' + b.dataset.d, { method: 'DELETE' }); toast("🗑 O'chirildi"); viewPromos(); }
    catch (er) { toast(er.message, true); }
  };
}

async function viewCats() {
  const b0 = await api('/bootstrap'); S.cats = b0.categories;
  $('#pv').innerHTML = `<div class="form" style="padding:0">
    <div class="row2"><div class="fld"><label>Emoji</label><input id="c-i" maxlength="4" placeholder="🎧"></div>
    <div class="fld"><label>Nomi</label><input id="c-n" maxlength="30" placeholder="Bo'lim nomi"></div></div>
    <button class="btn" id="c-s">➕ Bo'lim qo'shish</button></div>
    <h2 class="sec">🗂 Bo'limlar (${S.cats.length})</h2>
    <div class="list" id="cl">${S.cats.map((c) => `<div class="li"><div class="th" style="display:grid;place-items:center;font-size:26px">${esc(c.icon)}</div>
      <div class="in"><b>${esc(c.name)}</b></div><button class="x" data-d="${esc(c.id)}">🗑</button></div>`).join('')}</div>`;
  $('#c-s').onclick = async () => {
    const name = $('#c-n').value.trim(), icon = $('#c-i').value.trim();
    if (name.length < 2) return toast("Bo'lim nomini kiriting", true);
    try { await api('/admin/categories', { method: 'POST', body: { name, icon } }); toast("✅ Bo'lim qo'shildi"); viewCats(); }
    catch (e) { toast(e.message, true); }
  };
  $('#cl').onclick = async (e) => {
    const b = e.target.closest('[data-d]');
    if (!b || !(await ask("Bo'limni o'chirasizmi?"))) return;
    try { await api('/admin/categories/' + b.dataset.d, { method: 'DELETE' }); toast("🗑 O'chirildi"); viewCats(); }
    catch (er) { toast(er.message, true); }
  };
}

/* ---------- ishga tushirish ---------- */
(async function init() {
  try {
    const b = await api('/bootstrap');
    S.me = b.me; S.cats = b.categories; S.ads = b.ads; S.regions = b.regions;
    renderTabs();
    render();
  } catch (e) {
    $('#view').innerHTML = `<div class="empty"><b>⚠️</b>${esc(e.message)}<br><br>Ilovani Telegram botdagi tugma orqali oching.</div>`;
  }
})();
