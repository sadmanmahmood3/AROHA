import { renderLayout } from '../layout.js';
import { listProducts } from '../api.js';
import { productCard, emptyState, skeletonGrid } from '../components.js';
import { $, $$, esc, fitText } from '../utils.js';

// Big AROHA: about half the width on computers, most of the width on phones
fitText($('.hero-word'), (w) => (w < 800 ? 0.85 : 0.5));

// Scrolling text strip
const words = ['New drop', 'Oversized hoodies', 'Designed in Dhaka', 'Cash on delivery', 'Heavyweight fabric', 'AROHA'];
const line = words.map((w) => `<span>${w} —</span>`).join('');
$('#marquee').innerHTML = line + line;

// Fabric hunt film: full-width, plays silently while on screen; pause and sound buttons in the corner
const filmBox = $('#film');
const film = $('#filmVideo');
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let userPaused = calm; // people who ask for less motion start paused
const showState = () => {
  filmBox.classList.toggle('is-paused', film.paused);
  filmBox.classList.toggle('has-sound', !film.muted);
  $('#filmPlay').setAttribute('aria-label', film.paused ? 'Play video' : 'Pause video');
  $('#filmSound').setAttribute('aria-label', film.muted ? 'Turn sound on' : 'Turn sound off');
  $('#filmSound').setAttribute('aria-pressed', String(!film.muted));
};
const playFilm = () => film.play().catch(() => {}).finally(showState);
['play', 'pause', 'volumechange'].forEach((ev) => film.addEventListener(ev, showState));
new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting && !userPaused) playFilm();
  else film.pause();
}, { threshold: 0.3 }).observe(film);
$('#filmPlay').addEventListener('click', () => {
  userPaused = !film.paused;
  if (userPaused) film.pause(); else playFilm();
});
$('#filmSound').addEventListener('click', () => {
  film.muted = !film.muted;
  if (!film.muted) { userPaused = false; playFilm(); }
});
showState();

// The new drop: featured hoodies (or the newest ones)
const drop = $('#dropGrid');
drop.innerHTML = skeletonGrid(2);
loadDrop();

const settings = await renderLayout();

// Big banner photo behind the hero (admin → Settings)
if (settings.hero_image) $('#heroBg').innerHTML = `<img src="${esc(settings.hero_image)}" alt="">`;

// Lookbook: model photoshoot pictures (admin → Settings → Lookbook)
const looks = Array.isArray(settings.lookbook_images) ? settings.lookbook_images.filter(Boolean) : [];
if (looks.length) {
  $('#lookbookGrid').innerHTML = looks.map((src, i) => `
    <figure class="lb-item ${looks.length % 2 === 1 && i === 0 ? 'wide' : ''}">
      <img src="${esc(src)}" alt="AROHA lookbook photo ${i + 1}" loading="${i < 2 ? 'eager' : 'lazy'}">
    </figure>`).join('');
  $('#lookbook').hidden = false;

  const lb = $('#lightbox');
  $$('.lb-item img').forEach((img) => img.addEventListener('click', () => {
    lb.querySelector('img').src = img.src;
    lb.classList.add('open');
  }));
  lb.addEventListener('click', () => lb.classList.remove('open'));
}

async function loadDrop() {
  try {
    let products = await listProducts({ category: 'hoodie', featured: true, limit: 4 });
    if (!products.length) products = await listProducts({ category: 'hoodie', limit: 2 });
    drop.innerHTML = products.length
      ? products.map(productCard).join('')
      : emptyState('First drop coming soon', 'Our new hoodies are almost here. Check back very soon.');
  } catch (err) {
    console.error(err);
    drop.innerHTML = emptyState('Could not load the drop', 'Please refresh the page in a moment.');
  }
}
