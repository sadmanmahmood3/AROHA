-- =====================================================================
--  AROHA — database setup
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--  It is safe to run again later (it won't delete your products/orders).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. ADMINS
--    Only emails in this table can use the admin panel.
--    To add another admin later:  insert into admin_emails values ('someone@gmail.com');
-- ---------------------------------------------------------------------
create table if not exists public.admin_emails (
  email text primary key
);
insert into public.admin_emails (email) values ('arohagmail@gmail.com')
on conflict (email) do nothing;
alter table public.admin_emails enable row level security;   -- nobody can read/edit it from the website

-- Returns true when the signed-in user is an admin who signed in with Google.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_emails a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google';
$$;

-- ---------------------------------------------------------------------
-- 2. SITE SETTINGS  (announcement bar, delivery fees, bKash number, banner photos)
-- ---------------------------------------------------------------------
create table if not exists public.site_settings (
  id               int primary key default 1 check (id = 1),
  announcement     text default 'Cash on delivery all over Bangladesh',
  delivery_inside  int  not null default 70  check (delivery_inside  >= 0),
  delivery_outside int  not null default 130 check (delivery_outside >= 0),
  bkash_number     text default '01787456456',
  hero_image       text,
  hoodie_image     text,
  punjabi_image    text,
  updated_at       timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;
alter table public.site_settings enable row level security;

drop policy if exists "Anyone can read settings" on public.site_settings;
create policy "Anyone can read settings" on public.site_settings
  for select using (true);
drop policy if exists "Admin can update settings" on public.site_settings;
create policy "Admin can update settings" on public.site_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. PRODUCTS
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  category         text not null check (category in ('hoodie', 'punjabi')),
  description      text not null default '',
  color            text not null default '',
  price            int  not null check (price >= 0),
  compare_at_price int  check (compare_at_price >= 0),      -- old price, shown crossed out (for sales)
  images           text[] not null default '{}',             -- first image = main photo
  is_active        boolean not null default true,            -- false = hidden from customers
  is_featured      boolean not null default false,           -- shown on the home page
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists products_category_idx on public.products (category, created_at desc);
alter table public.products enable row level security;

drop policy if exists "Anyone can view visible products" on public.products;
create policy "Anyone can view visible products" on public.products
  for select using (is_active or public.is_admin());
drop policy if exists "Admin can add products" on public.products;
create policy "Admin can add products" on public.products
  for insert with check (public.is_admin());
drop policy if exists "Admin can edit products" on public.products;
create policy "Admin can edit products" on public.products
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admin can delete products" on public.products;
create policy "Admin can delete products" on public.products
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. STOCK  (quantity per size — ONLY the admin can see the numbers)
-- ---------------------------------------------------------------------
create table if not exists public.product_stock (
  product_id uuid not null references public.products(id) on delete cascade,
  size       text not null,
  quantity   int  not null default 0 check (quantity >= 0),
  sort_order int  not null default 0,
  primary key (product_id, size)
);
alter table public.product_stock enable row level security;

drop policy if exists "Admin manages stock" on public.product_stock;
create policy "Admin manages stock" on public.product_stock
  for all using (public.is_admin()) with check (public.is_admin());

-- Customers only get "in stock: yes/no" per size — never the actual number.
create or replace function public.get_availability(p_ids uuid[] default null)
returns table (product_id uuid, size text, in_stock boolean, sort_order int)
language sql stable security definer
set search_path = public
as $$
  select s.product_id, s.size, s.quantity > 0, s.sort_order
  from public.product_stock s
  join public.products p on p.id = s.product_id
  where (p.is_active or public.is_admin())
    and (p_ids is null or s.product_id = any (p_ids))
  order by s.product_id, s.sort_order, s.size;
$$;
grant execute on function public.get_availability(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. ORDERS
-- ---------------------------------------------------------------------
create sequence if not exists public.order_number_seq start 1001;

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_number   bigint not null unique default nextval('public.order_number_seq'),
  user_id        uuid not null references auth.users(id) on delete cascade,
  customer_email text not null,
  customer_name  text not null,
  phone          text not null,
  address        text not null,
  delivery_area  text not null check (delivery_area in ('inside_dhaka', 'outside_dhaka')),
  payment_method text not null check (payment_method in ('cod', 'bkash')),
  bkash_trx_id   text,
  note           text,
  subtotal       int  not null default 0,
  delivery_fee   int  not null default 0,
  total          int  not null default 0,
  status         text not null default 'pending'
                 check (status in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  created_at     timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders (user_id, created_at desc);
create index if not exists orders_created_idx on public.orders (created_at desc);
alter table public.orders enable row level security;

drop policy if exists "Customers see own orders, admin sees all" on public.orders;
create policy "Customers see own orders, admin sees all" on public.orders
  for select using (user_id = auth.uid() or public.is_admin());
-- No insert/update policies: orders are created/changed only through the functions below.

create table if not exists public.order_items (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,
  color        text not null default '',
  size         text not null,
  unit_price   int  not null,
  quantity     int  not null check (quantity > 0),
  image        text
);
create index if not exists order_items_order_idx on public.order_items (order_id);
alter table public.order_items enable row level security;

drop policy if exists "See items of visible orders" on public.order_items;
create policy "See items of visible orders" on public.order_items
  for select using (
    exists (select 1 from public.orders o
            where o.id = order_id and (o.user_id = auth.uid() or public.is_admin()))
  );

-- Places an order: checks stock, takes prices from the database (not the browser),
-- and reduces stock — all at once, so two people can't buy the last piece.
create or replace function public.place_order(
  p_items    jsonb,
  p_name     text,
  p_phone    text,
  p_address  text,
  p_area     text,
  p_payment  text,
  p_trx      text default null,
  p_note     text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_email    text := auth.jwt() ->> 'email';
  v_phone    text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_settings public.site_settings%rowtype;
  v_item     jsonb;
  v_pid      uuid;
  v_size     text;
  v_qty      int;
  v_prod     public.products%rowtype;
  v_stock    int;
  v_subtotal int := 0;
  v_fee      int;
  v_order_id uuid;
  v_number   bigint;
begin
  if v_uid is null or v_email is null then
    raise exception 'Please sign in with Google to place an order.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your bag is empty.';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'Too many items in one order.';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(p_name) > 100 then
    raise exception 'Please enter your full name.';
  end if;
  if v_phone !~ '^(88)?01[3-9][0-9]{8}$' then
    raise exception 'Please enter a valid Bangladeshi mobile number (e.g. 01XXXXXXXXX).';
  end if;
  if length(trim(coalesce(p_address, ''))) < 8 or length(p_address) > 500 then
    raise exception 'Please enter your full delivery address.';
  end if;
  if p_area not in ('inside_dhaka', 'outside_dhaka') then
    raise exception 'Please choose a delivery area.';
  end if;
  if p_payment not in ('cod', 'bkash') then
    raise exception 'Please choose a payment method.';
  end if;
  if p_payment = 'bkash' and length(trim(coalesce(p_trx, ''))) < 6 then
    raise exception 'Please enter your bKash transaction ID.';
  end if;
  if length(coalesce(p_note, '')) > 500 or length(coalesce(p_trx, '')) > 40 then
    raise exception 'Note or transaction ID is too long.';
  end if;

  v_phone := regexp_replace(v_phone, '^88', '');   -- store as 01XXXXXXXXX

  select * into v_settings from public.site_settings where id = 1;
  v_fee := case when p_area = 'inside_dhaka'
                then coalesce(v_settings.delivery_inside, 70)
                else coalesce(v_settings.delivery_outside, 130) end;

  insert into public.orders (user_id, customer_email, customer_name, phone, address,
                             delivery_area, payment_method, bkash_trx_id, note, delivery_fee)
  values (v_uid, v_email, trim(p_name), v_phone, trim(p_address),
          p_area, p_payment, nullif(trim(coalesce(p_trx, '')), ''), nullif(trim(coalesce(p_note, '')), ''), v_fee)
  returning id, order_number into v_order_id, v_number;

  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_pid  := (v_item ->> 'product_id')::uuid;
      v_qty  := (v_item ->> 'quantity')::int;
    exception when others then
      raise exception 'Something in your bag is not valid. Please remove it and try again.';
    end;
    v_size := v_item ->> 'size';
    if v_qty is null or v_qty < 1 or v_qty > 10 then
      raise exception 'You can order 1 to 10 pieces of each item.';
    end if;

    select * into v_prod from public.products where id = v_pid and is_active;
    if not found then
      raise exception 'An item in your bag is no longer available. Please remove it.';
    end if;

    select quantity into v_stock from public.product_stock
    where product_id = v_pid and size = v_size
    for update;
    if not found or v_stock < v_qty then
      raise exception '% (size %) is sold out or has fewer pieces left than you asked for.', v_prod.name, v_size;
    end if;

    update public.product_stock set quantity = quantity - v_qty
    where product_id = v_pid and size = v_size;

    insert into public.order_items (order_id, product_id, product_name, color, size, unit_price, quantity, image)
    values (v_order_id, v_pid, v_prod.name, v_prod.color, v_size, v_prod.price, v_qty, v_prod.images[1]);

    v_subtotal := v_subtotal + v_prod.price * v_qty;
  end loop;

  update public.orders
  set subtotal = v_subtotal, total = v_subtotal + v_fee
  where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_number,
    'subtotal', v_subtotal,
    'delivery_fee', v_fee,
    'total', v_subtotal + v_fee
  );
end;
$$;
revoke execute on function public.place_order(jsonb, text, text, text, text, text, text, text) from public, anon;
grant  execute on function public.place_order(jsonb, text, text, text, text, text, text, text) to authenticated;

-- Admin changes an order's status. Cancelling puts the pieces back in stock.
create or replace function public.admin_set_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can change orders.';
  end if;
  if p_status not in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled') then
    raise exception 'Unknown status.';
  end if;

  select status into v_old from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;
  if v_old = p_status then
    return;
  end if;
  if v_old = 'cancelled' then
    raise exception 'A cancelled order cannot be re-opened. Ask the customer to order again.';
  end if;

  if p_status = 'cancelled' then
    update public.product_stock s
    set quantity = s.quantity + i.qty
    from (select product_id, size, sum(quantity) as qty
          from public.order_items
          where order_id = p_order_id and product_id is not null
          group by product_id, size) i
    where s.product_id = i.product_id and s.size = i.size;
  end if;

  update public.orders set status = p_status where id = p_order_id;
end;
$$;
revoke execute on function public.admin_set_order_status(uuid, text) from public, anon;
grant  execute on function public.admin_set_order_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. PHOTO STORAGE  (bucket "product-images": anyone can view, only admin can upload)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "AROHA images: public read" on storage.objects;
create policy "AROHA images: public read" on storage.objects
  for select using (bucket_id = 'product-images');
drop policy if exists "AROHA images: admin upload" on storage.objects;
create policy "AROHA images: admin upload" on storage.objects
  for insert with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "AROHA images: admin update" on storage.objects;
create policy "AROHA images: admin update" on storage.objects
  for update using (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "AROHA images: admin delete" on storage.objects;
create policy "AROHA images: admin delete" on storage.objects
  for delete using (bucket_id = 'product-images' and public.is_admin());

-- Done! You should see "Success. No rows returned".
