import { sb } from './supabase.js';
import { CONFIG } from './config.js';

export async function getUser() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

// Sends the visitor to Google, then back to the page they were on
export async function signInWithGoogle() {
  if (!sb) throw new Error('The website is not connected to the database yet (see README.md).');
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: location.href.split('#')[0],
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}

export async function signOut() {
  if (sb) await sb.auth.signOut();
}

// Only decides what the page shows. Real protection is in the database (is_admin()).
export function looksLikeAdmin(user) {
  return !!user && user.email?.toLowerCase() === CONFIG.ADMIN_EMAIL.toLowerCase();
}

export function displayName(user) {
  return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || '';
}
