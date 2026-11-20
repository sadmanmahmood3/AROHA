import { esc, money } from './utils.js';

export function priceHTML(p) {
  const sale = p.compare_at_price && p.compare_at_price > p.price;
  return sale
    ? `<span class="price-now sale">${money(p.price)}</span> <s class="price-was">${money(p.compare_at_price)}</s>`
    : `<span class="price-now">${money(p.price)}</span>`;
}

export function placeholderHTML(label = 'AROHA') {
  return `<div class="ph"><span>${esc(label)}</span></div>`;
}

export function productCard(p) {
  const img = p.images?.[0];
  const alt = p.images?.[1];
  const sale = p.compare_at_price && p.compare_at_price > p.price;
  const badge = p.sold_out ? '<span class="badge badge-dark">Sold out</span>' : sale ? '<span class="badge">Sale</span>' : '';
  return `
    <a class="pcard ${p.sold_out ? 'is-soldout' : ''}" href="product.html?id=${p.id}">
      <div class="pcard-media">
        ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy">` : placeholderHTML()}
        ${alt ? `<img class="pcard-alt" src="${esc(alt)}" alt="" loading="lazy">` : ''}
        ${badge}
      </div>
      <div class="pcard-info">
        <p class="pcard-name">${esc(p.name)}</p>
        ${p.color ? `<p class="pcard-color">${esc(p.color)}</p>` : ''}
        <p class="pcard-price">${priceHTML(p)}</p>
      </div>
    </a>`;
}

export function emptyState(title, text, link) {
  return `
    <div class="empty-state">
      <p class="empty-title">${esc(title)}</p>
      <p>${esc(text)}</p>
      ${link ? `<a class="btn btn-outline" href="${link.href}">${esc(link.label)}</a>` : ''}
    </div>`;
}

export function skeletonGrid(n = 4) {
  return Array.from({ length: n }, () => `
    <div class="pcard skeleton"><div class="pcard-media"></div><div class="pcard-info"><p></p><p></p></div></div>`).join('');
}

// Size chart. EU size = half the body chest in cm (48 → 96 cm chest).
// Body measurements of the person the size is made for. Edit here if needed.
export const SIZE_GUIDE = {
  hoodie: {
    note: 'Body measurements (your body, not the hoodie). EU size = half your chest in cm. Our hoodies have an oversized cut, so they fit roomier than these numbers. Between sizes? Choose the bigger one.',
    head: ['Size', 'EU', 'Chest', 'Waist'],
    rows: [
      ['M', '48', '96 cm / 38 in', '84 cm / 33 in'],
      ['L', '50', '100 cm / 39 in', '88 cm / 35 in'],
      ['XL', '52', '104 cm / 41 in', '92 cm / 36 in'],
    ],
  },
  punjabi: {
    note: 'Punjabi size = your chest measurement in inches.',
    head: ['Size', 'Chest', 'Length', 'Sleeve'],
    rows: [['38', '40', '40', '23'], ['40', '42', '41', '23.5'], ['42', '44', '42', '24'], ['44', '46', '43', '24.5'], ['46', '48', '44', '25']],
  },
};

export function sizeGuideTable(category) {
  const g = SIZE_GUIDE[category];
  if (!g) return '';
  return `
    <table class="size-table">
      <thead><tr>${g.head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${g.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
    <p class="muted small">${g.note}</p>`;
}
