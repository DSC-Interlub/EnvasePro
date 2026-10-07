-- ============================================================================
-- MIGRATION: 20261006150001_domain_check_constraints.sql
-- DESCRIÇÃO:
--   Restrições CHECK de integridade numérica nos módulos operacionais.
--
--   NÃO inclui restrição em checklist_recebimentos.nota_final: a nota é
--   calculada por trigger e vai de -90 a +90. Um CHECK 0..100 quebra o
--   checklist (ver CLAUDE.md seção 6).
--
-- REESCRITA EM 07/10/2026 (Fase 2): a versão anterior usava
--   ALTER TABLE ... ADD CONSTRAINT ... NOT VALID
--   sem guarda. Postgres não aceita IF NOT EXISTS em ADD CONSTRAINT, então a
--   migration falhava na segunda execução, violando a regra 2 do CLAUDE.md
--   (toda migration tem de ser idempotente). Agora cada restrição passa por um
--   bloco que a ignora caso já exista.
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- tabela,                  constraint,                              expressao
      ('envase_records',          'chk_envase_records_qtd_produzida',      'quantidade_produzida IS NULL OR quantidade_produzida >= 0'),
      ('envase_records',          'chk_envase_records_qtd_embalagens',     'quantidade_embalagens IS NULL OR quantidade_embalagens >= 0'),
      ('envase_records',          'chk_envase_records_multiplo',           'multiplo IS NULL OR multiplo >= 0'),
      ('checklist_recebimentos',  'chk_checklist_qtd_recebida',            'quantidade_recebida IS NULL OR quantidade_recebida >= 0'),
      ('empilha_linhas',          'chk_empilha_linhas_quantidade',         'quantidade IS NULL OR quantidade >= 0'),
      ('recebimento_itens',       'chk_recebimento_itens_qtd_prevista',    'quantidade_prevista IS NULL OR quantidade_prevista >= 0'),
      ('recebimento_itens',       'chk_recebimento_itens_qtd_recebida',    'quantidade_recebida IS NULL OR quantidade_recebida >= 0'),
      ('recebimentos',            'chk_recebimentos_tempo_produtivo',      'tempo_produtivo_minutos IS NULL OR tempo_produtivo_minutos >= 0'),
      ('recebimentos',            'chk_recebimentos_tempo_pausado',        'tempo_pausado_minutos IS NULL OR tempo_pausado_minutos >= 0'),
      ('checkout_programacoes',   'chk_checkout_prog_total_pedidos',       'total_pedidos IS NULL OR total_pedidos >= 0'),
      ('checkout_programacoes',   'chk_checkout_prog_pedidos_concluidos',  'pedidos_concluidos IS NULL OR pedidos_concluidos >= 0')
    ) as v(tabela, nome, expressao)
  loop
    if not exists (
      select 1 from pg_constraint c
       where c.conname = r.nome
         and c.conrelid = format('public.%I', r.tabela)::regclass
    ) then
      -- NOT VALID primeiro para não travar a tabela durante a verificação,
      -- VALIDATE depois para que a restrição valha também para o que já existe.
      execute format('alter table public.%I add constraint %I check (%s) not valid',
                     r.tabela, r.nome, r.expressao);
      execute format('alter table public.%I validate constraint %I', r.tabela, r.nome);
      raise notice 'CHECK criada: %.%', r.tabela, r.nome;
    else
      raise notice 'CHECK ja existia, ignorada: %.%', r.tabela, r.nome;
    end if;
  end loop;
end $$;
