import { renderLayout } from '../layout.js';
import { listProducts } from '../api.js';
import { productCard, emptyState, skeletonGrid } from '../components.js';
import { $, esc, fitText } from '../utils.js';

const settings = await renderLayout();
// Big AROHA: about two-thirds of the width on computers, most of the width on phones
fitText($('.hero-word'), (w) => (w < 800 ? 0.9 : 0.66));

// Banner photos (uploaded by the admin in Settings)
if (settings.hero_image) $('#heroBg').innerHTML = `<img src="${esc(settings.hero_image)}" alt="">`;
if (settings.hoodie_image) $('#tileHoodie').insertAdjacentHTML('afterbegin', `<img src="${esc(settings.hoodie_image)}" alt="">`);
if (settings.punjabi_image) $('#tilePunjabi').insertAdjacentHTML('afterbegin', `<img src="${esc(settings.punjabi_image)}" alt="">`);

// Scrolling text strip
const words = ['Hoodies', 'Punjabi', 'Designed in Dhaka', 'Cash on delivery', 'Oversized fit', 'AROHA'];
const line = words.map((w) => `<span>${w} —</span>`).join('');
$('#marquee').innerHTML = line + line;

// New products
const grid = $('#newGrid');
grid.innerHTML = skeletonGrid(4);
try {
  let products = await listProducts({ featured: true, limit: 8 });
  if (!products.length) products = await listProducts({ limit: 8 });
  grid.innerHTML = products.length
    ? products.map(productCard).join('')
    : emptyState('First drop coming soon', 'Our hoodies and punjabi are almost here. Check back very soon.');
} catch (err) {
  console.error(err);
  grid.innerHTML = emptyState('Could not load products', 'Please refresh the page.');
}
