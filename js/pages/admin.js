// AROHA admin panel: products, photos, stock, orders, website settings.
import { sb, isConfigured, IMAGE_BUCKET } from '../supabase.js';
import { CONFIG } from '../config.js';
import { getUser, signInWithGoogle, signOut } from '../auth.js';
import { placeholderHTML } from '../components.js';
import {
  $, $$, esc, money, formatDate, toast, errorText,
  CATEGORIES, STATUS, AREAS, PAYMENTS, GOOGLE_ICON,
} from '../utils.js';

const app = $('#app');
const LOW_STOCK = 2;

const state = {
  user: null,
  products: [],
  stock: {},      // product_id -> [{size, quantity, sort_order}]
  orders: [],
  settings: null,
  productFilter: 'all',
  productSearch: '',
  orderFilter: 'active',
  orderSearch: '',
  openOrder: null,
};

init();

// ---------------------------------------------------------------------
// Sign-in gate
// ---------------------------------------------------------------------
async function init() {
  if (!isConfigured) {
    return gate(`
      <p class="eyebrow">Admin</p>
      <p>The website isn't connected to the database yet.</p>
      <p class="muted small">Open <b>README.md</b> and follow the setup steps, then paste your keys into <b>js/config.js</b>.</p>
      <a href="index.html" class="btn btn-outline">Back to website</a>`);
  }

  state.user = await getUser();
  if (!state.user) {
    gate(`
      <p class="eyebrow">Admin sign in</p>
      <p class="muted">Sign in with the admin Google account <b>${esc(CONFIG.ADMIN_EMAIL)}</b>.</p>
      <button class="btn btn-google btn-block" id="googleBtn">${GOOGLE_ICON} Continue with Google</button>
      <a href="index.html" class="link-btn">Back to website</a>`);
    $('#googleBtn').addEventListener('click', async () => {
      try { await signInWithGoogle(); } catch (err) { toast(errorText(err), 'error'); }
    });
    return;
  }

  const { data: ok, error } = await sb.rpc('is_admin');
  if (error || !ok) {
    gate(`
      <p class="eyebrow">Not allowed</p>
      <p>You're signed in as <b>${esc(state.user.email)}</b>, which is not an admin account.</p>
      <p class="muted small">Sign out, then sign in with <b>${esc(CONFIG.ADMIN_EMAIL)}</b>.</p>
      <button class="btn btn-dark btn-block" id="outBtn">Sign out</button>
      <a href="index.html" class="link-btn">Back to website</a>`);
    $('#outBtn').addEventListener('click', async () => { await signOut(); location.reload(); });
    return;
  }

  shell();
  await loadAll();
  route();
  window.addEventListener('hashchange', route);
}

function gate(inner) {
  app.innerHTML = `<div class="gate"><div class="gate-card"><p class="logo">${CONFIG.BRAND}</p>${inner}</div></div>`;
}

// ---------------------------------------------------------------------
// Layout + routing
// ---------------------------------------------------------------------
function shell() {
  app.innerHTML = `
    <div class="admin">
      <aside class="admin-side">
        <a href="#dashboard" class="logo">${CONFIG.BRAND}</a>
        <p class="tag">Admin</p>
        <nav class="admin-nav">
          <a href="#dashboard" data-route="dashboard">Dashboard</a>
          <a href="#products" data-route="products">Products</a>
          <a href="#orders" data-route="orders">Orders <span class="nav-count hidden" id="pendingCount"></span></a>
          <a href="#settings" data-route="settings">Settings</a>
        </nav>
        <div class="admin-side-foot">
          <a href="index.html" target="_blank">View website ↗</a>
          <button id="signOutBtn">Sign out</button>
          <span class="who">${esc(state.user.email)}</span>
        </div>
      </aside>
      <main class="admin-main" id="view"></main>
    </div>
    <div class="panel-overlay" id="panelOverlay"></div>
    <aside class="panel" id="panel" aria-hidden="true"></aside>`;
  $('#signOutBtn').addEventListener('click', async () => { await signOut(); location.href = 'index.html'; });
  $('#panelOverlay').addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closePanel());
}

function route() {
  const r = (location.hash || '#dashboard').slice(1);
  const views = { dashboard, products: productsView, orders: ordersView, settings: settingsView };
  const fn = views[r] || dashboard;
  $('#view').onclick = null;
  closePanel();
  $$('.admin-nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === (views[r] ? r : 'dashboard')));
  fn();
  window.scrollTo(0, 0);
}

async function loadAll() {
  await Promise.all([loadProducts(), loadOrders(), loadSettings()]);
}

async function loadProducts() {
  const [p, s] = await Promise.all([
    sb.from('products').select('*').order('created_at', { ascending: false }),
    sb.from('product_stock').select('*').order('sort_order'),
  ]);
  if (p.error || s.error) return toast(errorText(p.error || s.error), 'error');
  state.products = p.data;
  state.stock = {};
  for (const row of s.data) (state.stock[row.product_id] ||= []).push(row);
}

async function loadOrders() {
  const { data, error } = await sb
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return toast(errorText(error), 'error');
  state.orders = data;
  const pending = data.filter((o) => o.status === 'pending').length;
  const badge = $('#pendingCount');
  badge.textContent = pending;
  badge.classList.toggle('hidden', !pending);
}

async function loadSettings() {
  const { data } = await sb.from('site_settings').select('*').eq('id', 1).maybeSingle();
  state.settings = data || {};
}

// Helpers
const stockOf = (id) => state.stock[id] || [];
const totalStock = (id) => stockOf(id).reduce((n, s) => n + s.quantity, 0);
const isSoldOut = (id) => totalStock(id) === 0;

function stockPills(id) {
  const rows = stockOf(id);
  if (!rows.length) return '<span class="muted small">No sizes</span>';
  return `<div class="stock-pills">${rows.map((s) =>
    `<span class="pill ${s.quantity === 0 ? 'zero' : s.quantity <= LOW_STOCK ? 'low' : ''}">${esc(s.size)}: ${s.quantity}</span>`).join('')}</div>`;
}

function statusChips(p) {
  const chips = [];
  if (isSoldOut(p.id)) chips.push('<span class="tag-chip chip-soldout">Sold out</span>');
  chips.push(p.is_active ? '<span class="tag-chip chip-live">Live</span>' : '<span class="tag-chip chip-hidden">Hidden</span>');
  if (p.is_featured) chips.push('<span class="tag-chip chip-featured">Home page</span>');
  return `<div class="stock-pills">${chips.join('')}</div>`;
}

function thumb(src) {
  return `<div class="thumb">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : placeholderHTML('A')}</div>`;
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------
function dashboard() {
  const orders = state.orders;
  const today = new Date().toDateString();
  const pending = orders.filter((o) => o.status === 'pending');
  const todays = orders.filter((o) => new Date(o.created_at).toDateString() === today);
  const revenue = orders.filter((o) => o.status === 'delivered').reduce((n, o) => n + o.total, 0);
  const soldOut = state.products.filter((p) => isSoldOut(p.id));
  const low = state.products
    .flatMap((p) => stockOf(p.id).filter((s) => s.quantity > 0 && s.quantity <= LOW_STOCK).map((s) => ({ p, s })));

  $('#view').innerHTML = `
    <div class="admin-head"><h1>Dashboard</h1><button class="btn btn-dark" id="addFromDash">+ Add product</button></div>
    <div class="stats">
      <div class="stat ${pending.length ? 'alert' : ''}"><span>Pending orders</span><strong>${pending.length}</strong></div>
      <div class="stat"><span>Orders today</span><strong>${todays.length}</strong></div>
      <div class="stat"><span>Products</span><strong>${state.products.length}</strong></div>
      <div class="stat"><span>Delivered sales</span><strong>${money(revenue)}</strong></div>
    </div>
    <div class="two-col">
      <div class="card">
        <div class="card-pad section-label" style="margin:0">Latest orders <a href="#orders" class="link-btn">View all</a></div>
        ${orders.length ? `<div class="table-wrap"><table class="table"><tbody>
          ${orders.slice(0, 6).map((o) => `
            <tr class="clickable" data-order="${o.id}">
              <td><b>#${o.order_number}</b><br><span class="muted small">${formatDate(o.created_at, true)}</span></td>
              <td>${esc(o.customer_name)}</td>
              <td>${money(o.total)}</td>
              <td><span class="status status-${o.status}">${STATUS[o.status]}</span></td>
            </tr>`).join('')}
        </tbody></table></div>` : '<p class="card-pad muted">No orders yet.</p>'}
      </div>
      <div class="card">
        <div class="card-pad section-label" style="margin:0">Stock alerts <a href="#products" class="link-btn">All products</a></div>
        ${soldOut.length || low.length ? `<div class="table-wrap"><table class="table"><tbody>
          ${soldOut.map((p) => `<tr class="clickable" data-edit="${p.id}"><td><div class="cell-product">${thumb(p.images[0])}${esc(p.name)}</div></td><td><span class="tag-chip chip-soldout">Sold out</span></td></tr>`).join('')}
          ${low.map(({ p, s }) => `<tr class="clickable" data-edit="${p.id}"><td><div class="cell-product">${thumb(p.images[0])}${esc(p.name)}</div></td><td><span class="pill low">Size ${esc(s.size)}: ${s.quantity} left</span></td></tr>`).join('')}
        </tbody></table></div>` : `<p class="card-pad muted">${state.products.length ? 'All good — nothing is running low.' : 'Add your first product to get started.'}</p>`}
      </div>
    </div>`;

  $('#addFromDash').addEventListener('click', () => openEditor(null));
  $('#view').onclick = (e) => {
    const o = e.target.closest('[data-order]');
    if (o) { state.openOrder = o.dataset.order; location.hash = '#orders'; }
    const p = e.target.closest('[data-edit]');
    if (p) openEditor(p.dataset.edit);
  };
}

// ---------------------------------------------------------------------
// Products list
// ---------------------------------------------------------------------
function productsView() {
  $('#view').innerHTML = `
    <div class="admin-head"><h1>Products</h1><button class="btn btn-dark" id="addBtn">+ Add product</button></div>
    <div class="filters">
      ${[['all', 'All'], ['hoodie', 'Hoodies'], ['punjabi', 'Punjabi'], ['soldout', 'Sold out'], ['hidden', 'Hidden']]
        .map(([k, l]) => `<button class="filter-btn ${state.productFilter === k ? 'active' : ''}" data-filter="${k}">${l}</button>`).join('')}
      <input class="search" id="pSearch" placeholder="Search products…" value="${esc(state.productSearch)}">
    </div>
    <div class="card" id="productTable"></div>`;

  $('#addBtn').addEventListener('click', () => openEditor(null));
  $$('[data-filter]').forEach((b) => b.addEventListener('click', () => { state.productFilter = b.dataset.filter; productsView(); }));
  $('#pSearch').addEventListener('input', (e) => { state.productSearch = e.target.value; drawProductTable(); });
  drawProductTable();
}

function drawProductTable() {
  const f = state.productFilter;
  const q = state.productSearch.trim().toLowerCase();
  const list = state.products.filter((p) => {
    if (f === 'hoodie' || f === 'punjabi') { if (p.category !== f) return false; }
    if (f === 'soldout' && !isSoldOut(p.id)) return false;
    if (f === 'hidden' && p.is_active) return false;
    if (q && !`${p.name} ${p.color}`.toLowerCase().includes(q)) return false;
    return true;
  });

  $('#productTable').innerHTML = list.length ? `
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Product</th><th class="hide-mobile">Category</th><th>Price</th><th>Stock (only you see this)</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${list.map((p) => `
          <tr class="clickable" data-edit="${p.id}">
            <td><div class="cell-product">${thumb(p.images[0])}<div><b>${esc(p.name)}</b>${p.color ? `<br><span class="muted small">${esc(p.color)}</span>` : ''}</div></div></td>
            <td class="hide-mobile">${CATEGORIES[p.category].single}</td>
            <td>${money(p.price)}${p.compare_at_price > p.price ? `<br><s class="muted small">${money(p.compare_at_price)}</s>` : ''}</td>
            <td>${stockPills(p.id)}<span class="muted small">Total: ${totalStock(p.id)}</span></td>
            <td>${statusChips(p)}</td>
            <td><button class="mini-btn">Edit</button></td>
          </tr>`).join('')}
      </tbody>
    </table></div>` : `<p class="card-pad muted">${state.products.length ? 'No products match.' : 'No products yet. Click “+ Add product” to add your first hoodie or punjabi.'}</p>`;

  $$('#productTable [data-edit]').forEach((tr) => tr.addEventListener('click', () => openEditor(tr.dataset.edit)));
}

// ---------------------------------------------------------------------
// Product editor (slide-over panel)
// ---------------------------------------------------------------------
function openPanel(html) {
  $('#panel').innerHTML = html;
  $('#panel').setAttribute('aria-hidden', 'false');
  document.body.classList.add('panel-open');
}
function closePanel() {
  document.body.classList.remove('panel-open');
  $('#panel')?.setAttribute('aria-hidden', 'true');
}

async function openEditor(id) {
  if (id) await loadProducts(); // make sure stock numbers are fresh
  const p = id ? state.products.find((x) => x.id === id) : null;
  const ed = {
    images: [...(p?.images || [])],
    sizes: p ? stockOf(p.id).map((s) => ({ size: s.size, qty: s.quantity })) : CATEGORIES.hoodie.sizes.map((s) => ({ size: s, qty: 0 })),
    uploading: 0,
  };

  openPanel(`
    <div class="panel-head">
      <p>${p ? 'Edit product' : 'New product'}</p>
      <button class="icon-btn close-btn" id="closeEd" aria-label="Close">✕</button>
    </div>
    <form class="panel-body" id="edForm" novalidate>
      <div>
        <p class="section-label">Photos <span class="muted small" style="text-transform:none;letter-spacing:0;font-weight:400">First photo is the main one</span></p>
        <div class="img-grid" id="imgGrid"></div>
      </div>

      <div class="fieldset">
        <p class="section-label" style="margin:0">Details</p>
        <div class="field"><label for="fName">Product name</label><input id="fName" required maxlength="120" value="${esc(p?.name || '')}" placeholder="e.g. Heavyweight Oversized Hoodie"></div>
        <div class="field-row">
          <div class="field"><label for="fCat">Category</label>
            <select id="fCat">${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}" ${p?.category === k ? 'selected' : ''}>${c.single}</option>`).join('')}</select>
          </div>
          <div class="field"><label for="fColor">Colour</label><input id="fColor" maxlength="60" value="${esc(p?.color || '')}" placeholder="e.g. Jet Black"></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="fPrice">Price (৳)</label><input id="fPrice" type="number" min="0" step="1" required value="${p?.price ?? ''}" placeholder="e.g. 1850"></div>
          <div class="field"><label for="fCompare">Old price (৳) — optional</label><input id="fCompare" type="number" min="0" step="1" value="${p?.compare_at_price ?? ''}" placeholder="Shows as a sale"></div>
        </div>
        <div class="field"><label for="fDesc">Description</label><textarea id="fDesc" maxlength="3000" placeholder="Fabric, fit, care instructions…">${esc(p?.description || '')}</textarea></div>
      </div>

      <div>
        <p class="section-label">Sizes &amp; stock <span class="muted small" style="text-transform:none;letter-spacing:0;font-weight:400">Only you can see these numbers</span></p>
        <div class="stock-head"><span>Size</span><span>Quantity in stock</span><span></span></div>
        <div class="stock-rows" id="stockRows"></div>
        <div class="preset-row">
          <button type="button" class="mini-btn" id="addSize">+ Add size</button>
          <button type="button" class="mini-btn" data-preset="hoodie">Use hoodie sizes (S–XXL)</button>
          <button type="button" class="mini-btn" data-preset="punjabi">Use punjabi sizes (38–46)</button>
        </div>
        <p class="muted small" style="margin-top:8px">When every size reaches 0, the product shows as <b>Sold out</b> automatically.</p>
      </div>

      <div>
        <p class="section-label">Visibility</p>
        <div class="toggle-row">
          <label class="check"><input type="checkbox" id="fActive" ${p?.is_active === false ? '' : 'checked'}> Show on website</label>
          <label class="check"><input type="checkbox" id="fFeatured" ${p?.is_featured ? 'checked' : ''}> Feature on home page</label>
        </div>
      </div>
      <div id="edError" class="form-error hidden" role="alert"></div>
    </form>
    <div class="panel-foot">
      ${p ? '<button class="danger" id="delBtn" type="button">Delete product</button>' : '<span></span>'}
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline" type="button" id="cancelEd">Cancel</button>
        <button class="btn btn-dark" type="button" id="saveEd">${p ? 'Save changes' : 'Add product'}</button>
      </div>
    </div>`);

  // ----- photos -----
  const drawImages = () => {
    $('#imgGrid').innerHTML = ed.images.map((src, i) => `
      <div class="img-item">
        <img src="${esc(src)}" alt="">
        ${i === 0 ? '<span class="main-tag">Main</span>' : ''}
        <div class="img-actions">
          ${i > 0 ? `<button type="button" data-img-left="${i}" title="Move left">←</button>` : ''}
          <button type="button" data-img-del="${i}" title="Remove">✕</button>
        </div>
      </div>`).join('') +
      Array.from({ length: ed.uploading }, () => '<div class="img-item img-uploading"><div class="spinner"></div></div>').join('') +
      `<label class="img-add" id="imgDrop"><input type="file" accept="image/*" multiple id="imgInput"><span>+ Add photos<br><span class="small">or drag them here</span></span></label>`;

    $('#imgInput').addEventListener('change', (e) => { upload([...e.target.files]); e.target.value = ''; });
    const drop = $('#imgDrop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); upload([...e.dataTransfer.files]); });
  };

  const upload = async (files) => {
    files = files.filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    ed.uploading += files.length;
    drawImages();
    for (const file of files) {
      try {
        ed.images.push(await uploadImage(file, $('#fCat').value));
      } catch (err) {
        console.error(err);
        toast(`Couldn't upload ${file.name}: ${errorText(err)}`, 'error');
      }
      ed.uploading--;
      drawImages();
    }
  };

  $('#imgGrid').addEventListener('click', (e) => {
    const del = e.target.closest('[data-img-del]');
    const left = e.target.closest('[data-img-left]');
    if (del) ed.images.splice(+del.dataset.imgDel, 1);
    if (left) {
      const i = +left.dataset.imgLeft;
      [ed.images[i - 1], ed.images[i]] = [ed.images[i], ed.images[i - 1]];
    }
    if (del || left) { e.preventDefault(); drawImages(); }
  });
  drawImages();

  // ----- sizes & stock -----
  const readSizes = () => {
    ed.sizes = $$('#stockRows .stock-row').map((row) => ({
      size: row.querySelector('[data-k="size"]').value,
      qty: row.querySelector('[data-k="qty"]').value,
    }));
  };
  const drawSizes = () => {
    $('#stockRows').innerHTML = ed.sizes.map((s, i) => `
      <div class="stock-row">
        <input data-k="size" value="${esc(s.size)}" placeholder="e.g. M" maxlength="20" aria-label="Size">
        <input data-k="qty" type="number" min="0" step="1" value="${s.qty}" aria-label="Quantity">
        <button type="button" class="remove-x" data-size-del="${i}" aria-label="Remove size">✕</button>
      </div>`).join('') || '<p class="muted small">No sizes yet — add at least one.</p>';
  };
  $('#stockRows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-size-del]');
    if (!b) return;
    readSizes();
    ed.sizes.splice(+b.dataset.sizeDel, 1);
    drawSizes();
  });
  $('#addSize').addEventListener('click', () => { readSizes(); ed.sizes.push({ size: '', qty: 0 }); drawSizes(); $$('#stockRows [data-k="size"]').at(-1)?.focus(); });
  $$('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    readSizes();
    const old = Object.fromEntries(ed.sizes.map((s) => [s.size, s.qty]));
    ed.sizes = CATEGORIES[b.dataset.preset].sizes.map((s) => ({ size: s, qty: old[s] ?? 0 }));
    drawSizes();
  }));
  // New product: switching category switches the default sizes
  if (!p) {
    $('#fCat').addEventListener('change', (e) => {
      readSizes();
      if (ed.sizes.every((s) => Number(s.qty) === 0)) {
        ed.sizes = CATEGORIES[e.target.value].sizes.map((s) => ({ size: s, qty: 0 }));
        drawSizes();
      }
    });
  }
  drawSizes();

  // ----- buttons -----
  $('#closeEd').addEventListener('click', closePanel);
  $('#cancelEd').addEventListener('click', closePanel);
  $('#saveEd').addEventListener('click', () => { readSizes(); saveProduct(p, ed); });
  $('#delBtn')?.addEventListener('click', () => deleteProduct(p));
}

async function saveProduct(p, ed) {
  const err = (m) => { const el = $('#edError'); el.textContent = m; el.classList.remove('hidden'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  $('#edError').classList.add('hidden');

  if (ed.uploading) return err('Please wait — photos are still uploading.');
  const name = $('#fName').value.trim();
  const price = Number($('#fPrice').value);
  const compareRaw = $('#fCompare').value.trim();
  const compare = compareRaw === '' ? null : Number(compareRaw);
  if (!name) return err('Please enter a product name.');
  if (!Number.isInteger(price) || price < 0) return err('Please enter a valid price (whole taka, no decimals).');
  if (compare !== null && (!Number.isInteger(compare) || compare < 0)) return err('Old price must be a whole number.');

  const sizes = ed.sizes.map((s) => ({ size: String(s.size).trim(), qty: Number(s.qty) }));
  if (!sizes.length) return err('Add at least one size.');
  if (sizes.some((s) => !s.size)) return err('Every size needs a name (e.g. M or 40).');
  if (sizes.some((s) => !Number.isInteger(s.qty) || s.qty < 0)) return err('Stock quantities must be whole numbers (0 or more).');
  if (new Set(sizes.map((s) => s.size.toLowerCase())).size !== sizes.length) return err('The same size is listed twice.');

  const payload = {
    name,
    category: $('#fCat').value,
    color: $('#fColor').value.trim(),
    price,
    compare_at_price: compare,
    description: $('#fDesc').value.trim(),
    images: ed.images,
    is_active: $('#fActive').checked,
    is_featured: $('#fFeatured').checked,
    updated_at: new Date().toISOString(),
  };

  const btn = $('#saveEd');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    let id = p?.id;
    if (id) {
      const { error } = await sb.from('products').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from('products').insert(payload).select('id').single();
      if (error) throw error;
      id = data.id;
    }

    // Stock: remove deleted sizes, then save the rest
    const keep = new Set(sizes.map((s) => s.size));
    const removed = stockOf(id).map((s) => s.size).filter((s) => !keep.has(s));
    if (removed.length) {
      const { error } = await sb.from('product_stock').delete().eq('product_id', id).in('size', removed);
      if (error) throw error;
    }
    const { error: stockErr } = await sb.from('product_stock').upsert(
      sizes.map((s, i) => ({ product_id: id, size: s.size, quantity: s.qty, sort_order: i })),
      { onConflict: 'product_id,size' },
    );
    if (stockErr) throw stockErr;

    await loadProducts();
    closePanel();
    toast(p ? 'Product updated' : 'Product added');
    route();
  } catch (e) {
    console.error(e);
    err(errorText(e));
    btn.disabled = false;
    btn.textContent = p ? 'Save changes' : 'Add product';
  }
}

async function deleteProduct(p) {
  if (!confirm(`Delete "${p.name}"? This can't be undone.\n\nTip: to just hide it from customers, untick "Show on website" instead.`)) return;
  const { error } = await sb.from('products').delete().eq('id', p.id);
  if (error) return toast(errorText(error), 'error');
  // Remove its photos from storage (ignore errors)
  const paths = p.images.map(storagePath).filter(Boolean);
  if (paths.length) sb.storage.from(IMAGE_BUCKET).remove(paths).catch(() => {});
  await loadProducts();
  closePanel();
  toast('Product deleted');
  route();
}

// ---------------------------------------------------------------------
// Photo upload (resized in the browser so pages load fast)
// ---------------------------------------------------------------------
async function compress(file, maxSide = 1800) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
    return blob ? { blob, ext: 'jpg', type: 'image/jpeg' } : null;
  } catch {
    return null; // e.g. HEIC photos the browser can't read — upload the original
  }
}

async function uploadImage(file, folder = 'misc') {
  if (file.size > 25 * 1024 * 1024) throw new Error('Photo is larger than 25 MB.');
  const small = await compress(file);
  const ext = small?.ext || (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(IMAGE_BUCKET).upload(path, small?.blob || file, {
    contentType: small?.type || file.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return sb.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function storagePath(url) {
  const marker = `/object/public/${IMAGE_BUCKET}/`;
  const i = url?.indexOf(marker) ?? -1;
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

// ---------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------
async function ordersView() {
  $('#view').innerHTML = `
    <div class="admin-head"><h1>Orders</h1><button class="btn btn-outline" id="refreshOrders">Refresh</button></div>
    <div class="filters">
      ${[['active', 'Open'], ['pending', 'Pending'], ['confirmed', 'Confirmed'], ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'], ['all', 'All']]
        .map(([k, l]) => `<button class="filter-btn ${state.orderFilter === k ? 'active' : ''}" data-ofilter="${k}">${l}</button>`).join('')}
      <input class="search" id="oSearch" placeholder="Search name, phone, order #…" value="${esc(state.orderSearch)}">
    </div>
    <div id="orderList"></div>`;

  $('#refreshOrders').addEventListener('click', async () => { await loadOrders(); drawOrders(); toast('Orders refreshed'); });
  $$('[data-ofilter]').forEach((b) => b.addEventListener('click', () => { state.orderFilter = b.dataset.ofilter; ordersView(); }));
  $('#oSearch').addEventListener('input', (e) => { state.orderSearch = e.target.value; drawOrders(); });
  drawOrders();
}

function drawOrders() {
  const f = state.orderFilter;
  const q = state.orderSearch.trim().toLowerCase();
  const list = state.orders.filter((o) => {
    if (f === 'active' && ['delivered', 'cancelled'].includes(o.status)) return false;
    if (!['active', 'all'].includes(f) && o.status !== f) return false;
    if (q && !`${o.order_number} ${o.customer_name} ${o.phone} ${o.customer_email}`.toLowerCase().includes(q)) return false;
    return true;
  });

  if (!list.length) {
    $('#orderList').innerHTML = `<div class="card"><p class="card-pad muted">${state.orders.length ? 'No orders here.' : 'No orders yet. New orders will appear here and you will get an email.'}</p></div>`;
    return;
  }

  $('#orderList').innerHTML = list.map((o) => {
    const open = state.openOrder === o.id;
    return `
    <div class="card" style="margin-bottom:10px">
      <div class="card-pad row-between clickable" data-toggle="${o.id}" style="cursor:pointer;flex-wrap:wrap">
        <div>
          <b>#${o.order_number}</b> · ${esc(o.customer_name)}
          <p class="muted small">${formatDate(o.created_at, true)} · ${o.order_items.reduce((n, i) => n + i.quantity, 0)} item(s) · ${PAYMENTS[o.payment_method]}</p>
        </div>
        <div style="display:flex;gap:12px;align-items:center">
          <b>${money(o.total)}</b>
          <span class="status status-${o.status}">${STATUS[o.status]}</span>
          <span class="muted">${open ? '▴' : '▾'}</span>
        </div>
      </div>
      ${open ? `
      <div class="card-pad" style="border-top:1px solid var(--gray-100);display:grid;gap:20px">
        <div class="order-detail">
          <div style="display:grid;gap:12px">
            <div class="kv"><span>Customer</span><span>${esc(o.customer_name)}</span></div>
            <div class="kv"><span>Phone</span><a href="tel:${esc(o.phone)}" style="text-decoration:underline">${esc(o.phone)}</a></div>
            <div class="kv"><span>Email</span><a href="mailto:${esc(o.customer_email)}" style="text-decoration:underline">${esc(o.customer_email)}</a></div>
          </div>
          <div style="display:grid;gap:12px">
            <div class="kv"><span>Address (${AREAS[o.delivery_area]})</span><span style="white-space:pre-line">${esc(o.address)}</span></div>
            <div class="kv"><span>Payment</span><span>${PAYMENTS[o.payment_method]}${o.bkash_trx_id ? ` — TrxID <b>${esc(o.bkash_trx_id)}</b>` : ''}</span></div>
            ${o.note ? `<div class="kv"><span>Customer note</span><span>${esc(o.note)}</span></div>` : ''}
          </div>
        </div>
        <div class="order-items">
          ${o.order_items.map((i) => `
            <div class="order-line">
              ${thumb(i.image)}
              <div><p>${esc(i.product_name)}</p><p class="muted small">${i.color ? esc(i.color) + ' · ' : ''}Size ${esc(i.size)} · ${money(i.unit_price)} × ${i.quantity}</p></div>
              <span>${money(i.unit_price * i.quantity)}</span>
            </div>`).join('')}
        </div>
        <div class="summary-lines" style="max-width:320px;margin-left:auto;width:100%">
          <div class="row-between"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
          <div class="row-between"><span>Delivery</span><span>${money(o.delivery_fee)}</span></div>
          <div class="row-between"><b>Total</b><b>${money(o.total)}</b></div>
        </div>
        <div class="row-between" style="flex-wrap:wrap;border-top:1px solid var(--gray-100);padding-top:16px">
          <label class="label" for="st-${o.id}">Order status</label>
          ${o.status === 'cancelled'
            ? '<span class="muted small">Cancelled — stock was returned.</span>'
            : `<select class="status-select" id="st-${o.id}" data-status="${o.id}">
                ${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${l}</option>`).join('')}
              </select>`}
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  $$('[data-toggle]').forEach((el) => el.addEventListener('click', () => {
    state.openOrder = state.openOrder === el.dataset.toggle ? null : el.dataset.toggle;
    drawOrders();
  }));
  $$('[data-status]').forEach((sel) => sel.addEventListener('change', () => changeStatus(sel.dataset.status, sel.value, sel)));
}

async function changeStatus(id, status, sel) {
  const order = state.orders.find((o) => o.id === id);
  if (status === 'cancelled' && !confirm(`Cancel order #${order.order_number}? The items will be put back in stock. This can't be undone.`)) {
    sel.value = order.status;
    return;
  }
  sel.disabled = true;
  const { error } = await sb.rpc('admin_set_order_status', { p_order_id: id, p_status: status });
  if (error) {
    toast(errorText(error), 'error');
    sel.value = order.status;
    sel.disabled = false;
    return;
  }
  toast(`Order #${order.order_number} → ${STATUS[status]}`);
  await Promise.all([loadOrders(), status === 'cancelled' ? loadProducts() : null]);
  drawOrders();
}

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------
function settingsView() {
  const s = state.settings;
  const imgs = { hero_image: s.hero_image, hoodie_image: s.hoodie_image, punjabi_image: s.punjabi_image };

  $('#view').innerHTML = `
    <div class="admin-head"><h1>Settings</h1></div>
    <form class="card card-pad" id="setForm" style="display:grid;gap:28px;max-width:820px" novalidate>
      <div class="fieldset">
        <p class="section-label" style="margin:0">Website</p>
        <div class="field">
          <label for="sAnn">Announcement bar (top of every page)</label>
          <input id="sAnn" maxlength="140" value="${esc(s.announcement || '')}" placeholder="Leave empty to hide">
        </div>
      </div>
      <div class="fieldset">
        <p class="section-label" style="margin:0">Delivery &amp; payment</p>
        <div class="field-row">
          <div class="field"><label for="sIn">Delivery inside Dhaka (৳)</label><input id="sIn" type="number" min="0" value="${s.delivery_inside ?? 70}"></div>
          <div class="field"><label for="sOut">Delivery outside Dhaka (৳)</label><input id="sOut" type="number" min="0" value="${s.delivery_outside ?? 130}"></div>
        </div>
        <div class="field"><label for="sBkash">bKash number customers send money to</label><input id="sBkash" maxlength="20" value="${esc(s.bkash_number || '')}"></div>
      </div>
      <div class="fieldset">
        <p class="section-label" style="margin:0">Home page photos</p>
        <p class="muted small" style="margin-top:-6px">Big, high-quality photos look best. The big banner works well with a wide (landscape) photo.</p>
        ${[['hero_image', 'Big banner (top of home page)'], ['hoodie_image', 'Hoodies tile'], ['punjabi_image', 'Punjabi tile']].map(([k, l]) => `
          <div class="single-img" data-slot="${k}">
            <div class="slot-preview"></div>
            <div><p class="label">${l}</p><p class="muted small">Without a photo, a bold black design is shown.</p></div>
          </div>`).join('')}
      </div>
      <div id="setError" class="form-error hidden" role="alert"></div>
      <div><button class="btn btn-dark" id="saveSet" type="submit">Save settings</button></div>
    </form>`;

  const drawSlot = (k) => {
    const box = $(`[data-slot="${k}"] .slot-preview`);
    box.innerHTML = imgs[k]
      ? `<div class="img-item"><img src="${esc(imgs[k])}" alt=""><div class="img-actions"><button type="button" data-clear="${k}" title="Remove">✕</button></div></div>`
      : `<label class="img-add"><input type="file" accept="image/*" data-upload="${k}"><span>+ Upload</span></label>`;
    box.querySelector('[data-clear]')?.addEventListener('click', () => { imgs[k] = null; drawSlot(k); });
    box.querySelector('[data-upload]')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      box.innerHTML = '<div class="img-item img-uploading"><div class="spinner"></div></div>';
      try { imgs[k] = await uploadImage(file, 'site'); } catch (err) { toast(errorText(err), 'error'); }
      drawSlot(k);
    });
  };
  Object.keys(imgs).forEach(drawSlot);

  $('#setForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inside = Number($('#sIn').value);
    const outside = Number($('#sOut').value);
    const errEl = $('#setError');
    errEl.classList.add('hidden');
    if (!Number.isInteger(inside) || !Number.isInteger(outside) || inside < 0 || outside < 0) {
      errEl.textContent = 'Delivery charges must be whole numbers.';
      return errEl.classList.remove('hidden');
    }
    const btn = $('#saveSet');
    btn.disabled = true;
    const { error } = await sb.from('site_settings').update({
      announcement: $('#sAnn').value.trim(),
      delivery_inside: inside,
      delivery_outside: outside,
      bkash_number: $('#sBkash').value.trim(),
      ...imgs,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    btn.disabled = false;
    if (error) { errEl.textContent = errorText(error); return errEl.classList.remove('hidden'); }
    await loadSettings();
    toast('Settings saved');
  });
}
