-- Contoh paket. Ubah nama, harga, dan periode sesuai aplikasimu.
-- Harga dibaca server dari tabel ini, tidak pernah dari browser.
insert into public.plans (id, name, amount, period_days, sort_order) values
  ('bulanan', 'Pro Bulanan', 49000, 30, 1),
  ('tahunan', 'Pro Tahunan', 490000, 365, 2)
on conflict (id) do nothing;
