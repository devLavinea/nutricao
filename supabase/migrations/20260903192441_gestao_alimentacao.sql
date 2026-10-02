create table if not exists public.funcionarios (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.cardapio (
  id uuid primary key default gen_random_uuid()
);