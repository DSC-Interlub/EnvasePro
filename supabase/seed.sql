-- ============================================================================
-- supabase/seed.sql  —  SEED DO BANCO **LOCAL** APENAS
-- ============================================================================
-- Criado em 07/10/2026 (CLAUDE.md Fase 0, item 0.7).
--
-- Alimenta os testes Playwright da Fase 3 com dados minimos e DETERMINISTICOS.
-- Rodado automaticamente por `npx supabase db reset`.
--
-- REGRAS:
--  * NAO contem nenhuma senha nem credencial. As contas de teste sao criadas
--    por `scripts/seed-local-auth.js`, que le as senhas de variavel de
--    ambiente. Nunca adicione senha a este arquivo: ele e versionado.
--  * Todo registro ficticio tem o prefixo 'SEED-' no codigo/nome, para ser
--    distinguivel a olho nu e removivel por um unico criterio.
--  * Idempotente: pode rodar varias vezes sem duplicar (INSERT ... WHERE NOT EXISTS).
--  * NUNCA rode isto contra um projeto remoto. `supabase db reset --linked`
--    aplicaria este seed em PRODUCAO. O bloco abaixo e a ultima linha de defesa.
-- ============================================================================

-- --- Trava de seguranca: aborta se o banco nao parecer um local recem-criado ---
do $$
declare
  n_products bigint;
  n_envases  bigint;
begin
  select count(*) into n_products from public.products;
  select count(*) into n_envases  from public.envase_records;

  if n_products > 500 or n_envases > 100 then
    raise exception
      'SEED ABORTADO: este banco tem % produtos e % envases — nao parece um banco local recem-criado. Se isto e producao, NADA foi alterado.',
      n_products, n_envases;
  end if;
end $$;

-- --- Operadores ficticios -----------------------------------------------------
-- Nomes distintos de proposito: a resolucao de operador por nome no adapter
-- falha com homonimos (ver CLAUDE.md secao 6). Nenhum nome se repete aqui.
insert into public.operators (nome, matricula, sala, ativo)
select v.nome, v.matricula, v.sala::sala_operador, v.ativo
from (values
  ('SEED-Ana Operadora',      'SEED-001', 'Bio',        true),
  ('SEED-Bruno Empilhador',   'SEED-002', 'Industrial', true),
  ('SEED-Carla Ajudante',     'SEED-003', 'Industrial', true),
  ('SEED-Diego Conferente',   'SEED-004', 'Ambas',      true),
  ('SEED-Elisa Lider',        'SEED-005', 'Ambas',      true),
  ('SEED-Fabio Inativo',      'SEED-006', 'Bio',        false)
) as v(nome, matricula, sala, ativo)
where not exists (select 1 from public.operators o where o.nome = v.nome);

-- --- Produtos -----------------------------------------------------------------
insert into public.products (codigo, nome, consistencia)
select v.codigo, v.nome, v.consistencia
from (values
  ('SEED-PRD-001', 'SEED Graxa Teste Bio',        'NLGI 2'),
  ('SEED-PRD-002', 'SEED Oleo Teste Industrial',  'ISO VG 68'),
  ('SEED-PRD-003', 'SEED Pasta Teste',            'NLGI 1')
) as v(codigo, nome, consistencia)
where not exists (select 1 from public.products p where p.codigo = v.codigo);

-- --- Embalagens ---------------------------------------------------------------
insert into public.embalagens (codigo, descricao, conteudo, ultimos_4_digitos)
select v.codigo, v.descricao, v.conteudo, v.ult
from (values
  ('SEED-EMB-0001', 'SEED Balde 20kg',  20.000, '0001'),
  ('SEED-EMB-0002', 'SEED Tambor 180kg', 180.000, '0002'),
  ('SEED-EMB-0003', 'SEED Cartucho 400g', 0.400, '0003')
) as v(codigo, descricao, conteudo, ult)
where not exists (select 1 from public.embalagens e where e.codigo = v.codigo);

-- --- Locais de limpeza --------------------------------------------------------
insert into public.limpeza_locais (nome)
select v.nome
from (values ('SEED-Sala Bio'), ('SEED-Galpao Industrial'), ('SEED-Corredor Central')) as v(nome)
where not exists (select 1 from public.limpeza_locais l where l.nome = v.nome);

-- --- Fornecedores de recebimento ---------------------------------------------
insert into public.recebimento_fornecedores (nome)
select v.nome
from (values ('SEED-Fornecedor Nacional'), ('SEED-Fornecedor Internacional')) as v(nome)
where not exists (select 1 from public.recebimento_fornecedores f where f.nome = v.nome);

-- --- Configuracao de empilhadeira --------------------------------------------
insert into public.empilhadeira_configs (nome, intervalo_manutencao_dias)
select v.nome, v.dias
from (values ('SEED-Empilhadeira Teste 01', 90)) as v(nome, dias)
where not exists (select 1 from public.empilhadeira_configs c where c.nome = v.nome);

-- --- Resumo -------------------------------------------------------------------
do $$
begin
  raise notice 'SEED LOCAL aplicado: % operadores, % produtos, % embalagens, % locais, % fornecedores, % configs (prefixo SEED-)',
    (select count(*) from public.operators                where nome like 'SEED-%'),
    (select count(*) from public.products                 where codigo like 'SEED-%'),
    (select count(*) from public.embalagens               where codigo like 'SEED-%'),
    (select count(*) from public.limpeza_locais           where nome like 'SEED-%'),
    (select count(*) from public.recebimento_fornecedores where nome like 'SEED-%'),
    (select count(*) from public.empilhadeira_configs     where nome like 'SEED-%');
  raise notice 'Contas de teste NAO sao criadas aqui. Rode: npm run seed:local-auth';
end $$;
