// Sends order emails through EmailJS (https://www.emailjs.com)
import { CONFIG } from './config.js';
import { money, AREAS, PAYMENTS } from './utils.js';

const ready = () =>
  !CONFIG.EMAILJS_PUBLIC_KEY.startsWith('YOUR_') &&
  !CONFIG.EMAILJS_SERVICE_ID.startsWith('YOUR_') &&
  !CONFIG.EMAILJS_ADMIN_TEMPLATE_ID.startsWith('YOUR_');

export async function sendOrderEmails(order, items, customer) {
  if (!ready()) {
    console.warn('EmailJS is not set up yet — no order email sent (see README.md).');
    return;
  }
  const mod = await import('https://cdn.jsdelivr.net/npm/@emailjs/browser@4/+esm');
  const emailjs = mod.default || mod;

  const params = {
    order_number: order.order_number,
    order_date: new Date().toLocaleString('en-GB'),
    customer_name: customer.name,
    customer_email: customer.email,
    customer_phone: customer.phone,
    shipping_address: customer.address,
    delivery_area: AREAS[customer.area],
    payment_method: PAYMENTS[customer.payment],
    bkash_trx_id: customer.trx || '—',
    note: customer.note || '—',
    order_items: items
      .map((i) => `• ${i.name}${i.color ? ' (' + i.color + ')' : ''} — Size ${i.size} × ${i.quantity} = ${money(i.price * i.quantity)}`)
      .join('\n'),
    subtotal: money(order.subtotal),
    delivery_fee: money(order.delivery_fee),
    total: money(order.total),
    admin_url: new URL('admin.html#orders', location.href).href,
    shop_name: CONFIG.BRAND,
  };

  const opts = { publicKey: CONFIG.EMAILJS_PUBLIC_KEY };
  const jobs = [emailjs.send(CONFIG.EMAILJS_SERVICE_ID, CONFIG.EMAILJS_ADMIN_TEMPLATE_ID, params, opts)];
  if (CONFIG.EMAILJS_CUSTOMER_TEMPLATE_ID) {
    jobs.push(emailjs.send(CONFIG.EMAILJS_SERVICE_ID, CONFIG.EMAILJS_CUSTOMER_TEMPLATE_ID, params, opts));
  }
  await Promise.allSettled(jobs);
}
