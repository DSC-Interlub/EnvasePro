-- ============================================================================
-- MIGRATION: 20261006150002_storage_buckets_privacy_and_limits.sql
-- ============================================================================
-- Fecha os buckets de storage: privacidade, limite de tamanho e MIME.
--
-- >>> NAO APLICAR SOZINHA. <<<
-- Esta migration SO pode ser aplicada JUNTO com o deploy do codigo novo.
-- Motivo, medido em 07/10/2026: 13 operadores tem `operators.foto_url` gravado
-- como URL **publica** do bucket, e a funcao `resolverFotosOperadores()`, que
-- troca o caminho por URL assinada na leitura, tem 0 ocorrencias em origin/main
-- (o codigo que esta em producao). Tornar o bucket privado antes do deploy
-- quebra as 13 fotos na hora: telas de TV, modal de selecao de operador e
-- painel.
-- As politicas de storage necessarias ja existem (`fotos_authenticated_read`
-- permite SELECT a `authenticated`), portanto depois do deploy as 13 voltam a
-- funcionar por URL assinada.
--
-- Idempotente: sao UPDATEs com WHERE.
-- ============================================================================

-- 1. fotos-operadores: privado, 10 MB, so imagem.
UPDATE storage.buckets
   SET public = false,
       file_size_limit = 10485760,                                  -- 10 MB
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
 WHERE id = 'fotos-operadores';

-- 2. notas-fiscais: ja era privado; faltavam os limites. 20 MB, PDF e imagem.
--    Retencao legal de 5 anos: NUNCA apagar arquivo de NF real.
UPDATE storage.buckets
   SET public = false,
       file_size_limit = 20971520,                                  -- 20 MB
       allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']
 WHERE id = 'notas-fiscais';

-- 3. arquivos: estava PUBLICO, sem limite de tamanho e sem restricao de MIME,
--    e o codigo nao o referencia em lugar nenhum. Verificado em producao em
--    07/10/2026: **0 objetos**. Como esta vazio, privatizar e reversivel e nao
--    perde nada — preferido a DROP, que seria irreversivel.
--    Nao existe politica de RLS para este bucket, logo depois daqui ele fica
--    inacessivel por completo, que e o desejado para um bucket sem uso.
UPDATE storage.buckets
   SET public = false,
       file_size_limit = 10485760,
       allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']
 WHERE id = 'arquivos';

-- ============================================================================
-- RESUMO
-- ============================================================================
DO $$
DECLARE
  r record;
BEGIN
  RAISE NOTICE 'storage_buckets_privacy_and_limits aplicada.';
  FOR r IN SELECT id, public, file_size_limit FROM storage.buckets ORDER BY id LOOP
    RAISE NOTICE '  bucket % -> publico=% limite=%', r.id, r.public, r.file_size_limit;
  END LOOP;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE public IS TRUE) THEN
    RAISE WARNING 'Ainda existe bucket PUBLICO.';
  END IF;
END $$;
