-- ============================================================================
-- Império Pie — ajuste do acesso administrativo
-- Projeto: fivzbqdjpydcaymluqja
-- Uso: colar TODO este arquivo no SQL Editor do Supabase e executar.
-- Pode rodar mais de uma vez sem erro.
--
-- O QUE ESTE ARQUIVO FAZ
-- O admin passa a ser reconhecido pelo `papel` gravado na própria conta
-- (public.perfis.papel), e não mais por um e-mail solto na tabela `admins`.
-- Antes, qualquer pessoa que se cadastrasse na loja com o e-mail
-- `es5@calabria.com.br` recebia acesso administrativo completo, sem
-- precisar de qualquer autorização sua. Agora o acesso está preso ao id
-- da conta, que não pode ser inventado por outra pessoa.
--
-- PRÉ-REQUISITO
-- A conta precisa existir em auth.users (Authentication > Users no painel).
-- Se ainda não existir, este script PARA e avisa, sem alterar nada.
-- ============================================================================

begin;

-- ============================================================================
-- 1/4 · A conta de administrador existe?
-- ============================================================================
-- Falha de forma explícita, e não em silêncio: sem esta checagem, os passos
-- seguintes rodariam "com sucesso" sobre um e-mail inexistente e o painel
-- ficaria sem nenhum admin.

do $$
declare
  v_email text := 'es5@calabria.com.br';
  v_id    uuid;
begin
  select u.id into v_id
    from auth.users u
   where lower(u.email) = lower(v_email);

  if v_id is null then
    raise exception
      'AJUSTE CANCELADO: nao existe conta com o e-mail % em auth.users. Crie a conta em Authentication > Users e rode este arquivo de novo.', v_email;
  end if;

  raise notice 'Conta encontrada. id = %', v_id;
end $$;


-- ============================================================================
-- 2/4 · Promover a conta para admin
-- ============================================================================
-- O `insert` cobre o caso de o perfil não existir (o gatilho
-- handle_new_user cria a linha no cadastro, mas um usuário criado
-- manualmente no painel pode não ter passado por ele). O `on conflict`
-- atualiza o papel de quem já tinha perfil.

insert into public.perfis (id, nome, papel)
select u.id,
       coalesce(nullif(u.raw_user_meta_data ->> 'nome', ''),
                split_part(u.email, '@', 1)),
       'admin'
  from auth.users u
 where lower(u.email) = lower('es5@calabria.com.br')
on conflict (id) do update set papel = 'admin';


-- ============================================================================
-- 3/4 · Esvaziar a lista de e-mails
-- ============================================================================
-- A tabela `admins` continua existindo e vazia. A policy admin_le_admins
-- continua válida (ela só é avaliada por quem já é admin), e manter a
-- estrutura deixa o rollback a um `insert` de distância.

delete from public.admins;


-- ============================================================================
-- 4/4 · is_admin() passa a depender só do papel
-- ============================================================================
-- A função já aceitava as duas formas; aqui ela perde a segunda. Sem esta
-- parte o script ainda estaria seguro (a lista está vazia), mas qualquer
-- `insert` futuro em `admins` voltaria a abrir o acesso para quem se
-- cadastrasse com o e-mail — exatamente o problema que estamos fechando.
-- Melhor deixar o acesso inteiro apoiado em perfis.papel para não sobrar
-- a brecha.

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select papel = 'admin' from public.perfis where id = auth.uid()), false);
$$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

do $$
declare
  v_email  text := 'es5@calabria.com.br';
  v_papel  text;
  v_n_adm  bigint;
  v_n_lista bigint;
begin
  select p.papel into v_papel
    from public.perfis p
    join auth.users u on u.id = p.id
   where lower(u.email) = lower(v_email);

  select count(*) into v_n_adm from public.perfis where papel = 'admin';
  select count(*) into v_n_lista from public.admins;

  raise notice '----------------------------------------------------------';
  raise notice 'Administrador          : %', v_email;
  raise notice 'Papel em perfis        : %', coalesce(v_papel, 'NAO ENCONTRADO');
  raise notice 'Perfis com papel admin : %', v_n_adm;
  raise notice 'Linhas em admins       : % (esperado: 0)', v_n_lista;
  raise notice '----------------------------------------------------------';

  if v_papel is distinct from 'admin' then
    raise exception 'AJUSTE NAO CONCLUIDO: o perfil deste e-mail nao esta com papel = admin.';
  end if;

  if v_n_lista <> 0 then
    raise exception 'AJUSTE NAO CONCLUIDO: a tabela admins ainda tem % linha(s).', v_n_lista;
  end if;

  raise notice 'OK. Agora faca login com esta conta e confirme que o painel abre.';
  raise notice 'Observacao: e-mail nao confirmado impede o login mesmo com o papel correto.';
end $$;

commit;