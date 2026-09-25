create table public.escolas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  endereco text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table public.escolas enable row level security;
