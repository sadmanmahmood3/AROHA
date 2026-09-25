import { renderLayout, openBag } from '../layout.js';
import { getProduct, listProducts, getSettings } from '../api.js';
import { addToCart, MAX_QTY } from '../cart.js';
import { productCard, priceHTML, placeholderHTML, sizeGuideTable, emptyState } from '../components.js';
import { $, $$, esc, money, param, toast, CATEGORIES } from '../utils.js';

const settings = await renderLayout();
const app = $('#app');

let product = null;
try {
  product = await getProduct(param('id'));
} catch (err) {
  console.error(err);
}

if (!product) {
  app.innerHTML = `<div class="section">${emptyState('Product not found', 'This product may have been removed.', { href: 'shop.html', label: 'Continue shopping' })}</div>`;
} else {
  render(product);
}

function render(p) {
  const cat = CATEGORIES[p.category];
  document.title = `${p.name} — AROHA`;

  const images = p.images?.length ? p.images : [null];
  const hasSizes = p.sizes.length > 0;

  app.innerHTML = `
    <div class="page-head" style="padding-bottom:0">
      <p class="crumbs"><a href="index.html">Home</a> / <a href="shop.html?cat=${p.category}">${cat.label}</a> / ${esc(p.name)}</p>
    </div>
    <div class="pdp">
      <div class="gallery">
        ${images.map((src, i) => `
          <figure>${src ? `<img src="${esc(src)}" alt="${esc(p.name)} photo ${i + 1}" ${i ? 'loading="lazy"' : ''}>` : placeholderHTML()}</figure>`).join('')}
      </div>

      <div class="pdp-info">
        <div>
          <p class="eyebrow muted" style="margin-bottom:10px">${cat.single}</p>
          <h1>${esc(p.name)}</h1>
        </div>
        <p class="pdp-price">${priceHTML(p)}</p>
        ${p.color ? `<p><span class="label">Colour:</span> ${esc(p.color)}</p>` : ''}

        ${p.sold_out ? `
          <div class="soldout-note"><b>Sold out.</b> This piece is sold out right now. New stock may arrive soon.</div>
          <button class="btn btn-dark btn-block" disabled>Sold out</button>
        ` : `
          <div class="pdp-block">
            <div class="row-between">
              <span class="label">Select size</span>
              <a href="#guide" class="link-btn" id="guideLink">Size guide</a>
            </div>
            <div class="size-grid" id="sizes">
              ${p.sizes.map((s) => `
                <button class="size-btn" data-size="${esc(s.size)}" ${s.in_stock ? '' : 'disabled title="Sold out"'}>${esc(s.size)}</button>`).join('')}
            </div>
          </div>
          <div class="add-row">
            <div class="qty">
              <button id="qtyDec" aria-label="Decrease quantity">−</button>
              <span id="qty">1</span>
              <button id="qtyInc" aria-label="Increase quantity">+</button>
            </div>
            <button class="btn btn-dark" id="addBtn" ${hasSizes ? '' : 'disabled'}>Add to bag</button>
          </div>
        `}

        <div class="accordion">
          ${p.description ? `<details open><summary>Details</summary><div class="acc-body">${esc(p.description)}</div></details>` : ''}
          <details id="guide"><summary>Size guide</summary><div class="acc-body" style="white-space:normal">${sizeGuideTable(p.category)}</div></details>
          <details><summary>Delivery &amp; payment</summary>
            <div class="acc-body" style="white-space:normal">
              <p>Inside Dhaka: ${money(settings.delivery_inside)} · Outside Dhaka: ${money(settings.delivery_outside)}</p>
              <p>Cash on delivery or bKash. We call to confirm every order.</p>
              <p>Exchange within 7 days if the size doesn't fit. <a href="info.html#returns" style="text-decoration:underline">Read more</a></p>
            </div>
          </details>
        </div>
      </div>
    </div>

    <section class="section" id="related" hidden>
      <div class="section-head"><h2>You may also like</h2><a href="shop.html?cat=${p.category}">View all</a></div>
      <div class="grid" id="relatedGrid"></div>
    </section>`;

  // Photo zoom
  const lb = $('#lightbox');
  $$('.gallery img').forEach((img) => img.addEventListener('click', () => {
    lb.querySelector('img').src = img.src;
    lb.classList.add('open');
  }));
  lb.addEventListener('click', () => lb.classList.remove('open'));

  if (!p.sold_out) wireBuying(p);
  loadRelated(p);
}

function wireBuying(p) {
  let size = null;
  let qty = 1;
  const available = p.sizes.filter((s) => s.in_stock);
  if (available.length === 1) size = available[0].size; // only one size left → pick it

  const sync = () => {
    $$('.size-btn').forEach((b) => b.classList.toggle('selected', b.dataset.size === size));
    $('#qty').textContent = qty;
  };

  $('#sizes').addEventListener('click', (e) => {
    const b = e.target.closest('.size-btn');
    if (!b || b.disabled) return;
    size = b.dataset.size;
    sync();
  });
  $('#qtyDec').addEventListener('click', () => { qty = Math.max(1, qty - 1); sync(); });
  $('#qtyInc').addEventListener('click', () => { qty = Math.min(MAX_QTY, qty + 1); sync(); });
  $('#guideLink').addEventListener('click', () => { $('#guide').open = true; });

  $('#addBtn').addEventListener('click', () => {
    if (!size) {
      toast('Please select a size');
      $('#sizes').animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 250 });
      return;
    }
    addToCart(p, size, qty);
    qty = 1;
    sync();
    openBag();
  });
  sync();
}

async function loadRelated(p) {
  try {
    const items = (await listProducts({ category: p.category, excludeId: p.id, limit: 8 }))
      .filter((x) => !x.sold_out)
      .slice(0, 4);
    if (!items.length) return;
    $('#relatedGrid').innerHTML = items.map(productCard).join('');
    $('#related').hidden = false;
  } catch { /* not important */ }
}
