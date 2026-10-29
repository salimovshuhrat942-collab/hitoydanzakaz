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

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n || 0).toLocaleString('en-US').replace(/,/g, ' ') + " so'm";
const fdate = (d) => new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtCard = (n) => String(n || '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
const rurl = (id) => `/rimg/${id}?d=${encodeURIComponent((tg && tg.initData) || '')}`;

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
const pickHtml = (label) => `<label class="pick"><span>📷 ${label}</span><img alt=""><input type="file" accept="image/*"></label>`;
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

function openSheet(html) {
  closeSheet(true);
  const ov = document.createElement('div');
  ov.className = 'ov'; ov.id = 'ov';
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

function renderTabs() {
  const t = [['home', '🏠', 'Do\'kon'], ['orders', '📦', 'Buyurtmalarim']];
  if (S.me.role !== 'user') t.push(['panel', '⚙️', S.me.role === 'admin' ? 'Admin' : 'Panel']);
  $('#tabs').innerHTML = t.map(([k, i, n]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-t="${k}"><span>${i}</span>${n}</button>`).join('');
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

function renderHome() {
  $('#view').innerHTML = `<div class="search"><input id="q" type="search" placeholder="Mahsulot qidirish..." value="${esc(S.q)}"></div>
    <div class="grid" id="grid">${'<div class="sk card-sk"></div>'.repeat(4)}</div>`;
  let dt;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(dt);
    dt = setTimeout(() => { S.q = e.target.value.trim(); loadProducts(); }, 350);
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
    if (!list.length) {
      g.innerHTML = `<div class="empty"><b>🛍</b>Hozircha mahsulot yo'q.</div>`;
      return;
    }
    g.innerHTML = list.map((p, i) => `<div class="card" data-id="${p.id}" style="animation-delay:${Math.min(i, 10) * 45}ms">
      <div class="im"><img src="${p.image}" alt="" loading="lazy"></div>
      <div class="bd"><div class="nm">${esc(p.title)}</div><div class="pr">${money(p.price)}</div></div></div>`).join('');
  } catch (e) {
    g.innerHTML = `<div class="empty"><b>⚠️</b>${esc(e.message)}</div>`;
  }
}

async function openProduct(id) {
  openSheet('<div class="sk" style="height:380px;margin:10px"></div>');
  try {
    const p = await api('/products/' + id);
    setSheet(`<img class="pimg" src="${p.image}" alt="">
      <div class="pbody">
        <h2>${esc(p.title)}</h2>
        <div class="pprice">${money(p.price)}</div>
        <div class="pdesc">${esc(p.description || '')}</div>
        <button class="btn" id="buy">🛒 Buyurtma berish</button>
      </div>`);
    $('#buy').onclick = () => { haptic('medium'); openOrder(p); };
  } catch (e) {
    closeSheet(true);
    toast(e.message, true);
  }
}

function openOrder(p) {
  let qty = 1;
  setSheet(`<div class="form">
    <h3>📝 Buyurtma berish</h3>
    <div class="fld"><label>Ismingiz</label><input id="o-name" maxlength="60"></div>
    <div class="fld"><label>Telefon raqam</label><input id="o-phone" type="tel" value="+998"></div>
    <div class="fld"><label>Viloyat</label><select id="o-reg"><option value="">Tanlang</option>${S.regions.map((r) => `<option>${esc(r)}</option>`).join('')}</select></div>
    <div class="fld"><label>Tuman</label><input id="o-dis"></div>
    <div class="fld"><label>🎟 Promo kod</label><input id="o-promo" placeholder="PROMO"></div>
    <div class="total"><span>Jami:</span><b id="tot">${money(p.price)}</b></div>
    <button class="btn" id="send">✅ Yuborish</button>
  </div>`);
  $('#send').onclick = async () => {
    const d = {
      productId: p.id,
      name: $('#o-name').value.trim(),
      phone: $('#o-phone').value.trim(),
      region: $('#o-reg').value,
      district: $('#o-dis').value.trim(),
      qty,
      promo: $('#o-promo').value.trim(),
    };
    try {
      await api('/orders', { method: 'POST', body: d });
      setSheet(`<h3>Buyurtma yuborildi!</h3><button class="btn" onclick="closeSheet()">Yopish</button>`);
    } catch (e) {
      toast(e.message, true);
    }
  };
}

async function renderOrders() {
  $('#view').innerHTML = `<h2 class="sec">📦 Buyurtmalarim</h2><div class="list" id="ol">Yuklanmoqda...</div>`;
  try {
    const list = await api('/my-orders');
    $('#ol').innerHTML = list.map((o) => `<div class="li"><b>${esc(o.title)}</b><span>${money(o.price * o.qty)}</span></div>`).join('') || 'Hali buyurtmalar yo\'q';
  } catch (e) { $('#ol').innerHTML = e.message; }
}

/* ===================== ADMIN / PANEL ===================== */
const PT = {
  seller: [['stats', 'Statistika'], ['add', 'Qo\'shish'], ['mine', 'Mahsulotlarim'], ['sorders', 'Buyurtmalar'], ['settings', 'Karta']],
  admin: [['astats', 'Umumiy'], ['sellers', 'Sotuvchilar'], ['ads', 'Reklama'], ['promos', '🎟 Promo kod'], ['cats', 'Bo\'limlar'], ['add', 'Mahsulot'], ['mine', 'Mahsulotlar'], ['sorders', 'Buyurtmalar'], ['settings', 'Karta']],
};

function renderPanel() {
  const tabs = PT[S.me.role];
  if (!tabs) { S.tab = 'home'; return render(); }
  if (!S.ptab || !tabs.some((t) => t[0] === S.ptab)) S.ptab = tabs[0][0];
  $('#view').innerHTML = `<div class="pt" id="pt">${tabs.map(([k, n]) => `<button data-p="${k}" class="${S.ptab === k ? 'on' : ''}">${n}</button>`).join('')}</div><div id="pv"></div>`;
  $('#pt').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.ptab = b.dataset.p;
    [...$('#pt').children].forEach((x) => x.classList.toggle('on', x === b));
    panelView();
  });
  panelView();
}
function panelView() {
  const v = { astats: viewAdminStats, promos: viewPromos, add: viewAdd, mine: viewMine, sorders: viewStaffOrders, sellers: viewSellers, ads: viewAds, cats: viewCats, settings: viewSettings }[S.ptab] || (() => $('#pv').innerHTML = 'Bo\'lim topilmadi');
  v().catch((e) => { const pv = $('#pv'); if (pv) pv.innerHTML = `<div class="empty"><b>⚠️</b>${esc(e.message)}</div>`; });
}

async function viewAdminStats() { $('#pv').innerHTML = 'Statistika bo\'limi'; }
async function viewAdd() { $('#pv').innerHTML = 'Mahsulot qo\'shish'; }
async function viewMine() { $('#pv').innerHTML = 'Mening mahsulotlarim'; }
async function viewStaffOrders() { $('#pv').innerHTML = 'Buyurtmalar'; }
async function viewSellers() { $('#pv').innerHTML = 'Sotuvchilar'; }
async function viewAds() { $('#pv').innerHTML = 'Reklama'; }
async function viewCats() { $('#pv').innerHTML = 'Bo\'limlar'; }
async function viewSettings() { $('#pv').innerHTML = 'Karta sozlamalari'; }

// PROMO KODLAR BO'LIMI
async function viewPromos() {
  const list = await api('/admin/promos');
  $('#pv').innerHTML = `<div class="form" style="padding:0">
    <div class="fld"><label>Promo kod</label><input id="p-c" placeholder="YANGI10"></div>
    <div class="fld"><label>Foiz (%)</label><input id="p-v" type="number" placeholder="10"></div>
    <button class="btn" id="p-s">Qo'shish</button></div>
    <h2 class="sec">Promo kodlar (${list.length})</h2>
    <div class="list" id="pl">${list.map((c) => `<div class="li"><b>${esc(c.code)}</b> — ${c.value}% <button class="x" data-d="${c.id}">🗑</button></div>`).join('')}</div>`;
  
  $('#p-s').onclick = async () => {
    const code = $('#p-c').value.trim();
    const value = $('#p-v').value;
    try {
      await api('/admin/promos', { method: 'POST', body: { code, type: 'percent', value, maxUses: 0 } });
      toast('Qo\'shildi!'); viewPromos();
    } catch (e) { toast(e.message, true); }
  };
  $('#pl').onclick = async (e) => {
    const b = e.target.closest('[data-d]');
    if (b && confirm('O\'chirasizmi?')) {
      await api('/admin/promos/' + b.dataset.d, { method: 'DELETE' });
      viewPromos();
    }
  };
}

(async function init() {
  try {
    const b = await api('/bootstrap');
    S.me = b.me; S.cats = b.categories; S.ads = b.ads; S.regions = b.regions;
    renderTabs();
    render();
  } catch (e) {
    $('#view').innerHTML = `<div class="empty"><b>⚠️</b>${esc(e.message)}</div>`;
  }
})();
