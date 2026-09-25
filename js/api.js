import { sb, isConfigured } from './supabase.js';
import { CONFIG } from './config.js';

export const DEFAULT_SETTINGS = {
  announcement: 'Cash on delivery all over Bangladesh',
  delivery_inside: 70,
  delivery_outside: 130,
  bkash_number: CONFIG.CONTACT.phone,
  hero_image: null,
  hoodie_image: null,
  punjabi_image: null,
};

let settingsPromise;
export function getSettings() {
  if (!isConfigured) return Promise.resolve({ ...DEFAULT_SETTINGS });
  settingsPromise ??= sb
    .from('site_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
    .then(({ data }) => {
      const s = { ...DEFAULT_SETTINGS };
      for (const [k, v] of Object.entries(data || {})) if (v !== null) s[k] = v;
      return s;
    })
    .catch(() => ({ ...DEFAULT_SETTINGS }));
  return settingsPromise;
}

// Adds sizes (with in-stock yes/no) and a sold_out flag to each product
async function withAvailability(products) {
  if (!products.length) return products;
  const { data, error } = await sb.rpc('get_availability', { p_ids: products.map((p) => p.id) });
  if (error) throw error;
  const map = {};
  for (const row of data || []) (map[row.product_id] ||= []).push({ size: row.size, in_stock: row.in_stock });
  for (const p of products) {
    p.sizes = map[p.id] || [];
    p.sold_out = !p.sizes.some((s) => s.in_stock);
  }
  return products;
}

export async function listProducts({ category, featured, limit, ids, excludeId } = {}) {
  if (!isConfigured) return [];
  let q = sb.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false });
  if (category) q = q.eq('category', category);
  if (featured) q = q.eq('is_featured', true);
  if (ids) q = q.in('id', ids);
  if (excludeId) q = q.neq('id', excludeId);
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return withAvailability(data || []);
}

export async function getProduct(id) {
  if (!isConfigured || !/^[0-9a-f-]{36}$/i.test(id || '')) return null;
  const { data, error } = await sb.from('products').select('*').eq('id', id).eq('is_active', true).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [p] = await withAvailability([data]);
  return p;
}
