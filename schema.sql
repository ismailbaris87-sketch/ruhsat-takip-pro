-- Ruhsat Takip Pro: Supabase SQL Editor'da bir kez çalıştırın.
-- Bu tablolar giriş yapan kullanıcının kendi kayıtlarına erişmesini RLS ile sınırlar.
create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text default '',
  business text default '',
  address text default '',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  type text not null,
  status text not null default 'Yeni başvuru',
  address text default '',
  parcel text default '',
  due_date date,
  fee numeric(12,2) not null default 0,
  notes text default '',
  checklist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid references public.files(id) on delete set null,
  title text not null,
  due_date date,
  done boolean not null default false,
  notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid references public.files(id) on delete set null,
  kind text not null check (kind in ('Tahsilat','Gider')),
  category text default '',
  amount numeric(12,2) not null check (amount >= 0),
  date date not null default current_date,
  notes text default '',
  created_at timestamptz not null default now()
);

alter table public.clients enable row level security;
alter table public.files enable row level security;
alter table public.tasks enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "clients owner access" on public.clients;
create policy "clients owner access" on public.clients for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "files owner access" on public.files;
create policy "files owner access" on public.files for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "tasks owner access" on public.tasks;
create policy "tasks owner access" on public.tasks for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "transactions owner access" on public.transactions;
create policy "transactions owner access" on public.transactions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists clients_user_idx on public.clients(user_id);
create index if not exists files_user_idx on public.files(user_id);
create index if not exists tasks_user_due_idx on public.tasks(user_id, due_date);
create index if not exists transactions_user_date_idx on public.transactions(user_id, date);
