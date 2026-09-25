// The shopping bag lives in the browser (localStorage).
// Prices here are only for display — the real price is always taken from the database at checkout.

const KEY = 'aroha_bag_v1';
export const MAX_QTY = 10;

export function getCart() {
  try {
    const items = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function save(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch { /* private mode etc. */ }
  window.dispatchEvent(new CustomEvent('cart:change'));
}

export function addToCart(product, size, quantity = 1) {
  const items = getCart();
  const found = items.find((i) => i.product_id === product.id && i.size === size);
  if (found) {
    found.quantity = Math.min(MAX_QTY, found.quantity + quantity);
    found.price = product.price;
  } else {
    items.push({
      product_id: product.id,
      size,
      quantity: Math.min(MAX_QTY, quantity),
      name: product.name,
      color: product.color || '',
      price: product.price,
      image: product.images?.[0] || '',
      category: product.category,
    });
  }
  save(items);
}

export function setQty(productId, size, quantity) {
  const items = getCart();
  const item = items.find((i) => i.product_id === productId && i.size === size);
  if (!item) return;
  if (quantity <= 0) return removeItem(productId, size);
  item.quantity = Math.min(MAX_QTY, quantity);
  save(items);
}

export function removeItem(productId, size) {
  save(getCart().filter((i) => !(i.product_id === productId && i.size === size)));
}

// Refresh names/prices/images from the latest product data
export function syncCart(products) {
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const items = getCart().map((i) => {
    const p = byId[i.product_id];
    return p ? { ...i, name: p.name, price: p.price, image: p.images?.[0] || i.image, color: p.color || '' } : i;
  });
  save(items);
}

export function clearCart() {
  save([]);
}

export const cartCount = () => getCart().reduce((n, i) => n + i.quantity, 0);
export const cartSubtotal = () => getCart().reduce((n, i) => n + i.price * i.quantity, 0);
