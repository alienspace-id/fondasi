-- Skema awal Fondasi: profil, paket, order, dan langganan per periode.
-- Semua tabel memakai Row Level Security. Pengguna hanya bisa membaca datanya
-- sendiri; semua perubahan status pembayaran dilakukan server dengan secret key.

-- Profil ------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Pengguna membaca profilnya sendiri"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Pengguna mengubah profilnya sendiri"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Supabase memberi hak UPDATE ke semua kolom secara default.
-- Pengguna hanya boleh mengubah nama, bukan email atau id.
revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Profil dibuat otomatis saat pengguna mendaftar (email atau Google).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Fungsi trigger tidak boleh dipanggil lewat API (/rest/v1/rpc).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Paket -------------------------------------------------------------------

create table public.plans (
  id          text primary key,
  name        text not null,
  amount      integer not null check (amount > 0),   -- rupiah
  period_days integer not null check (period_days > 0),
  active      boolean not null default true,
  sort_order  integer not null default 0
);

alter table public.plans enable row level security;

create policy "Siapa saja membaca paket yang aktif"
  on public.plans for select to anon, authenticated
  using (active);

-- Order -------------------------------------------------------------------

create table public.orders (
  id           text primary key,                      -- order_id yang dikirim ke gateway
  user_id      uuid references public.profiles (id) on delete set null,
  email        text not null,
  plan_id      text not null references public.plans (id),
  plan_name    text not null,                         -- disalin saat order dibuat
  amount       integer not null check (amount > 0),
  period_days  integer not null check (period_days > 0),
  provider     text not null,                         -- driver pembayaran, misalnya 'midtrans'
  status       text not null default 'pending'
               check (status in ('pending', 'paid', 'failed', 'refunded')),
  payment_type text,
  paid_at      timestamptz,
  period_start timestamptz,
  period_end   timestamptz,
  created_at   timestamptz not null default now()
);

create index orders_user_id_idx on public.orders (user_id);
create index orders_pending_idx on public.orders (created_at) where status = 'pending';

alter table public.orders enable row level security;

create policy "Pengguna membaca ordernya sendiri"
  on public.orders for select to authenticated
  using ((select auth.uid()) = user_id);

-- Langganan ---------------------------------------------------------------

create table public.subscriptions (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  plan_id            text not null references public.plans (id),
  current_period_end timestamptz not null,
  reminder_sent_at   timestamptz,  -- dikosongkan lagi setiap kali langganan diperpanjang
  updated_at         timestamptz not null default now()
);

create index subscriptions_period_end_idx on public.subscriptions (current_period_end);

alter table public.subscriptions enable row level security;

create policy "Pengguna membaca langganannya sendiri"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

-- Fungsi pembayaran -------------------------------------------------------
-- Dipanggil server (service_role) setelah status dicek ke gateway.
-- Satu transaksi database: kalau dua notifikasi datang bersamaan,
-- hanya satu yang mendapat true, dan masa langganan hanya bertambah sekali.

create function public.mark_order_paid(p_order_id text, p_payment_type text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  o         public.orders;
  period    interval;
  start_at  timestamptz;
begin
  update public.orders
     set status = 'paid', paid_at = now(), payment_type = p_payment_type
   where id = p_order_id and status = 'pending'
  returning * into o;

  if not found then
    return false;
  end if;

  if o.user_id is null then
    return true;
  end if;

  period := make_interval(days => o.period_days);

  -- Kunci baris langganan supaya dua pembayaran pengguna yang sama ditumpuk, bukan saling timpa.
  insert into public.subscriptions (user_id, plan_id, current_period_end)
  values (o.user_id, o.plan_id, o.paid_at)
  on conflict (user_id) do nothing;

  select greatest(current_period_end, o.paid_at) into start_at
    from public.subscriptions
   where user_id = o.user_id
     for update;

  update public.subscriptions
     set plan_id = o.plan_id,
         current_period_end = start_at + period,
         reminder_sent_at = null,
         updated_at = now()
   where user_id = o.user_id;

  update public.orders
     set period_start = start_at, period_end = start_at + period
   where id = o.id;

  return true;
end;
$$;

-- Refund mengurangi masa langganan sebesar periode order itu, tapi tidak mundur ke masa lalu.
create function public.mark_order_refunded(p_order_id text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  o public.orders;
begin
  update public.orders
     set status = 'refunded'
   where id = p_order_id and status = 'paid'
  returning * into o;

  if not found then
    return false;
  end if;

  update public.subscriptions
     set current_period_end = greatest(now(), current_period_end - make_interval(days => o.period_days)),
         updated_at = now()
   where user_id = o.user_id;

  return true;
end;
$$;

revoke execute on function public.mark_order_paid(text, text) from public, anon, authenticated;
revoke execute on function public.mark_order_refunded(text) from public, anon, authenticated;
grant execute on function public.mark_order_paid(text, text) to service_role;
grant execute on function public.mark_order_refunded(text) to service_role;
