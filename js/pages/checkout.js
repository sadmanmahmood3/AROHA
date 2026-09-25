import { renderLayout } from '../layout.js';
import { sb, isConfigured } from '../supabase.js';
import { listProducts } from '../api.js';
import { getUser, signInWithGoogle, signOut, displayName } from '../auth.js';
import { getCart, syncCart, clearCart, removeItem } from '../cart.js';
import { sendOrderEmails } from '../email.js';
import { placeholderHTML, emptyState } from '../components.js';
import { $, $$, esc, money, toast, errorText, GOOGLE_ICON } from '../utils.js';

const settings = await renderLayout();
const app = $('#app');
const LAST_KEY = 'aroha_last_address';

start();

async function start() {
  if (!getCart().length) {
    app.innerHTML = `<div class="section">${emptyState('Your bag is empty', 'Add something you love first.', { href: 'shop.html', label: 'Shop now' })}</div>`;
    return;
  }

  // Check the bag against the latest products (price changes, sold-out sizes)
  let products = [];
  try {
    products = await listProducts({ ids: [...new Set(getCart().map((i) => i.product_id))] });
    syncCart(products);
  } catch (err) {
    console.error(err);
  }
  const problems = findProblems(products);

  const user = await getUser();
  const summary = summaryHTML(problems);

  if (!user) {
    app.innerHTML = `
      <div class="page-head"><h1>Checkout</h1></div>
      <div class="checkout">
        <div class="signin-card">
          <p class="eyebrow">Step 1 of 2</p>
          <h2>Sign in to order</h2>
          <p class="muted">Sign in with your Google (Gmail) account so we can keep track of your order and contact you.</p>
          <button class="btn btn-google" id="googleBtn">${GOOGLE_ICON} Continue with Google</button>
          ${!isConfigured ? '<p class="small muted">Sign-in will work once the website is connected (see README.md).</p>' : ''}
        </div>
        ${summary}
      </div>`;
    $('#googleBtn').addEventListener('click', async () => {
      try { await signInWithGoogle(); } catch (err) { toast(errorText(err), 'error'); }
    });
    wireSummary();
    return;
  }

  const last = (() => { try { return JSON.parse(localStorage.getItem(LAST_KEY)) || {}; } catch { return {}; } })();

  app.innerHTML = `
    <div class="page-head"><h1>Checkout</h1></div>
    <div class="checkout">
      <form id="orderForm" novalidate>
        <div class="fieldset">
          <h2>Contact</h2>
          <div class="field">
            <label>Signed in as</label>
            <div class="row-between">
              <input value="${esc(user.email)}" readonly style="flex:1">
              <button type="button" class="link-btn" id="switchUser">Not you?</button>
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="name">Full name</label>
              <input id="name" autocomplete="name" required maxlength="100" value="${esc(last.name || displayName(user))}">
            </div>
            <div class="field">
              <label for="phone">Mobile number</label>
              <input id="phone" type="tel" autocomplete="tel" inputmode="tel" required placeholder="01XXXXXXXXX" value="${esc(last.phone || '')}">
            </div>
          </div>
        </div>

        <div class="fieldset">
          <h2>Delivery</h2>
          <div class="field">
            <label for="address">Full address</label>
            <textarea id="address" required maxlength="500" placeholder="House, road, area, thana, district">${esc(last.address || '')}</textarea>
          </div>
          <div class="choice-group" role="radiogroup" aria-label="Delivery area">
            <label class="choice"><input type="radio" name="area" value="inside_dhaka" ${last.area !== 'outside_dhaka' ? 'checked' : ''}>
              <span class="choice-main">Inside Dhaka</span><span>${money(settings.delivery_inside)}</span></label>
            <label class="choice"><input type="radio" name="area" value="outside_dhaka" ${last.area === 'outside_dhaka' ? 'checked' : ''}>
              <span class="choice-main">Outside Dhaka</span><span>${money(settings.delivery_outside)}</span></label>
          </div>
        </div>

        <div class="fieldset">
          <h2>Payment</h2>
          <div class="choice-group" role="radiogroup" aria-label="Payment method">
            <label class="choice"><input type="radio" name="payment" value="cod" checked>
              <span class="choice-main">Cash on delivery</span></label>
            <label class="choice"><input type="radio" name="payment" value="bkash">
              <span class="choice-main">bKash</span></label>
          </div>
          <div class="info-box hidden" id="bkashBox">
            <p><b>How to pay with bKash</b></p>
            <p>1. Open bKash and choose <b>Send Money</b>.</p>
            <p>2. Send <b id="bkashAmount"></b> to <b>${esc(settings.bkash_number)}</b>.</p>
            <p>3. Copy the Transaction ID (TrxID) from the confirmation message and paste it below.</p>
            <div class="field" style="margin-top:8px">
              <label for="trx">bKash transaction ID</label>
              <input id="trx" maxlength="40" placeholder="e.g. 9A7B6C5D4E" autocomplete="off">
            </div>
          </div>
        </div>

        <div class="fieldset">
          <div class="field">
            <label for="note">Order note (optional)</label>
            <textarea id="note" maxlength="500" placeholder="Anything we should know?" style="min-height:70px"></textarea>
          </div>
        </div>

        <div id="formError" class="form-error hidden" role="alert"></div>
        <button type="submit" class="btn btn-dark btn-block" id="placeBtn">Place order</button>
        <p class="small muted">By placing an order you agree to our <a href="info.html#returns" style="text-decoration:underline">exchange policy</a>. We will call you to confirm.</p>
      </form>
      ${summary}
    </div>`;

  wireSummary();
  $('#switchUser').addEventListener('click', async () => { await signOut(); location.reload(); });
  $$('input[name="area"], input[name="payment"]').forEach((r) => r.addEventListener('change', updateTotals));
  $('#orderForm').addEventListener('submit', (e) => placeOrder(e, user));
  updateTotals();
}

function findProblems(products) {
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const problems = {};
  for (const i of getCart()) {
    const p = byId[i.product_id];
    const key = i.product_id + '|' + i.size;
    if (!p) problems[key] = 'No longer available';
    else if (!p.sizes.find((s) => s.size === i.size && s.in_stock)) problems[key] = 'Sold out';
  }
  return problems;
}

function summaryHTML(problems) {
  const items = getCart();
  const sub = items.reduce((n, i) => n + i.price * i.quantity, 0);
  const hasProblem = Object.keys(problems).length > 0;
  return `
    <aside class="summary" id="summary">
      <p class="panel-title" style="margin:0">Order summary</p>
      <div>
        ${items.map((i) => {
          const prob = problems[i.product_id + '|' + i.size];
          return `
          <div class="bag-item">
            <div class="bag-img">${i.image ? `<img src="${esc(i.image)}" alt="">` : placeholderHTML('A')}</div>
            <div class="bag-info">
              <p class="bag-name">${esc(i.name)}</p>
              <p class="muted small">${i.color ? esc(i.color) + ' · ' : ''}Size ${esc(i.size)} · Qty ${i.quantity}</p>
              ${prob ? `<p class="bag-warn">${prob} — <button type="button" class="link-btn" data-remove="${i.product_id}|${esc(i.size)}">remove</button></p>` : ''}
            </div>
            <div class="bag-right"><p>${money(i.price * i.quantity)}</p></div>
          </div>`;
        }).join('')}
      </div>
      <div class="summary-lines">
        <div class="row-between"><span>Subtotal</span><span>${money(sub)}</span></div>
        <div class="row-between"><span>Delivery</span><span id="feeLine">${money(settings.delivery_inside)}</span></div>
      </div>
      <div class="row-between summary-total"><span>Total</span><span id="totalLine">${money(sub + settings.delivery_inside)}</span></div>
      ${hasProblem ? '<p class="bag-warn" id="problemNote">Please remove the sold-out items to continue.</p>' : ''}
    </aside>`;
}

function wireSummary() {
  $('#summary').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const [id, size] = btn.dataset.remove.split('|');
    removeItem(id, size);
    start();
  });
  if ($('#problemNote') && $('#placeBtn')) $('#placeBtn').disabled = true;
}

function currentFee() {
  const area = $('input[name="area"]:checked')?.value || 'inside_dhaka';
  return area === 'inside_dhaka' ? settings.delivery_inside : settings.delivery_outside;
}

function updateTotals() {
  const sub = getCart().reduce((n, i) => n + i.price * i.quantity, 0);
  const fee = currentFee();
  $('#feeLine').textContent = money(fee);
  $('#totalLine').textContent = money(sub + fee);
  const bkash = $('input[name="payment"]:checked')?.value === 'bkash';
  $('#bkashBox').classList.toggle('hidden', !bkash);
  $('#bkashAmount').textContent = money(sub + fee);
}

function showError(msg) {
  const el = $('#formError');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function placeOrder(e, user) {
  e.preventDefault();
  $('#formError').classList.add('hidden');

  const customer = {
    name: $('#name').value.trim(),
    phone: $('#phone').value.trim(),
    address: $('#address').value.trim(),
    area: $('input[name="area"]:checked').value,
    payment: $('input[name="payment"]:checked').value,
    trx: $('#trx').value.trim(),
    note: $('#note').value.trim(),
    email: user.email,
  };

  // Quick checks before sending (the database checks again)
  if (customer.name.length < 2) return showError('Please enter your full name.');
  if (!/^(\+?88)?01[3-9]\d{8}$/.test(customer.phone.replace(/[\s-]/g, ''))) return showError('Please enter a valid mobile number, e.g. 01712345678.');
  if (customer.address.length < 8) return showError('Please enter your full delivery address.');
  if (customer.payment === 'bkash' && customer.trx.length < 6) return showError('Please enter your bKash transaction ID.');

  const items = getCart();
  const btn = $('#placeBtn');
  btn.disabled = true;
  btn.textContent = 'Placing order…';

  const { data: order, error } = await sb.rpc('place_order', {
    p_items: items.map((i) => ({ product_id: i.product_id, size: i.size, quantity: i.quantity })),
    p_name: customer.name,
    p_phone: customer.phone,
    p_address: customer.address,
    p_area: customer.area,
    p_payment: customer.payment,
    p_trx: customer.trx || null,
    p_note: customer.note || null,
  });

  if (error) {
    btn.disabled = false;
    btn.textContent = 'Place order';
    return showError(errorText(error));
  }

  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ name: customer.name, phone: customer.phone, address: customer.address, area: customer.area }));
  } catch {}

  // Email the admin (don't make the customer wait more than a few seconds)
  await Promise.race([
    sendOrderEmails(order, items, customer).catch((err) => console.error('Email failed', err)),
    new Promise((r) => setTimeout(r, 6000)),
  ]);

  clearCart();
  window.scrollTo(0, 0);
  app.innerHTML = `
    <div class="success">
      <p class="eyebrow">Order #${order.order_number}</p>
      <h1>Thank you</h1>
      <p>Your order has been placed. We'll call you on <b>${esc(customer.phone)}</b> to confirm it.</p>
      <div class="info-box" style="text-align:left;width:100%">
        <div class="row-between"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
        <div class="row-between"><span>Delivery</span><span>${money(order.delivery_fee)}</span></div>
        <div class="row-between"><b>Total</b><b>${money(order.total)}</b></div>
        <div class="row-between"><span>Payment</span><span>${customer.payment === 'cod' ? 'Cash on delivery' : 'bKash (TrxID ' + esc(customer.trx) + ')'}</span></div>
      </div>
      <div class="hero-cta" style="justify-content:center">
        <a href="account.html" class="btn btn-dark">View my orders</a>
        <a href="shop.html" class="btn btn-outline">Continue shopping</a>
      </div>
    </div>`;
}
