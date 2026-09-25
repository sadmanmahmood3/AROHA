// Builds the parts shared by every page: announcement bar, header, bag drawer, footer.
import { CONFIG } from './config.js';
import { isConfigured } from './supabase.js';
import { getSettings } from './api.js';
import { getCart, setQty, removeItem, cartCount, cartSubtotal } from './cart.js';
import { $, esc, money, fitText } from './utils.js';
import { placeholderHTML } from './components.js';

export async function renderLayout({ active = '' } = {}) {
  const settings = await getSettings();
  const { email, phone, location } = CONFIG.CONTACT;
  const social = Object.entries(CONFIG.SOCIAL).filter(([, url]) => url);

  const top = document.createElement('div');
  top.innerHTML = `
    ${!isConfigured ? `<div class="setup-banner">Preview mode — the website isn't connected to the database yet. Follow <b>README.md</b> to finish setup.</div>` : ''}
    ${settings.announcement ? `<div class="announce"><span>${esc(settings.announcement)}</span></div>` : ''}
    <header class="site-header" id="siteHeader">
      <div class="header-inner">
        <button class="icon-btn menu-toggle" id="menuToggle" aria-label="Open menu" aria-expanded="false">
          <span></span><span></span>
        </button>
        <nav class="main-nav" aria-label="Main">
          <a href="shop.html?cat=hoodie" class="${active === 'hoodie' ? 'active' : ''}">Hoodies</a>
          <a href="shop.html?cat=punjabi" class="${active === 'punjabi' ? 'active' : ''}">Punjabi</a>
          <a href="shop.html" class="${active === 'all' ? 'active' : ''}">Shop all</a>
        </nav>
        <a href="index.html" class="logo" aria-label="${CONFIG.BRAND} home">${CONFIG.BRAND}</a>
        <div class="header-actions">
          <a href="account.html" class="hide-sm ${active === 'account' ? 'active' : ''}">Account</a>
          <button class="bag-btn" id="bagBtn" aria-label="Open bag">Bag (<span id="bagCount">0</span>)</button>
        </div>
      </div>
      <div class="mobile-menu" id="mobileMenu">
        <a href="shop.html?cat=hoodie">Hoodies</a>
        <a href="shop.html?cat=punjabi">Punjabi</a>
        <a href="shop.html">Shop all</a>
        <a href="account.html">Account</a>
        <a href="info.html#contact">Contact</a>
      </div>
    </header>`;
  document.body.prepend(...top.children);

  const bottom = document.createElement('div');
  bottom.innerHTML = `
    <footer class="site-footer">
      <div class="footer-grid">
        <div>
          <p class="footer-head">Shop</p>
          <a href="shop.html?cat=hoodie">Hoodies</a>
          <a href="shop.html?cat=punjabi">Punjabi</a>
          <a href="shop.html">Shop all</a>
        </div>
        <div>
          <p class="footer-head">Help</p>
          <a href="info.html#shipping">Shipping</a>
          <a href="info.html#returns">Returns &amp; exchange</a>
          <a href="info.html#sizes">Size guide</a>
          <a href="account.html">My orders</a>
        </div>
        <div>
          <p class="footer-head">Contact</p>
          <a href="mailto:${email}">${email}</a>
          <a href="tel:${phone}">${phone}</a>
          <span>${esc(location)}</span>
          ${social.map(([name, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${name[0].toUpperCase() + name.slice(1)}</a>`).join('')}
        </div>
        <div>
          <p class="footer-head">Payment</p>
          <span>Cash on delivery</span>
          <span>bKash</span>
          <span>Delivery all over Bangladesh</span>
        </div>
      </div>
      <p class="footer-wordmark" aria-hidden="true">${CONFIG.BRAND}</p>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} ${CONFIG.BRAND}. All rights reserved.</span>
        <span>Designed in Dhaka</span>
      </div>
    </footer>

    <div class="drawer-overlay" id="drawerOverlay"></div>
    <aside class="drawer" id="bagDrawer" aria-label="Shopping bag" aria-hidden="true">
      <div class="drawer-head">
        <p class="drawer-title">Bag (<span id="drawerCount">0</span>)</p>
        <button class="icon-btn close-btn" id="bagClose" aria-label="Close bag">✕</button>
      </div>
      <div class="drawer-body" id="bagItems"></div>
      <div class="drawer-foot" id="bagFoot"></div>
    </aside>
    <div class="toast" id="toast" role="status"></div>`;
  document.body.append(...bottom.children);
  fitText(document.querySelector('.footer-wordmark'));

  // Mobile menu
  const toggle = $('#menuToggle');
  toggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    toggle.setAttribute('aria-expanded', open);
  });

  // Header shadow on scroll
  const header = $('#siteHeader');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Bag drawer
  $('#bagBtn').addEventListener('click', openBag);
  $('#bagClose').addEventListener('click', closeBag);
  $('#drawerOverlay').addEventListener('click', closeBag);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeBag());
  $('#bagItems').addEventListener('click', onBagClick);
  window.addEventListener('cart:change', renderBag);
  window.addEventListener('storage', renderBag); // bag changed in another tab
  renderBag();

  return settings;
}

export function openBag() {
  document.body.classList.add('bag-open');
  $('#bagDrawer').setAttribute('aria-hidden', 'false');
}

export function closeBag() {
  document.body.classList.remove('bag-open');
  $('#bagDrawer')?.setAttribute('aria-hidden', 'true');
}

function onBagClick(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const { id, size, act } = btn.dataset;
  const item = getCart().find((i) => i.product_id === id && i.size === size);
  if (!item) return;
  if (act === 'inc') setQty(id, size, item.quantity + 1);
  if (act === 'dec') setQty(id, size, item.quantity - 1);
  if (act === 'remove') removeItem(id, size);
}

function renderBag() {
  const items = getCart();
  const count = cartCount();
  $('#bagCount').textContent = count;
  $('#drawerCount').textContent = count;

  if (!items.length) {
    $('#bagItems').innerHTML = `
      <div class="bag-empty">
        <p>Your bag is empty.</p>
        <a href="shop.html" class="btn btn-dark">Shop now</a>
      </div>`;
    $('#bagFoot').innerHTML = '';
    return;
  }

  $('#bagItems').innerHTML = items.map((i) => `
    <div class="bag-item">
      <a href="product.html?id=${i.product_id}" class="bag-img">
        ${i.image ? `<img src="${esc(i.image)}" alt="">` : placeholderHTML('A')}
      </a>
      <div class="bag-info">
        <a href="product.html?id=${i.product_id}" class="bag-name">${esc(i.name)}</a>
        <p class="muted small">${i.color ? esc(i.color) + ' · ' : ''}Size ${esc(i.size)}</p>
        <div class="qty qty-sm">
          <button data-act="dec" data-id="${i.product_id}" data-size="${esc(i.size)}" aria-label="Decrease">−</button>
          <span>${i.quantity}</span>
          <button data-act="inc" data-id="${i.product_id}" data-size="${esc(i.size)}" aria-label="Increase">+</button>
        </div>
      </div>
      <div class="bag-right">
        <p>${money(i.price * i.quantity)}</p>
        <button class="link-btn" data-act="remove" data-id="${i.product_id}" data-size="${esc(i.size)}">Remove</button>
      </div>
    </div>`).join('');

  $('#bagFoot').innerHTML = `
    <div class="row-between"><span>Subtotal</span><strong>${money(cartSubtotal())}</strong></div>
    <p class="muted small">Delivery charge is added at checkout.</p>
    <a href="checkout.html" class="btn btn-dark btn-block">Checkout</a>`;
}
