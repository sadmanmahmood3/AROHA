// =====================================================================
//  AROHA — SETTINGS YOU FILL IN
//  Follow README.md. Paste your keys between the quotes below.
//  (These keys are safe to be public — your data is protected by the
//   security rules in supabase/setup.sql.)
// =====================================================================

export const CONFIG = {
  // Supabase → Project Settings → Data API / API Keys
  SUPABASE_URL: 'https://qkuxwvjynocpvhwiducv.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_3M_XGbmMaPIFheVIfuyRPA_NT0ZWCBx',  // the "publishable" / "anon public" key — NEVER the secret/service_role key

  // EmailJS → sends you an email for every new order
  EMAILJS_PUBLIC_KEY: 'NBekUtfMMjUgZ4yCB',
  EMAILJS_SERVICE_ID: 'service_sgx1z1e',
  EMAILJS_ADMIN_TEMPLATE_ID: 'template_ascv1e7',
  EMAILJS_CUSTOMER_TEMPLATE_ID: '',             // optional: order confirmation email to the customer

  // Brand + contact info shown on the website
  BRAND: 'AROHA',
  ADMIN_EMAIL: 'arohagmail@gmail.com',
  CONTACT: {
    email: 'arohagmail@gmail.com',
    phone: '01787456456',
    location: 'Sector 12, Uttara, Dhaka',
  },
  SOCIAL: {
    facebook: 'https://www.facebook.com/share/19JGKAUR9d/',
    instagram: '',  // e.g. 'https://instagram.com/aroha'
  },
};
