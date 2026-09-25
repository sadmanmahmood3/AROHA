# AROHA — website setup guide

This folder holds your whole website. Follow the steps **in order**. It takes about 30–40 minutes the first time, and every account is free.

> 🔒 **Never give anyone the password of arohagmail@gmail.com, and that includes me (Claude).** You never need to type it into any file. The admin signs in with the normal Google sign-in button.

---

## What's inside

| File / folder | What it is |
|---|---|
| `index.html` | Home page |
| `shop.html` | Product list (Hoodies / Punjabi) |
| `product.html` | Single product page (photos, sizes, add to bag) |
| `checkout.html` | Checkout (customer must sign in with Google) |
| `account.html` | Customer's "My orders" page |
| `info.html` | Shipping, payment, returns, size guide, contact |
| `admin.html` | **Your admin panel** — products, photos, stock, orders, settings |
| `js/config.js` | ⭐ **The only file you need to edit** (paste your keys here) |
| `supabase/setup.sql` | Database setup — you paste this into Supabase once |
| `css/` | Styling (colours and fonts are at the top of `style.css`) |

---

## Step 1 — Preview it on your PC (2 min)

The website must be opened through a small local server. Double-clicking the files won't work.

1. Open **VS Code** → **File → Open Folder…** → choose `D:\AROHA`.
2. Click the **Extensions** icon on the left (4 squares), search **Live Server** (by Ritwick Dey), and click **Install**.
3. Right-click `index.html` → **Open with Live Server**.
4. Your browser opens `http://127.0.0.1:5500/index.html`. You'll see the design with a yellow "Preview mode" bar. That's expected, because the database isn't connected yet.

---

## Step 2 — Create the database (Supabase) (10 min)

Supabase stores your products, photos, stock and orders, and handles sign-in.

1. Go to **https://supabase.com** → **Start your project** → sign up (you can use arohagmail@gmail.com).
2. Click **New project**:
   - Name: `aroha`
   - Database password: click **Generate a password** and save it somewhere safe (you won't need it for the website)
   - Region: **Singapore** (closest to Bangladesh)
   - Click **Create new project** and wait ~2 minutes.
3. In the left menu open **SQL Editor** → **New query**.
4. Open `supabase/setup.sql` in VS Code, select everything (**Ctrl+A**), copy (**Ctrl+C**), paste it into Supabase, and click **Run**. You should see *"Success. No rows returned"*.
5. Get your keys. Click the **Connect** button at the top of the project (or go to **Project Settings → API Keys**):
   - **Project URL**: looks like `https://abcdefghijk.supabase.co`
   - **Publishable key** (older projects call it **anon public**)
6. Open `js/config.js` in VS Code and paste them:
   ```js
   SUPABASE_URL: 'https://abcdefghijk.supabase.co',
   SUPABASE_ANON_KEY: 'sb_publishable_xxxxxxxx',
   ```
   ⚠️ Never paste the **secret** / **service_role** key anywhere. It gives full access to everything.
7. Save (**Ctrl+S**). The yellow "Preview mode" bar disappears.

---

## Step 3 — Turn on "Sign in with Google" (10 min)

### 3a. Create the Google login keys
1. Go to **https://console.cloud.google.com** and sign in with arohagmail@gmail.com.
2. At the top, click the project picker → **New project** → name it `AROHA` → **Create**. Make sure it's selected.
3. Search **"Google Auth Platform"** in the top search bar and open it → **Get started**:
   - App name: `AROHA`, User support email: arohagmail@gmail.com
   - Audience: **External**
   - Contact email: arohagmail@gmail.com → agree → **Create**
4. Go to **Clients** → **Create client**:
   - Application type: **Web application**, Name: `AROHA website`
   - **Authorized JavaScript origins** → Add URI: `http://127.0.0.1:5500`
   - **Authorized redirect URIs** → Add URI: your Supabase callback URL, which is
     `https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback`
     (you can copy it exactly from Supabase in step 3b)
   - Click **Create**, then copy the **Client ID** and **Client secret**.
5. Go to **Audience** → click **Publish app** → **Confirm**. (If you skip this, only test users can sign in.)

### 3b. Connect it to Supabase
1. In Supabase: **Authentication → Sign In / Providers → Google**.
2. Turn it **on**, paste the **Client ID** and **Client secret**, and **Save**.
   (The **Callback URL** shown here is the one to put in Google step 4.)
3. Still in Supabase, open **Email** under Sign In / Providers and **turn it off**. Only Google sign-in is used.
4. Go to **Authentication → URL Configuration**:
   - **Site URL**: `http://127.0.0.1:5500/index.html` (you'll change this after Step 5)
   - **Redirect URLs** → Add: `http://127.0.0.1:5500/**`

✅ Test it: open `http://127.0.0.1:5500/admin.html` → **Continue with Google** → choose arohagmail@gmail.com. You should see the admin dashboard.

---

## Step 4 — Get an email for every order (EmailJS) (8 min)

1. Go to **https://www.emailjs.com** → **Sign up free** (free plan = 200 emails/month).
2. **Email Services → Add New Service → Gmail** → **Connect account** → pick arohagmail@gmail.com → allow → **Create Service**. Copy the **Service ID**.
3. **Email Templates → Create New Template**:
   - **To Email**: `arohagmail@gmail.com`
   - **Subject**: `New order #{{order_number}} — {{total}}`
   - **Content** (paste this):
     ```
     New order on AROHA!

     Order #{{order_number}} — {{order_date}}

     Customer: {{customer_name}}
     Phone: {{customer_phone}}
     Email: {{customer_email}}
     Address: {{shipping_address}} ({{delivery_area}})

     Items:
     {{order_items}}

     Subtotal: {{subtotal}}
     Delivery: {{delivery_fee}}
     TOTAL: {{total}}

     Payment: {{payment_method}}
     bKash TrxID: {{bkash_trx_id}}
     Note: {{note}}

     Open admin panel: {{admin_url}}
     ```
   - **Save**, then copy the **Template ID**.
4. **Account → General** → copy your **Public Key**.
5. Paste all three into `js/config.js`:
   ```js
   EMAILJS_PUBLIC_KEY: 'xxxxxxxx',
   EMAILJS_SERVICE_ID: 'service_xxxxx',
   EMAILJS_ADMIN_TEMPLATE_ID: 'template_xxxxx',
   ```
6. *(Optional)* To also send customers a confirmation email, make a second template with **To Email** = `{{customer_email}}`, and put its ID in `EMAILJS_CUSTOMER_TEMPLATE_ID`.

Every order also shows up in the admin panel, so you won't miss any even if an email fails.

---

## Step 5 — Put the website online (GitHub Pages, free) (5 min)

1. Open **GitHub Desktop** → **File → Add local repository…** → choose `D:\AROHA`.
   It will say "this is not a Git repository". Click **create a repository**, then **Create repository**.
2. Click **Publish repository**. **Untick "Keep this code private"** (free GitHub Pages needs a public repo), then click **Publish**.
   (This is safe: the keys in `config.js` are public keys, and your data is protected by the database rules.)
3. On **github.com** open the `AROHA` repository → **Settings → Pages**:
   - Source: **Deploy from a branch**, Branch: **main**, folder **/(root)** → **Save**.
4. After 1–2 minutes your site is live at:
   **https://sadmanmahmood3.github.io/AROHA/**
5. Allow sign-in on the live site:
   - **Supabase → Authentication → URL Configuration**:
     - Site URL: `https://sadmanmahmood3.github.io/AROHA/`
     - Redirect URLs → Add: `https://sadmanmahmood3.github.io/AROHA/**`
   - **Google Cloud → Google Auth Platform → Clients → AROHA website** → Authorized JavaScript origins → Add: `https://sadmanmahmood3.github.io`, then **Save**.

**Updating the site later:** after changing files, open GitHub Desktop, write a short summary, click **Commit to main**, then **Push origin**. The site updates in about a minute.

*(Later you can buy a domain like aroha.com.bd and connect it in Settings → Pages.)*

---

## Using the admin panel

Open **/admin.html** (e.g. `https://sadmanmahmood3.github.io/AROHA/admin.html`) and sign in with Google as **arohagmail@gmail.com**. Any other account is refused.

- **Products → + Add product**: add photos (drag & drop works), name, category (Hoodie / Punjabi), colour, price, optional old price (shows as a sale), description, and **stock for each size**.
  - The first photo is the main one. Use ← to reorder.
  - Stock numbers are **only visible to you**. Customers only see which sizes are available.
  - When a size reaches 0, customers can't pick it. When **all** sizes reach 0, the product shows **Sold out** everywhere.
  - Untick **Show on website** to hide a product without deleting it.
  - Tick **Feature on home page** to show it under "New in".
- **Orders**: every order, with customer phone, address and bKash TrxID. Change the status: Pending → Confirmed → Shipped → Delivered. **Cancelled** puts the items back in stock automatically.
- **Settings**: announcement bar text, delivery charges, bKash number, and the big home-page photos.
- **Dashboard**: pending orders, today's orders, and stock alerts (sold out / 2 or fewer left).

Stock goes down automatically when a customer orders. Two people can't buy the same last piece.

---

## Changing things yourself

- **Contact info, Facebook/Instagram links**: `js/config.js`
- **Colours / fonts**: top of `css/style.css`
- **Size chart numbers**: `js/components.js` → `SIZE_GUIDE`
- **Home page text**: `index.html`
- **Shipping / returns text**: `info.html`
- **Add another admin**: in Supabase SQL Editor run
  `insert into admin_emails values ('another@gmail.com');`

## Problems?

- **Page is blank / nothing works when double-clicking**: use Live Server (Step 1) or the online link.
- **"redirect_uri_mismatch" from Google**: the callback URL in Google Cloud doesn't exactly match the one shown in Supabase → Google provider.
- **Signed in but goes to the home page / not signed in**: add your site address to Supabase **Redirect URLs** (Steps 3b and 5).
- **Admin says "not an admin account"**: make sure you picked arohagmail@gmail.com in the Google popup.
- **No order email**: check the three EmailJS values in `config.js`. Orders are still saved in the admin panel.
