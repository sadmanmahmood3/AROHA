import { renderLayout } from '../layout.js';
import { listProducts } from '../api.js';
import { productCard, emptyState, skeletonGrid } from '../components.js';
import { $, $$, param, CATEGORIES } from '../utils.js';

const cat = CATEGORIES[param('cat')] ? param('cat') : '';
await renderLayout({ active: cat || 'all' });

const title = cat ? CATEGORIES[cat].label : 'Shop all';
document.title = `${title} — AROHA`;
$('#shopTitle').textContent = title;
$('#crumb').textContent = title;
$$('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.cat === cat));

const grid = $('#shopGrid');
grid.innerHTML = skeletonGrid(8);

let products = [];
let failed = false;
try {
  products = await listProducts({ category: cat || undefined });
} catch (err) {
  console.error(err);
  failed = true;
  grid.innerHTML = emptyState('Could not load products', 'Please refresh the page.');
}

// Remember the visitor's choices on this device
const prefs = (() => { try { return JSON.parse(localStorage.getItem('aroha_shop_prefs')) || {}; } catch { return {}; } })();
$('#sort').value = prefs.sort || 'new';
$('#hideSold').checked = !!prefs.hideSold;

function render() {
  const sort = $('#sort').value;
  const hideSold = $('#hideSold').checked;
  try { localStorage.setItem('aroha_shop_prefs', JSON.stringify({ sort, hideSold })); } catch {}

  let list = products.filter((p) => !hideSold || !p.sold_out);
  if (sort === 'low') list = [...list].sort((a, b) => a.price - b.price);
  if (sort === 'high') list = [...list].sort((a, b) => b.price - a.price);
  // Sold-out items go to the end
  list = [...list.filter((p) => !p.sold_out), ...list.filter((p) => p.sold_out)];

  $('#count').textContent = products.length ? `${list.length} ${list.length === 1 ? 'product' : 'products'}` : '';
  grid.innerHTML = list.length
    ? list.map(productCard).join('')
    : products.length
      ? emptyState('Everything is sold out', 'New pieces are on the way.', null)
      : emptyState('Coming soon', `Our ${cat ? CATEGORIES[cat].label.toLowerCase() : 'collection'} will be here very soon.`, { href: 'index.html', label: 'Back to home' });
}

if (!failed) {
  $('#sort').addEventListener('change', render);
  $('#hideSold').addEventListener('change', render);
  render();
}
