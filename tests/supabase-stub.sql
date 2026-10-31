-- Tiruan minimal bagian Supabase yang dipakai migrasi, supaya test RLS
-- berjalan di PGlite tanpa Docker. Mengikuti perilaku Supabase:
-- role anon, authenticated, service_role, auth.uid() dari klaim JWT,
-- dan hak default ke semua tabel di schema public.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key,
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
