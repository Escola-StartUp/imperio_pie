-- Diagnóstico: rode no SQL Editor de https://supabase.com/dashboard/project/fivzbqdjpydcaymluqja
-- (a migration 0001_init.sql já foi aplicada; estes são só checagens)

-- 1) A função existe exatamente com o nome que o front chama?
select n.nspname as schema, p.proname, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('calcular_preco_customizado','registrar_compra','preco_atual','preco_com_promo','aplicar_promo','is_admin','papel_atual')
order by p.proname;

-- 2) O anon tem permissão de executar? (sem isso o PostgREST devolve 401/400)
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('calcular_preco_customizado','preco_com_promo','preco_atual','aplicar_promo')
  and grantee in ('anon','authenticated','PUBLIC')
order by routine_name, grantee;

-- 3) O PostgREST enxerga a função? (se aparecer só a partir daqui, o cache precisa recarregar)
--    force reload do schema do PostgREST (resolve o 400 "Could not find the function"):
notify pgrst, 'reload schema';

-- 4) Teste direto da função pelo proprio Postgres (sem passar pela API):
select public.calcular_preco_customizado(
  (select id from public.opcoes_torta where categoria='base'      and ativo order by ordem limit 1),
  (select id from public.opcoes_torta where categoria='recheio'   and ativo order by ordem limit 1),
  (select id from public.opcoes_torta where categoria='cobertura' and ativo order by ordem limit 1),
  (select id from public.opcoes_torta where categoria='tamanho'   and ativo order by ordem limit 1)
) as preco_esperado;

-- 5) Cardapio e opcoes com preco (o que a loja mostra)
select * from public.cardapio order by ordem;
select categoria, count(*) as opcoes from public.opcoes_torta where ativo group by categoria;

-- 6) Quem existe no Auth e se o perfil e admin (para o login da area admin)
select u.id, u.email, u.email_confirmed_at, p.papel,
       (select count(*) from public.admins a where a.email = u.email) as na_lista_admin
from auth.users u
left join public.perfis p on p.id = u.id
order by u.created_at desc;
