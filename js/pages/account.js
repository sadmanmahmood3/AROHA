import { renderLayout } from '../layout.js';
import { sb, isConfigured } from '../supabase.js';
import { getUser, signInWithGoogle, signOut, displayName, looksLikeAdmin } from '../auth.js';
import { placeholderHTML, emptyState } from '../components.js';
import { $, esc, money, formatDate, toast, errorText, STATUS, PAYMENTS, GOOGLE_ICON } from '../utils.js';

await renderLayout({ active: 'account' });
const app = $('#app');
const user = await getUser();

if (!user) {
  app.innerHTML = `
    <div class="page-head"><h1>Account</h1></div>
    <div class="container" style="padding-bottom:80px;max-width:640px">
      <div class="signin-card">
        <h2>Sign in</h2>
        <p class="muted">Use your Google (Gmail) account to see your orders and check out faster.</p>
        <button class="btn btn-google" id="googleBtn">${GOOGLE_ICON} Continue with Google</button>
        ${!isConfigured ? '<p class="small muted">Sign-in will work once the website is connected (see README.md).</p>' : ''}
      </div>
    </div>`;
  $('#googleBtn').addEventListener('click', async () => {
    try { await signInWithGoogle(); } catch (err) { toast(errorText(err), 'error'); }
  });
} else {
  app.innerHTML = `
    <div class="page-head">
      <p class="eyebrow muted" style="margin-bottom:10px">Hi, ${esc(displayName(user))}</p>
      <h1>My orders</h1>
    </div>
    <div class="container" style="padding-bottom:80px;max-width:900px">
      <div class="row-between" style="margin-bottom:24px;flex-wrap:wrap">
        <span class="muted small">Signed in as ${esc(user.email)}</span>
        <div style="display:flex;gap:16px;align-items:center">
          ${looksLikeAdmin(user) ? '<a href="admin.html" class="btn btn-dark" style="height:40px">Admin panel</a>' : ''}
          <button class="link-btn" id="signOut">Sign out</button>
        </div>
      </div>
      <div id="orders"><div class="loading-block"><div class="spinner"></div></div></div>
    </div>`;

  $('#signOut').addEventListener('click', async () => { await signOut(); location.href = 'index.html'; });

  const { data, error } = await sb
    .from('orders')
    .select('*, order_items(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    $('#orders').innerHTML = emptyState('Could not load orders', errorText(error));
  } else if (!data.length) {
    $('#orders').innerHTML = emptyState('No orders yet', 'When you place an order, it will show up here.', { href: 'shop.html', label: 'Start shopping' });
  } else {
    $('#orders').innerHTML = data.map((o) => `
      <div class="order-card">
        <div class="row-between" style="flex-wrap:wrap">
          <div>
            <p><b>Order #${o.order_number}</b></p>
            <p class="muted small">${formatDate(o.created_at, true)} · ${PAYMENTS[o.payment_method]}</p>
          </div>
          <span class="status status-${o.status}">${STATUS[o.status]}</span>
        </div>
        <div class="order-items">
          ${o.order_items.map((i) => `
            <div class="order-line">
              <div class="bag-img">${i.image ? `<img src="${esc(i.image)}" alt="">` : placeholderHTML('A')}</div>
              <div><p>${esc(i.product_name)}</p><p class="muted small">${i.color ? esc(i.color) + ' · ' : ''}Size ${esc(i.size)} · Qty ${i.quantity}</p></div>
              <span>${money(i.unit_price * i.quantity)}</span>
            </div>`).join('')}
        </div>
        <div class="row-between small"><span class="muted">Delivery ${money(o.delivery_fee)}</span><b style="font-size:15px">Total ${money(o.total)}</b></div>
      </div>`).join('');
  }
}
