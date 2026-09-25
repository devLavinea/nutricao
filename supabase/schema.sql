-- =========================================================
-- GESTÃO DA ALIMENTAÇÃO ESCOLAR
-- BANCO DE DADOS SUPABASE
-- =========================================================

create extension if not exists "pgcrypto";


-- =========================================================
-- PERFIS DOS FUNCIONÁRIOS
-- =========================================================

create table if not exists public.funcionarios (
  id uuid primary key references auth.users(id) on delete cascade,

  nome text not null,

  email text not null unique,

  perfil text not null
    check (
      perfil in (
        'secretaria',
        'professor',
        'cozinha'
      )
    ),

  ativo boolean not null default true,

  criado_em timestamptz not null default now(),

  atualizado_em timestamptz not null default now()
);


-- =========================================================
-- GRUPOS
-- =========================================================

create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),

  nome text not null unique
    check (
      nome in (
        'Grupo 1A',
        'Grupo 2A',
        'Grupo 2B',
        'Grupo 3A',
        'Grupo 3B'
      )
    ),

  ativo boolean not null default true,

  criado_em timestamptz not null default now()
);


insert into public.grupos (nome)
values
  ('Grupo 1A'),
  ('Grupo 2A'),
  ('Grupo 2B'),
  ('Grupo 3A'),
  ('Grupo 3B')
on conflict (nome) do nothing;


-- =========================================================
-- REFEIÇÕES
-- =========================================================

create table if not exists public.refeicoes (
  id uuid primary key default gen_random_uuid(),

  nome text not null unique
    check (
      nome in (
        'Desjejum',
        'Lanche da manhã',
        'Almoço',
        'Lanche da tarde',
        'Jantar'
      )
    ),

  ordem integer not null unique
);


insert into public.refeicoes (nome, ordem)
values
  ('Desjejum', 1),
  ('Lanche da manhã', 2),
  ('Almoço', 3),
  ('Lanche da tarde', 4),
  ('Jantar', 5)
on conflict (nome) do nothing;


-- =========================================================
-- PREPARAÇÕES
-- =========================================================

create table if not exists public.preparacoes (
  id uuid primary key default gen_random_uuid(),

  nome text not null,

  refeicao_id uuid not null
    references public.refeicoes(id)
    on delete restrict,

  ativo boolean not null default true,

  criado_em timestamptz not null default now(),

  unique(nome, refeicao_id)
);


-- =========================================================
-- CARDÁPIO
-- =========================================================

create table if not exists public.cardapio (
  id uuid primary key default gen_random_uuid(),

  data date not null,

  refeicao_id uuid not null
    references public.refeicoes(id)
    on delete restrict,

  preparacao_id uuid not null
    references public.preparacoes(id)
    on delete restrict,

  criado_por uuid
    references public.funcionarios(id)
    on delete set null,

  criado_em timestamptz not null default now(),

  unique(data, refeicao_id, preparacao_id)
);


-- =========================================================
-- REGISTROS REALIZADOS PELA COZINHA
-- =========================================================

create table if not exists public.registros_cozinha (
  id uuid primary key default gen_random_uuid(),

  data date not null,

  grupo_id uuid not null
    references public.grupos(id)
    on delete restrict,

  refeicao_id uuid not null
    references public.refeicoes(id)
    on delete restrict,

  preparacao_prevista_id uuid
    references public.preparacoes(id)
    on delete set null,

  preparacao_servida_id uuid
    references public.preparacoes(id)
    on delete set null,

  substituida boolean not null default false,

  outra_preparacao text,

  ingredientes_observacoes text,

  registrado_por uuid
    references public.funcionarios(id)
    on delete set null,

  criado_em timestamptz not null default now(),

  atualizado_em timestamptz not null default now(),

  check (
    (
      substituida = false
      and preparacao_servida_id = preparacao_prevista_id
      and outra_preparacao is null
    )
    or
    (
      substituida = true
      and (
        preparacao_servida_id is not null
        or outra_preparacao is not null
      )
    )
  )
);


-- =========================================================
-- AVALIAÇÕES DE ACEITABILIDADE
-- =========================================================

create table if not exists public.avaliacoes (
  id uuid primary key default gen_random_uuid(),

  registro_cozinha_id uuid not null
    references public.registros_cozinha(id)
    on delete cascade,

  data date not null,

  grupo_id uuid not null
    references public.grupos(id)
    on delete restrict,

  refeicao_id uuid not null
    references public.refeicoes(id)
    on delete restrict,

  preparacao_id uuid
    references public.preparacoes(id)
    on delete set null,

  preparacao_nome text not null,

  total_alunos integer not null
    check (total_alunos > 0),

  gostaram integer not null
    check (gostaram >= 0),

  nao_gostaram integer not null
    check (nao_gostaram >= 0),

  avaliado_por uuid
    references public.funcionarios(id)
    on delete set null,

  criado_em timestamptz not null default now(),

  check (
    gostaram + nao_gostaram <= total_alunos
  )
);


-- =========================================================
-- IMPEDIR DUPLICAÇÃO DA AVALIAÇÃO DA MESMA PREPARAÇÃO
-- NO MESMO MÊS / GRUPO / REFEIÇÃO
-- =========================================================

create unique index if not exists avaliacao_unica_mes
on public.avaliacoes (
  grupo_id,
  refeicao_id,
  preparacao_nome,
  date_trunc('month', data::timestamp)
);


-- =========================================================
-- ÍNDICES
-- =========================================================

create index if not exists idx_cardapio_data
on public.cardapio(data);

create index if not exists idx_cardapio_refeicao
on public.cardapio(refeicao_id);

create index if not exists idx_registros_data
on public.registros_cozinha(data);

create index if not exists idx_registros_grupo
on public.registros_cozinha(grupo_id);

create index if not exists idx_registros_refeicao
on public.registros_cozinha(refeicao_id);

create index if not exists idx_avaliacoes_data
on public.avaliacoes(data);

create index if not exists idx_avaliacoes_preparacao
on public.avaliacoes(preparacao_nome);


-- =========================================================
-- FUNÇÃO PARA ATUALIZAR atualizado_em
-- =========================================================

create or replace function public.atualizar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;


drop trigger if exists atualizar_funcionarios_atualizado_em
on public.funcionarios;

create trigger atualizar_funcionarios_atualizado_em
before update on public.funcionarios
for each row
execute function public.atualizar_atualizado_em();


drop trigger if exists atualizar_registros_cozinha_atualizado_em
on public.registros_cozinha;

create trigger atualizar_registros_cozinha_atualizado_em
before update on public.registros_cozinha
for each row
execute function public.atualizar_atualizado_em();


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.funcionarios enable row level security;
alter table public.grupos enable row level security;
alter table public.refeicoes enable row level security;
alter table public.preparacoes enable row level security;
alter table public.cardapio enable row level security;
alter table public.registros_cozinha enable row level security;
alter table public.avaliacoes enable row level security;


-- =========================================================
-- FUNÇÃO PARA PEGAR O PERFIL DO USUÁRIO LOGADO
-- =========================================================

create or replace function public.meu_perfil()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select perfil
  from public.funcionarios
  where id = auth.uid()
    and ativo = true
  limit 1;
$$;


-- =========================================================
-- FUNCIONÁRIOS
-- =========================================================

create policy "funcionario pode ver seu proprio perfil"
on public.funcionarios
for select
to authenticated
using (
  id = auth.uid()
);


create policy "secretaria pode ver funcionarios"
on public.funcionarios
for select
to authenticated
using (
  public.meu_perfil() = 'secretaria'
);


create policy "secretaria pode inserir funcionarios"
on public.funcionarios
for insert
to authenticated
with check (
  public.meu_perfil() = 'secretaria'
);


create policy "secretaria pode atualizar funcionarios"
on public.funcionarios
for update
to authenticated
using (
  public.meu_perfil() = 'secretaria'
)
with check (
  public.meu_perfil() = 'secretaria'
);


-- =========================================================
-- GRUPOS
-- =========================================================

create policy "usuarios autenticados veem grupos"
on public.grupos
for select
to authenticated
using (true);


-- =========================================================
-- REFEIÇÕES
-- =========================================================

create policy "usuarios autenticados veem refeicoes"
on public.refeicoes
for select
to authenticated
using (true);


-- =========================================================
-- PREPARAÇÕES
-- =========================================================

create policy "usuarios autenticados veem preparacoes"
on public.preparacoes
for select
to authenticated
using (true);


create policy "secretaria gerencia preparacoes"
on public.preparacoes
for all
to authenticated
using (
  public.meu_perfil() = 'secretaria'
)
with check (
  public.meu_perfil() = 'secretaria'
);


-- =========================================================
-- CARDÁPIO
-- =========================================================

create policy "usuarios autenticados veem cardapio"
on public.cardapio
for select
to authenticated
using (true);


create policy "secretaria cria cardapio"
on public.cardapio
for insert
to authenticated
with check (
  public.meu_perfil() = 'secretaria'
);


create policy "secretaria atualiza cardapio"
on public.cardapio
for update
to authenticated
using (
  public.meu_perfil() = 'secretaria'
)
with check (
  public.meu_perfil() = 'secretaria'
);


create policy "secretaria exclui cardapio"
on public.cardapio
for delete
to authenticated
using (
  public.meu_perfil() = 'secretaria'
);


-- =========================================================
-- COZINHA
-- =========================================================

create policy "usuarios autenticados veem registros cozinha"
on public.registros_cozinha
for select
to authenticated
using (true);


create policy "cozinha cria registros"
on public.registros_cozinha
for insert
to authenticated
with check (
  public.meu_perfil() in (
    'cozinha',
    'secretaria'
  )
);


create policy "cozinha atualiza seus registros"
on public.registros_cozinha
for update
to authenticated
using (
  public.meu_perfil() in (
    'cozinha',
    'secretaria'
  )
)
with check (
  public.meu_perfil() in (
    'cozinha',
    'secretaria'
  )
);


-- =========================================================
-- AVALIAÇÕES
-- =========================================================

create policy "usuarios autenticados veem avaliacoes"
on public.avaliacoes
for select
to authenticated
using (true);


create policy "professores criam avaliacoes"
on public.avaliacoes
for insert
to authenticated
with check (
  public.meu_perfil() in (
    'professor',
    'secretaria'
  )
);


create policy "professores atualizam avaliacoes"
on public.avaliacoes
for update
to authenticated
using (
  public.meu_perfil() in (
    'professor',
    'secretaria'
  )
)
with check (
  public.meu_perfil() in (
    'professor',
    'secretaria'
  )
);


-- =========================================================
-- DADOS INICIAIS DE PREPARAÇÕES
-- =========================================================

insert into public.preparacoes (nome, refeicao_id)
select
  dados.nome,
  r.id
from (
  values
    (
      'Mingau de aveia com banana e cacau em pó (Fórmula láctea)',
      'Desjejum'
    ),
    (
      'Mingau de multicereais',
      'Desjejum'
    ),
    (
      'Pão com ovo e cacau com fórmula láctea',
      'Desjejum'
    ),
    (
      'Mingau de amido com goiaba (Fórmula láctea)',
      'Desjejum'
    ),
    (
      'Ovo mexido e batata doce',
      'Desjejum'
    ),

    (
      'Melancia picada',
      'Lanche da manhã'
    ),
    (
      'Maçã raspada',
      'Lanche da manhã'
    ),
    (
      'Melão em pedaços ou raspado',
      'Lanche da manhã'
    ),
    (
      'Tangerina',
      'Lanche da manhã'
    ),
    (
      'Manga picada ou amassada',
      'Lanche da manhã'
    ),
    (
      'Banana amassada',
      'Lanche da manhã'
    ),
    (
      'Laranja picada',
      'Lanche da manhã'
    ),
    (
      'Mamão amassado',
      'Lanche da manhã'
    ),

    (
      'Carne moída com arroz, feijão, abóbora e cenoura',
      'Almoço'
    ),
    (
      'Strogonoff de frango, feijão de corda, arroz e purê de batata inglesa',
      'Almoço'
    ),
    (
      'Isca de carne ao molho, arroz, feijão preto e couve refogado',
      'Almoço'
    ),
    (
      'Fígado cozido ao molho de tomate, feijão carioca, arroz e salada cozida de beterraba e cenoura',
      'Almoço'
    ),
    (
      'Frango ao molho, feijão com abóbora, arroz e salada crua de alface e tomate picado',
      'Almoço'
    ),
    (
      'Ovo cozido, feijão carioca, arroz, abóbora e cenoura',
      'Almoço'
    ),
    (
      'Galinha caipira com arroz e cenoura, salada crua de alface e tomate picado',
      'Almoço'
    ),
    (
      'Picadinho de carne com cenoura e batata inglesa, arroz, feijão carioca e pirão',
      'Almoço'
    ),
    (
      'Bobó de frango, feijão carioca, arroz e batata inglesa',
      'Almoço'
    ),
    (
      'Carne moída com abóbora, feijão preto, arroz e couve refogado',
      'Almoço'
    ),

    (
      'Vitamina de banana (Fórmula láctea)',
      'Lanche da tarde'
    ),
    (
      'Mousse de banana com cacau',
      'Lanche da tarde'
    ),
    (
      'Vitamina de maçã (Fórmula láctea)',
      'Lanche da tarde'
    ),
    (
      'Mousse de banana com maracujá (Fórmula láctea)',
      'Lanche da tarde'
    ),
    (
      'Vitamina de polpa de goiaba (Fórmula láctea)',
      'Lanche da tarde'
    ),
    (
      'Mix de frutas',
      'Lanche da tarde'
    ),
    (
      'Suco de manga com biscoito salgado',
      'Lanche da tarde'
    ),

    (
      'Canja de galinha',
      'Jantar'
    ),
    (
      'Creme de macaxeira com arroz e carne moída',
      'Jantar'
    ),
    (
      'Frango desfiado com purê de beterraba e cenoura e arroz',
      'Jantar'
    ),
    (
      'Sopa de feijão com frango, cenoura e batata inglesa',
      'Jantar'
    ),
    (
      'Polenta com carne moída',
      'Jantar'
    ),
    (
      'Purê de batata doce, frango desfiado e arroz',
      'Jantar'
    ),
    (
      'Sopa nutritiva de macarrão, legumes e carne moída',
      'Jantar'
    ),
    (
      'Creme de abóbora com frango, couve e arroz',
      'Jantar'
    ),
    (
      'Risoto de carne moída',
      'Jantar'
    ),
    (
      'Macarronada de frango',
      'Jantar'
    )
) as dados(nome, refeicao)
join public.refeicoes r
  on r.nome = dados.refeicao
on conflict (nome, refeicao_id) do nothing;