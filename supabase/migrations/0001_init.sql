-- ============================================================================
-- Império Pie — schema completo + dados iniciais (idempotente)
-- Projeto: fivzbqdjpydcaymluqja
-- Uso: colar TODO este arquivo no SQL Editor do Supabase e executar.
-- Pode rodar mais de uma vez sem erro (tabelas/policies/triggers idempotentes).
-- ============================================================================

begin;

-- ============================================================================
-- 1/4 · TABELAS
-- ============================================================================

create table if not exists public.perfis (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text,
  telefone      text,
  papel         text not null default 'cliente' check (papel in ('cliente','admin')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.admins (
  email      text primary key,
  criado_em  timestamptz not null default now()
);

create table if not exists public.tortas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  slug          text not null unique,
  descricao     text,
  imagem        text,
  preco_base    numeric(10,2) not null default 0,
  estoque       integer,                       -- null = produção sob encomenda
  vendas        integer not null default 0,
  ativo         boolean not null default true,
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.precos (
  id              uuid primary key default gen_random_uuid(),
  torta_id        uuid not null references public.tortas(id) on delete cascade,
  preco           numeric(10,2) not null check (preco >= 0),
  vigencia_inicio date not null default current_date,
  vigencia_fim    date,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  criado_por      uuid references auth.users(id) on delete set null
);

create table if not exists public.promocoes (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  tipo             text not null check (tipo in ('percentual','fixo')),
  valor            numeric(10,2) not null check (valor >= 0),
  cupom            text unique,
  torta_ids        text[],                      -- null = vale para todas
  vigencia_inicio  timestamptz not null default now(),
  vigencia_fim     timestamptz,
  limite_usos      integer,
  usos             integer not null default 0,
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  check (cupom is null or cupom = upper(cupom)),
  check (tipo <> 'percentual' or valor <= 100)
);

create table if not exists public.opcoes_torta (
  id              uuid primary key default gen_random_uuid(),
  categoria       text not null check (categoria in ('base','recheio','cobertura','tamanho')),
  nome            text not null,
  descricao       text,
  preco_adicional numeric(10,2) not null default 0,
  multiplicador   numeric(10,2) not null default 1,
  cor_hex         text,
  imagem          text,
  ativo           boolean not null default true,
  ordem           integer not null default 0,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (categoria, nome)
);

create table if not exists public.tortas_customizadas (
  id              uuid primary key default gen_random_uuid(),
  base_id         uuid not null references public.opcoes_torta(id),
  recheio_id      uuid not null references public.opcoes_torta(id),
  cobertura_id    uuid not null references public.opcoes_torta(id),
  tamanho_id      uuid not null references public.opcoes_torta(id),
  preco_calculado numeric(10,2) not null,
  detalhes        jsonb not null default '{}'::jsonb,
  usuario_id      uuid not null references auth.users(id) on delete cascade,
  criado_em       timestamptz not null default now()
);

create table if not exists public.compras (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references auth.users(id) on delete restrict,
  status        text not null default 'pendente'
                check (status in ('pendente','confirmada','em_producao','pronta','entregue','cancelada')),
  nome          text not null,
  contato       text not null,
  endereco      text,
  entrega       text not null default 'retirada' check (entrega in ('retirada','entrega')),
  pagamento     text check (pagamento in ('pix','cartao','na_entrega')),
  janela        text,
  observacoes   text,
  subtotal      numeric(10,2) not null default 0,
  desconto      numeric(10,2) not null default 0,
  frete         numeric(10,2) not null default 0,
  total         numeric(10,2) not null default 0,
  cupom         text,
  origem        text not null default 'site' check (origem in ('site','admin')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.compra_itens (
  id                    uuid primary key default gen_random_uuid(),
  compra_id             uuid not null references public.compras(id) on delete cascade,
  torta_id              uuid references public.tortas(id) on delete set null,
  torta_customizada_id  uuid references public.tortas_customizadas(id) on delete set null,
  nome                  text not null,
  quantidade            integer not null check (quantidade > 0),
  preco_unitario        numeric(10,2) not null check (preco_unitario >= 0),
  subtotal              numeric(10,2) not null,
  check (((torta_id is not null)::int + (torta_customizada_id is not null)::int) = 1)
);

create table if not exists public.configuracoes (
  chave         text primary key,
  valor         jsonb not null default 'null'::jsonb,
  descricao     text,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.auditoria (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid references auth.users(id) on delete set null,
  acao        text not null,
  entidade    text not null,
  entidade_id text,
  detalhes    jsonb,
  criado_em   timestamptz not null default now()
);

-- Índices
create index if not exists ix_precos_torta        on public.precos (torta_id, vigencia_inicio desc);
create index if not exists ix_precos_vigencia      on public.precos (ativo, vigencia_inicio, vigencia_fim);
create index if not exists ix_promocoes_cupom      on public.promocoes (cupom) where cupom is not null;
create index if not exists ix_opcoes_categoria     on public.opcoes_torta (categoria, ativo);
create index if not exists ix_compras_status       on public.compras (status);
create index if not exists ix_compras_usuario      on public.compras (usuario_id, criado_em desc);
create index if not exists ix_compra_itens_compra  on public.compra_itens (compra_id);
create index if not exists ix_tortas_customizadas  on public.tortas_customizadas (usuario_id, criado_em desc);
create index if not exists ix_auditoria_entidade   on public.auditoria (entidade, criado_em desc);

-- ============================================================================
-- 2/4 · FUNÇÕES E TRIGGERS
-- ============================================================================

-- Papel do usuário logado (security definer evita recursão de RLS)
create or replace function public.papel_atual()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce((select papel from public.perfis where id = auth.uid()), 'cliente');
$$;

-- Admin é reconhecido pelo papel em public.perfis (ligado ao id da conta),
-- nunca por e-mail solto: um e-mail na allowlist dava acesso a qualquer
-- pessoa que se cadastrasse com ele. Ver 0002_admin_por_papel.sql.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select papel = 'admin' from public.perfis where id = auth.uid()), false);
$$;

create or replace function public.set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- Cria o perfil automaticamente no cadastro
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, telefone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(coalesce(new.email, ''), '@', 1)),
    new.phone
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Preço vigente de uma torta (histórico em public.precos)
create or replace function public.preco_atual(p_torta_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select p.preco
  from public.precos p
  where p.torta_id = p_torta_id
    and p.ativo
    and p.vigencia_inicio <= current_date
    and (p.vigencia_fim is null or p.vigencia_fim >= current_date)
  order by p.vigencia_inicio desc, p.criado_em desc
  limit 1;
$$;

-- Preço com promoção aplicada (usado no cardápio)
create or replace function public.preco_com_promo(p_torta_id uuid, p_cupom text default null)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_base  numeric;
  v_promo public.promocoes%rowtype;
  v_preco numeric;
begin
  v_base := public.preco_atual(p_torta_id);
  if v_base is null then
    select preco_base into v_base from public.tortas where id = p_torta_id;
  end if;
  if v_base is null then return null; end if;
  if p_cupom is null or btrim(p_cupom) = '' then return round(v_base, 2); end if;

  select * into v_promo
  from public.promocoes
  where ativo
    and cupom = upper(btrim(p_cupom))
    and now() between vigencia_inicio and coalesce(vigencia_fim, 'infinity'::timestamptz)
    and (limite_usos is null or usos < limite_usos)
    and (torta_ids is null or p_torta_id::text = any (torta_ids))
  limit 1;

  if not found then return round(v_base, 2); end if;
  v_preco := case
    when v_promo.tipo = 'percentual' then v_base * (1 - v_promo.valor / 100)
    else v_base - v_promo.valor
  end;
  return round(greatest(v_preco, 0), 2);
end $$;

-- Valida um cupom e devolve seus dados (null se inválido/expirado)
create or replace function public.aplicar_promo(p_cupom text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v public.promocoes%rowtype;
begin
  if p_cupom is null or btrim(p_cupom) = '' then return null; end if;
  select * into v
  from public.promocoes
  where ativo
    and cupom = upper(btrim(p_cupom))
    and now() between vigencia_inicio and coalesce(vigencia_fim, 'infinity'::timestamptz)
    and (limite_usos is null or usos < limite_usos)
  limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id', v.id, 'nome', v.nome, 'tipo', v.tipo, 'valor', v.valor);
end $$;

-- Lê um número da tabela de configurações (aceita 14, "14" ou "14,00")
create or replace function public.config_numero(p_chave text, p_padrao numeric default 0)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select valor into v from public.configuracoes where chave = p_chave;
  if v is null then return p_padrao; end if;
  if jsonb_typeof(v) = 'number' then return (v #>> '{}')::numeric; end if;
  if jsonb_typeof(v) = 'string' then
    begin
      return replace(replace(v #>> '{}', '.', ','), ',', '.')::numeric;
    exception when others then
      return p_padrao;
    end;
  end if;
  return p_padrao;
end $$;

-- Preço do "Monte a sua" calculado no servidor (o front nunca define preço)
create or replace function public.calcular_preco_customizado(
  p_base uuid, p_recheio uuid, p_cobertura uuid, p_tamanho uuid
)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_pb    numeric;
  v_pr    numeric;
  v_pc    numeric;
  v_mult  numeric;
  v_cfg   numeric;
  v_un    numeric;
begin
  v_cfg := public.config_numero('preco_base_torta', 14);

  select preco_adicional into v_pb from public.opcoes_torta
   where id = p_base and ativo and categoria = 'base';
  if v_pb is null then raise exception 'Base inválida'; end if;

  select preco_adicional into v_pr from public.opcoes_torta
   where id = p_recheio and ativo and categoria = 'recheio';
  if v_pr is null then raise exception 'Recheio inválido'; end if;

  select preco_adicional into v_pc from public.opcoes_torta
   where id = p_cobertura and ativo and categoria = 'cobertura';
  if v_pc is null then raise exception 'Cobertura inválida'; end if;

  select multiplicador into v_mult from public.opcoes_torta
   where id = p_tamanho and ativo and categoria = 'tamanho';
  if v_mult is null then raise exception 'Tamanho inválido'; end if;

  v_un := v_cfg + v_pb + v_pr + v_pc;
  return round(v_un * v_mult, 2);
end $$;

-- Grava o pedido (compra + itens + estoque) em uma única transação
create or replace function public.registrar_compra(p_itens jsonb, p_dados jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_compra   uuid;
  v_item     jsonb;
  v_torta    uuid;
  v_custom   uuid;
  v_qtd      integer;
  v_preco    numeric;
  v_nome     text;
  v_detalhes jsonb;
  v_subtotal numeric := 0;
  v_desconto numeric := 0;
  v_frete    numeric := 0;
  v_total    numeric;
  v_cupom    text := nullif(btrim(coalesce(p_dados ->> 'cupom', '')), '');
  v_promo    jsonb;
begin
  if v_uid is null then
    raise exception 'Faça login para finalizar o pedido';
  end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Seu carrinho está vazio';
  end if;
  if btrim(coalesce(p_dados ->> 'nome', '')) = '' or btrim(coalesce(p_dados ->> 'contato', '')) = '' then
    raise exception 'Informe nome e contato';
  end if;
  if coalesce(nullif(p_dados ->> 'entrega', ''), 'retirada') = 'entrega'
     and btrim(coalesce(p_dados ->> 'endereco', '')) = '' then
    raise exception 'Informe o endereço de entrega';
  end if;

  -- 1) valida itens e calcula subtotal (preço sempre do servidor)
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_item ->> 'quantidade')::integer, 0);
    if v_qtd <= 0 or v_qtd > 99 then raise exception 'Quantidade inválida'; end if;

    v_torta  := nullif(v_item ->> 'torta_id', '')::uuid;
    v_custom := nullif(v_item ->> 'torta_customizada_id', '')::uuid;

    if v_torta is not null then
      select nome, preco_base into v_nome, v_preco
        from public.tortas where id = v_torta and ativo;
      if v_nome is null then raise exception 'Torta indisponível'; end if;
      if exists (select 1 from public.tortas
                  where id = v_torta and estoque is not null and estoque < v_qtd) then
        raise exception 'Estoque insuficiente para %', v_nome;
      end if;
      v_preco := coalesce(public.preco_atual(v_torta), v_preco);

    elsif v_custom is not null then
      select preco_calculado, detalhes into v_preco, v_detalhes
        from public.tortas_customizadas
       where id = v_custom and usuario_id = v_uid;
      if v_preco is null then raise exception 'Torta montada não encontrada'; end if;
      v_nome := coalesce(v_detalhes ->> 'nome', v_detalhes ->> 'descricao', 'Torta montada');

    else
      raise exception 'Item inválido no carrinho';
    end if;

    v_subtotal := v_subtotal + (v_preco * v_qtd);
  end loop;

  -- 2) cupom gera desconto no total do pedido
  if v_cupom is not null then
    v_promo := public.aplicar_promo(v_cupom);
    if v_promo is null then raise exception 'Cupom inválido ou expirado'; end if;
    if v_promo ->> 'tipo' = 'percentual' then
      v_desconto := round(v_subtotal * ((v_promo ->> 'valor')::numeric / 100), 2);
    else
      v_desconto := least(round((v_promo ->> 'valor')::numeric, 2), v_subtotal);
    end if;
  end if;

  v_frete := public.config_numero('frete_valor', 0);
  v_total := round(greatest(v_subtotal - v_desconto + v_frete, 0), 2);

  -- 3) cria o pedido
  insert into public.compras (
    usuario_id, nome, contato, endereco, entrega, pagamento, janela, observacoes,
    subtotal, desconto, frete, total, cupom, origem
  )
  values (
    v_uid,
    p_dados ->> 'nome',
    p_dados ->> 'contato',
    nullif(p_dados ->> 'endereco', ''),
    coalesce(nullif(p_dados ->> 'entrega', ''), 'retirada'),
    nullif(p_dados ->> 'pagamento', ''),
    nullif(p_dados ->> 'janela', ''),
    nullif(p_dados ->> 'observacoes', ''),
    round(v_subtotal, 2), v_desconto, v_frete, v_total, v_cupom, 'site'
  )
  returning id into v_compra;

  -- 4) grava itens, baixa estoque e soma vendas
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd    := (v_item ->> 'quantidade')::integer;
    v_torta  := nullif(v_item ->> 'torta_id', '')::uuid;
    v_custom := nullif(v_item ->> 'torta_customizada_id', '')::uuid;

    if v_torta is not null then
      select nome into v_nome from public.tortas where id = v_torta;
      v_preco := coalesce(
        public.preco_atual(v_torta),
        (select preco_base from public.tortas where id = v_torta),
        0
      );
      update public.tortas
         set estoque = case when estoque is null then null else estoque - v_qtd end,
             vendas  = vendas + v_qtd
       where id = v_torta;
    else
      select preco_calculado, detalhes into v_preco, v_detalhes
        from public.tortas_customizadas where id = v_custom;
      v_nome := coalesce(v_detalhes ->> 'nome', v_detalhes ->> 'descricao', 'Torta montada');
    end if;

    insert into public.compra_itens (
      compra_id, torta_id, torta_customizada_id, nome, quantidade, preco_unitario, subtotal
    )
    values (
      v_compra, v_torta, v_custom, v_nome, v_qtd, round(v_preco, 2), round(v_preco * v_qtd, 2)
    );
  end loop;

  -- 5) contabiliza o uso do cupom
  if v_cupom is not null then
    update public.promocoes set usos = usos + 1 where cupom = v_cupom;
  end if;

  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, detalhes)
  values (v_uid, 'criar', 'compra', v_compra::text, jsonb_build_object('total', v_total, 'itens', jsonb_array_length(p_itens)));

  return v_compra;
end $$;

-- Triggers de updated_at
do $$
declare t text;
begin
  foreach t in array array['perfis','tortas','promocoes','opcoes_torta','compras','configuracoes'] loop
    execute format('drop trigger if exists tg_atualizado_%s on public.%I', t, t);
    execute format('create trigger tg_atualizado_%s before update on public.%I for each row execute function public.set_atualizado_em()', t, t);
  end loop;
end $$;

-- Perfil automático no cadastro
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 3/4 · RLS, POLICIES E GRANTS
-- ============================================================================

alter table public.perfis            enable row level security;
alter table public.admins            enable row level security;
alter table public.tortas            enable row level security;
alter table public.precos            enable row level security;
alter table public.promocoes         enable row level security;
alter table public.opcoes_torta      enable row level security;
alter table public.tortas_customizadas enable row level security;
alter table public.compras           enable row level security;
alter table public.compra_itens      enable row level security;
alter table public.configuracoes     enable row level security;
alter table public.auditoria         enable row level security;

-- Catálogo: leitura pública só do que está ativo/vigente
drop policy if exists "publico_le_tortas" on public.tortas;
create policy "publico_le_tortas" on public.tortas for select to anon, authenticated using (ativo);

drop policy if exists "admin_tortas" on public.tortas;
create policy "admin_tortas" on public.tortas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "publico_le_precos" on public.precos;
create policy "publico_le_precos" on public.precos for select to anon, authenticated
  using (ativo and vigencia_inicio <= current_date and (vigencia_fim is null or vigencia_fim >= current_date));

drop policy if exists "admin_precos" on public.precos;
create policy "admin_precos" on public.precos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "publico_le_promocoes" on public.promocoes;
create policy "publico_le_promocoes" on public.promocoes for select to anon, authenticated
  using (ativo and now() between vigencia_inicio and coalesce(vigencia_fim, 'infinity'::timestamptz)
         and (limite_usos is null or usos < limite_usos));

drop policy if exists "admin_promocoes" on public.promocoes;
create policy "admin_promocoes" on public.promocoes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "publico_le_opcoes" on public.opcoes_torta;
create policy "publico_le_opcoes" on public.opcoes_torta for select to anon, authenticated using (ativo);

drop policy if exists "admin_opcoes" on public.opcoes_torta;
create policy "admin_opcoes" on public.opcoes_torta for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "publico_le_configuracoes" on public.configuracoes;
create policy "publico_le_configuracoes" on public.configuracoes for select to anon, authenticated using (true);

drop policy if exists "admin_configuracoes" on public.configuracoes;
create policy "admin_configuracoes" on public.configuracoes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Perfis: cada um vê e edita o próprio; não pode se promover a admin
drop policy if exists "le_proprio_perfil" on public.perfis;
create policy "le_proprio_perfil" on public.perfis for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "atualiza_proprio_perfil" on public.perfis;
create policy "atualiza_proprio_perfil" on public.perfis for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (public.papel_atual() = 'admin' or papel = public.papel_atual());

drop policy if exists "admin_perfis" on public.perfis;
create policy "admin_perfis" on public.perfis for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_le_admins" on public.admins;
create policy "admin_le_admins" on public.admins for select to authenticated using (public.is_admin());
-- (sem policy de insert/update/delete: só via SQL do painel)

-- Compras
drop policy if exists "le_proprias_compras" on public.compras;
create policy "le_proprias_compras" on public.compras for select to authenticated
  using (usuario_id = auth.uid() or public.is_admin());

drop policy if exists "cria_propria_compra" on public.compras;
create policy "cria_propria_compra" on public.compras for insert to authenticated
  with check (usuario_id = auth.uid());

drop policy if exists "cancela_propria_compra" on public.compras;
create policy "cancela_propria_compra" on public.compras for update to authenticated
  using (usuario_id = auth.uid() and status = 'pendente')
  with check (usuario_id = auth.uid() and status = 'cancelada');

drop policy if exists "admin_compras" on public.compras;
create policy "admin_compras" on public.compras for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Itens do pedido
drop policy if exists "le_itens_da_compra" on public.compra_itens;
create policy "le_itens_da_compra" on public.compra_itens for select to authenticated
  using (exists (select 1 from public.compras c where c.id = compra_id and (c.usuario_id = auth.uid() or public.is_admin())));

drop policy if exists "cria_item_da_compra" on public.compra_itens;
create policy "cria_item_da_compra" on public.compra_itens for insert to authenticated
  with check (exists (select 1 from public.compras c where c.id = compra_id and c.usuario_id = auth.uid()));

drop policy if exists "admin_compra_itens" on public.compra_itens;
create policy "admin_compra_itens" on public.compra_itens for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Tortas customizadas
drop policy if exists "le_proprias_customizadas" on public.tortas_customizadas;
create policy "le_proprias_customizadas" on public.tortas_customizadas for select to authenticated
  using (usuario_id = auth.uid() or public.is_admin());

drop policy if exists "cria_propria_customizada" on public.tortas_customizadas;
create policy "cria_propria_customizada" on public.tortas_customizadas for insert to authenticated
  with check (usuario_id = auth.uid());

drop policy if exists "deleta_propria_customizada" on public.tortas_customizadas;
create policy "deleta_propria_customizada" on public.tortas_customizadas for delete to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "admin_customizadas" on public.tortas_customizadas;
create policy "admin_customizadas" on public.tortas_customizadas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Auditoria: só admin
drop policy if exists "admin_le_auditoria" on public.auditoria;
create policy "admin_le_auditoria" on public.auditoria for select to authenticated using (public.is_admin());

drop policy if exists "admin_grava_auditoria" on public.auditoria;
create policy "admin_grava_auditoria" on public.auditoria for insert to authenticated
  with check (public.is_admin());

-- Grants
grant usage on schema public to anon, authenticated;

grant select on public.tortas, public.precos, public.promocoes, public.opcoes_torta, public.configuracoes to anon, authenticated;
grant all    on public.perfis, public.compras, public.compra_itens, public.tortas_customizadas, public.auditoria to authenticated;
grant select on public.admins to authenticated;

revoke execute on function public.registrar_compra(jsonb, jsonb) from public;
grant  execute on function public.registrar_compra(jsonb, jsonb) to authenticated;

grant execute on function public.papel_atual() to anon, authenticated;
grant execute on function public.is_admin()      to anon, authenticated;
grant execute on function public.preco_atual(uuid) to anon, authenticated;
grant execute on function public.preco_com_promo(uuid, text) to anon, authenticated;
grant execute on function public.aplicar_promo(text) to anon, authenticated;
grant execute on function public.calcular_preco_customizado(uuid, uuid, uuid, uuid) to anon, authenticated;

-- View de conveniência para o cardápio do site
drop view if exists public.cardapio;
create view public.cardapio with (security_invoker = on) as
  select t.id, t.nome, t.slug, t.descricao, t.imagem, t.ativo, t.ordem, t.estoque, t.vendas,
         public.preco_atual(t.id)             as preco_base,
         round(coalesce(public.preco_atual(t.id), t.preco_base), 2) as preco
  from public.tortas t
  where t.ativo;
grant select on public.cardapio to anon, authenticated;

-- ============================================================================
-- 4/4 · STORAGE E DADOS INICIAIS
-- ============================================================================

-- Bucket público de imagens
insert into storage.buckets (id, name, public)
values ('imagens', 'imagens', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "imagens_leitura_publica" on storage.objects;
create policy "imagens_leitura_publica" on storage.objects for select to anon, authenticated
  using (bucket_id = 'imagens');

drop policy if exists "imagens_insere_admin" on storage.objects;
create policy "imagens_insere_admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'imagens' and public.is_admin());

drop policy if exists "imagens_atualiza_admin" on storage.objects;
create policy "imagens_atualiza_admin" on storage.objects for update to authenticated
  using (bucket_id = 'imagens' and public.is_admin()) with check (bucket_id = 'imagens' and public.is_admin());

drop policy if exists "imagens_remove_admin" on storage.objects;
create policy "imagens_remove_admin" on storage.objects for delete to authenticated
  using (bucket_id = 'imagens' and public.is_admin());

-- Configurações do site
insert into public.configuracoes (chave, valor, descricao) values
  ('preco_base_torta', to_jsonb(14),           'Preço base de uma torta individual (Monte a sua)'),
  ('frete_valor',      to_jsonb(0),            'Frete padrão em reais (0 = combinar)'),
  ('whatsapp',         to_jsonb('5500000000000'::text), 'Número do WhatsApp com DDI'),
  ('email',            to_jsonb('contato@imperiopie.com.br'::text), 'E-mail de contato'),
  ('instagram',        to_jsonb('@imperiopie'::text), 'Perfil do Instagram'),
  ('endereco',         to_jsonb('[Endereço da cozinha]'::text), 'Endereço de retirada'),
  ('estoque_controlado', to_jsonb(false),      'true = só aceita pedidos com estoque'),
  ('aceita_pedido_online', to_jsonb(true),     'false = exibe o site como vitrine')
on conflict (chave) do nothing;

-- Cardápio
insert into public.tortas (nome, slug, descricao, imagem, preco_base, ordem)
values
  ('Clássica', 'classica',
   'Massa amanteigada, recheio de caramelo e cobertura de chocolate.',
   'public/classica.jpg', 14, 1),
  ('Charge', 'charge',
   'Base de brownie, recheio de caramelo e amendoim, cobertura de chocolate.',
   'public/charge.jpg', 18, 2),
  ('Caramelo', 'caramelo',
   'Base de brownie, recheio de caramelo, cobertura de chocolate.',
   'public/caramelo.jpg', 16, 3),
  ('Mousse de chocolate', 'mousse-de-chocolate',
   'Base de brownie, recheio de mousse de chocolate, cobertura de chocolate.',
   'public/mousse de chocolate.jpg', 17, 4),
  ('Maracujá', 'maracuja',
   'Base de brownie, recheio de brigadeiro de maracujá, cobertura de chocolate branco.',
   'public/maracuja.jpg', 16, 5)
on conflict (slug) do nothing;

-- Preços vigentes (sem UUID fixo: busca pelo slug)
insert into public.precos (torta_id, preco, vigencia_inicio)
select t.id, v.preco, current_date
from (values
  ('classica', 14::numeric),
  ('charge', 18::numeric),
  ('caramelo', 16::numeric),
  ('mousse-de-chocolate', 17::numeric),
  ('maracuja', 16::numeric)
) as v(slug, preco)
join public.tortas t on t.slug = v.slug
where not exists (
  select 1 from public.precos p where p.torta_id = t.id and p.ativo
);

-- Opções do configurador
insert into public.opcoes_torta (categoria, nome, descricao, preco_adicional, multiplicador, cor_hex, ordem) values
  ('base',      'Tradicional',            'Brownie tradicional',            0, 1, '#3A1F1A', 1),
  ('base',      'Meio amargo',            'Brownie com chocolate 70%',     2, 1, '#2a1410', 2),
  ('base',      'Com gotas de chocolate', 'Brownie com gotas de chocolate', 3, 1, '#4a2a1a', 3),
  ('base',      'Massa amanteigada',      'Base de massa manteigaada',     2, 1, '#d9a35f', 4),
  ('recheio',   'Caramelo',               'Caramelo cremoso',              3, 1, '#c98a3d', 1),
  ('recheio',   'Caramelo com amendoim',  'Caramelo com amendoim torrado', 4, 1, '#b3772f', 2),
  ('recheio',   'Mousse de chocolate',    'Mousse aerada de chocolate',    3, 1, '#6B3F2A', 3),
  ('recheio',   'Brigadeiro de maracujá', 'Brigadeiro de maracujá',        3, 1, '#F6C400', 4),
  ('cobertura', 'Chocolate',              'Cobertura de chocolate ao leite', 0, 1, '#3A1F1A', 1),
  ('cobertura', 'Chocolate branco',       'Cobertura de chocolate branco',  2, 1, '#F3E5C0', 2),
  ('cobertura', 'Cobertura crocante de amendoim', 'Crocante de amendoim',   2, 1, '#d9a35f', 3),
  ('tamanho',   'Individual',             'Uma torta',                      0, 1,   NULL, 1),
  ('tamanho',   'Caixa com 4',            'Quatro tortas',                  0, 3.6, NULL, 2),
  ('tamanho',   'Caixa com 8',            'Oito tortas',                    0, 6.8, NULL, 3)
on conflict (categoria, nome) do nothing;

-- Admin: promove a conta se ela já existir em auth.users.
-- Inserir o e-mail na tabela `admins` foi removido de propósito — a
-- allowlist concedia admin a quem quer que se cadastrasse com o e-mail.
-- A promoção abaixo é segura: ela só age sobre uma conta existente.
insert into public.perfis (id, nome, papel)
select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'nome', ''), split_part(u.email, '@', 1)), 'admin'
from auth.users u
where lower(u.email) = lower('es5@calabria.com.br')
on conflict (id) do update set papel = 'admin';

commit;
