# BRIEFING PARA O CLAUDE CODE — EnvasePro (Interlub)

Este arquivo é o contrato de trabalho desta sessão e de todas as seguintes. Leia tudo antes de agir.
No início de uma sessão nova: responda com (1) o que entendeu, (2) as perguntas em aberto da seção 7, (3) o plano da próxima fase pendente. Só então comece.

---

## -1. CONTEXTO ATUALIZADO — 07/10/2026 (prevalece sobre o resto do arquivo)

- **O EnvasePro ainda NÃO ENTROU EM USO.** A **Base44 continua sendo o sistema real**. Logo, o projeto `xifzjpbkpxislqrowswd` é hoje, na prática, **ambiente de testes**, e todo dado operacional nele é **descartável**. Isso **não** relaxa a regra 1: continua proibido escrever nele, e a Fase 5 continua exigindo confirmação escrita do usuário.
- **Não existe staging.** Há **um único** projeto Supabase (`xifzjpbkpxislqrowswd`). Todo trabalho é no **Supabase local**. A menção a "staging" no commit `6db4fce` foi **engano de uma IA anterior** — não confie nela.
- **Plano Supabase: gratuito → SEM backup automático.** Qualquer perda é definitiva.
- **A `main` faz deploy automático na Vercel.** Commit em produção: **NÃO INFORMADO** (perguntar de novo antes da Fase 1).
- **Service key: NÃO será rotacionada agora.** **Não tocar** na chave nem em variáveis da Vercel. A rotação é **pré-requisito do go-live** (seção 8).
- **Histórico:** será reimportado **no go-live**, a partir de um **export NOVO** da Base44. Até lá, `exports-base44/` é **intocável** (não alterar, não apagar).
- **`lauremank622@gmail.com`:** dono e permanência como admin **NÃO INFORMADOS** (perguntar antes da Fase 5).
- **Backup do `.env.local` original** (aponta para produção, contém a service key), fora do repositório, para o usuário apagar quando quiser:
  `C:\Users\KAUAN~1.PER\AppData\Local\Temp\claude\c--envase\8871e61e-8082-4633-ba51-8ec72d13207d\scratchpad\env.local.PRODUCAO.bak`

---

## 0. REGRAS INEGOCIÁVEIS

1. **Nunca toque em produção.** O projeto Supabase `xifzjpbkpxislqrowswd` é PRODUÇÃO e é o único banco real. Todo teste, migration e script roda no **Supabase local** (`supabase start`, requer Docker Desktop). Não use a `SUPABASE_SERVICE_ROLE_KEY` de produção em nenhum comando seu.
2. **Nunca edite uma migration já aplicada.** Correções entram como migration NOVA (versão posterior), idempotente (`CREATE OR REPLACE`, `DROP ... IF EXISTS`).
3. **Prove com saída real.** "Validado no código" ou `code.includes(...)` não é prova. Cada correção precisa de um comando ou teste reproduzível, com a saída colada no relatório. Para fluxos de operador, a prova é Playwright na interface real.
4. **Pare e pergunte antes de qualquer ação irreversível**: apagar dados, rodar migration em produção, rotacionar chave, `git push`, `git push --force`, reescrever histórico.
5. **Um commit pequeno por assunto**, com mensagem clara. Não faça push sem o usuário pedir.
6. **Não invente estado.** Se não consegue verificar, escreva "NÃO VERIFICADO". Se um relatório anterior (de qualquer IA) contradiz o código, o código vence.
7. **Segredos:** nunca imprima chaves ou senhas. Nunca grave senhas em arquivos versionados. As senhas antigas dos scripts (padrão `Interlub@...`) estão no histórico do git e devem ser consideradas comprometidas.

---

## 1. O PROJETO

**EnvasePro** é o sistema de operações da Interlub: envase, check-out (expedição), empilhadeira, limpeza, recebimento (com checklist de qualidade e notas fiscais digitais), cadastros, indicadores e telas de TV na fábrica. Nasceu na Base44 e foi migrado para GitHub + Vercel + Supabase.

- **Stack:** React 18 + Vite + Tailwind + shadcn/ui + TanStack Query + Recharts. Backend: Supabase (Postgres + RLS + Auth + Storage). Serverless: Vercel Functions em `api/` (`notificarOcorrencia.js`, `csp-report.js`, envio de e-mail via Resend).
- **Camada de dados:** `src/api/base44Client.js` é um adaptador que imita o SDK antigo da Base44 (`base44.entities.X.list/filter/create/update...`) por cima do Supabase. Faz paginação, converte strings vazias em NULL, injeta `operator_id`, resolve fotos por URL assinada.
- **Identidade em duas camadas:** (a) conta logada (`admin` ou `operator`), com poucas contas **compartilhadas** (`pcp-brasil` admin, `operacoes.equipe` operador, `tv-fabrica` TVs, e uma conta de dev); (b) "operador físico" escolhido num modal e guardado em `localStorage` (`envase_current_operator`). **O banco não sabe quem é a pessoa, só qual conta compartilhada está logada.** Por isso o RLS não consegue restringir "só o dono edita".
- **Permissões hoje:** RLS exige `authenticated`. Em quase todas as tabelas operacionais qualquer usuário logado faz INSERT/UPDATE (`USING (true)`); DELETE é só admin. Proteção de colunas críticas (assinatura de líder, resolver ocorrência, descarte de NF, autoria) é feita por **triggers** `BEFORE UPDATE`.
- **Fatos de domínio que você NÃO deve quebrar:**
  - `checklist_recebimentos.nota_final` é calculada por trigger e vai de **-90 a +90**. Não crie CHECK 0–100.
  - `envase_records.sala` usa o enum `sala_tipo` = `Bio | Industrial`. Já `operators.sala` usa `sala_operador` = `Bio | Industrial | Ambas`. "Ambas" só vale para operador.
  - `empilha_linhas` e `checkout_itens` têm CHECK exigindo `operador_empilhadeira_id` / `operator_id` preenchido quando `status <> 'Pendente'`.
  - `nota_fiscal_arquivos` tem retenção legal de 5 anos (`data_expiracao_legal`). Não apagar arquivos de NF reais.
  - Colunas de protocolo (`protocolo`, `numero_checklist`, `codigo_programacao`, `protocolo_arquivo`, `protocolo_recebimento`) e `created_at` devem ser imutáveis, inclusive para admin.
  - TVs (`/Televisao`, `/TelevisaoEmpilha`, `/Painel`) usam a conta `tv-fabrica` com sessão persistente e **não podem sofrer logout por inatividade**. Admin sofre logout após 60 min de inatividade.

---

## 2. ESTADO CONHECIDO (verificado no código e nos arquivos de backup)

**Feito no repositório (confirmado):**
- `handle_new_user` força `role='operator'`; `config.toml` com `enable_signup=false`, senha mínima 12 e complexidade.
- `protect_user_role_update` sem `SECURITY DEFINER`; `is_admin()` com `search_path` fixo.
- Funções genéricas `protect_admin_columns`, `protect_immutable_columns`, `protect_write_once_columns` e triggers em 11 tabelas.
- Adapter: `operator_id` injetado só no `create`; no `update` resolve id a partir do nome se só o nome vier.
- `EmpilhaLinhaCard.handleIniciar` e `CheckoutItemCard` gravam o `_id` do operador.
- Zod + react-hook-form em Envase, Operador e NovoChecklist; lock anti-corrida entre autosave e submit no `EnvaseForm`.
- CSP em modo Report-Only, X-Frame-Options, nosniff, HSTS, Referrer-Policy; `esbuild.drop` de console em produção; xlsx via CDN oficial SheetJS 0.20.3; logos de certificação em `public/certificacoes/`.
- Migrations pendentes (arquivos locais): `20261006150001_domain_check_constraints`, `20261006150002_storage_buckets_privacy_and_limits`, `20261006150003_notificar_ocorrencia_idempotency`.

**DESCONHECIDO / PROVAVELMENTE ERRADO (principal risco):**
- **O banco de produção provavelmente NÃO bate com o repositório.** `20261006000001` e `20261006000002` constam como aplicadas em produção, e depois os arquivos foram EDITADOS. O Supabase não reaplica versão registrada. O nome do trigger que a IA anterior disse ter aplicado (`trg_user_profiles_protect_role`) não existe em nenhum arquivo do repo (o arquivo usa `trg_protect_user_role_update`).
- Provavelmente produção ainda tem os triggers antigos da 0002 (operador bloqueado ao gravar `operator_id`/`operador`/`operador_empilhadeira_id`). Se for isso, **hoje falham para o operador:** selecionar operador num item de check-out e iniciar linha da empilhadeira. Os "34 testes" anteriores só exercitaram mudança de status.
- Se os commits recentes já estão na `main` (deploy automático na Vercel), a API nova usa `empilha_ocorrencias.notificado_em`, coluna que só existe depois da migration `…150003` (pendente) → e-mail de ocorrência falharia.
- `fotos-operadores` ainda está público em produção (migration de storage pendente). Existe também um bucket `arquivos` **público, sem limites**, que o código não referencia e cujo conteúdo é desconhecido.
- A chave de serviço de produção continua a mesma (não rotacionada) e está no `.env.local`.

**Dados:**
- O backup de 06/10 18:16 mostra produção quase sem dado real: 61 envases (export Base44: 5.884), 14 itens de check-out (7.874), 6 checklists (36). Quase tudo nas tabelas operacionais é lixo de testes automatizados (marcadores `QA`, `Teste`, `OP-QA-`, `PED-QA-`, `DOC-QA-`, `NF-QA-`, `FORN TESTE`, `temp-qa-*`). Dado real que existe: ~1.599 produtos, 52 embalagens, 14 operadores reais, 1 config de empilhadeira (a confirmar), 5 contas de auth.
- Um script `truncar-tabelas-operacionais.js` provavelmente já esvaziou as tabelas reais. O histórico só existe nos CSVs de `exports-base44/` (ignorado pelo git) e na Base44. **Esses CSVs são insubstituíveis: não os altere nem os apague.**
- O backup gerado (`backups/prod_backup_2026-10-06T18-16-35-191Z/`) é fraco: sem os ARQUIVOS do storage, `auth_users.json` sem senhas/hash, `backup_production_schema.sql` com 0 bytes, restauração nunca testada, e a pasta `backups/` **não está no `.gitignore`** (o `deploy_template.sh` faz `git add .`).

**Contas oficiais (4):** `pcp-brasil@interlub.com` (admin), `operacoes.equipe@interlub.com` (operador), `tv-fabrica@interlub.com` (TV), `lauremank622@gmail.com` (dev/admin, e-mail pessoal: pergunte ao usuário de quem é). Conta de teste a remover: `operacoes@interlub.com` (22 caracteres; NÃO confundir com `operacoes.equipe@...`, de 29).

---

## 2.1 ACHADOS DA FASE 0 (07/10/2026) — PROVADOS no banco local

**F0-1 — As migrations do repo, sozinhas, produzem um banco INUTILIZAVEL. (BLOQUEIA a Fase 3.)**
Nao existe **nenhum** `GRANT` em migration nenhuma do repo. As migrations rodam como `postgres`, e
o `pg_default_acl` do `postgres` para `public`/tabelas concede apenas `Dxtm`
(TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) a `anon`, `authenticated` e `service_role` — **sem
SELECT/INSERT/UPDATE/DELETE**. (O ACL do `supabase_admin` concede `arwdDxtm`, mas as migrations
nao rodam como ele.) Resultado medido apos `supabase db reset`: todo SELECT devolve
`42501 permission denied`, para operador logado e para `service_role`.
Producao funciona porque suas tabelas nasceram por outro caminho (Base44/painel). Isto e
divergencia repo x producao e precisa de `GRANT` explicito na migration de reconciliacao da
Fase 2 — decisao deliberada por role, nao heranca acidental de default ACL.

**F0-2 — O `config.toml` do repo DESABILITAVA o login por e-mail. (Risco para producao.)**
Nesta CLI, `[auth.email] enable_signup` controla o **provedor e-mail/senha inteiro**, nao apenas o
cadastro: com `false`, o GoTrue sobe com `GOTRUE_EXTERNAL_EMAIL_ENABLED=false` e **nenhuma conta
consegue logar** (`"Email logins are disabled"`). Quem barra o auto-cadastro e
`[auth] enable_signup = false` (`GOTRUE_DISABLE_SIGNUP=true`). O repo tinha os dois `false`.
Corrigido para `[auth.email] = true` + `[auth] = false`, e provado: as 3 contas logam e o
auto-cadastro e recusado com `Signups not allowed for this instance`.
**Se alguem rodasse `supabase config push` com a versao anterior, derrubaria o login em producao.**
`[auth.email] enabled` **nao** e chave valida nesta CLI (2.109.1) — a tentativa falha o parse.

**F0-3 — `test-concurrent-notifications.js` tinha a URL de PRODUCAO como fallback.**
`process.env.VITE_SUPABASE_URL || 'https://xifzjpbkpxislqrowswd.supabase.co'`: um teste cujo alvo
padrao era producao. Removido; agora o script aborta se a variavel nao estiver definida.

**F0-4 — O `db-guard` anterior era uma blocklist e quase nao era usado.**
Checava so `VITE_SUPABASE_URL` e o ref conhecido de producao (qualquer outro alvo remoto passava),
e aceitava o atalho `ALLOW_PRODUCTION=true` por variavel de ambiente. Era importado por 3 de 39
scripts. Agora e **allowlist** (so `localhost`/`127.0.0.1`), checa `VITE_SUPABASE_URL`,
`SUPABASE_URL`, `SUPABASE_DB_URL` e `SUPABASE_PROJECT_REF`, exige `--allow-production` **mais**
`--confirm-ref=<ref>`, e esta em **30 scripts**.

**F0-5 — `check-counts.js` nunca rodou.** Era CommonJS (`require`) num pacote
`"type": "module"`. Convertido para ESM.

**F0-6 — Portas locais.** A faixa 5432x estava ocupada por outro projeto Supabase local
(`..._meta`) na maquina. As portas deste projeto foram movidas para **5442x**
(API 54421, DB 54422, Studio 54423, Mailpit 54424).

**Desvio documentado:** a segunda confirmacao do guard e `--confirm-ref=<ref>` digitado na linha de
comando, nao um prompt interativo. Leitura sincrona de stdin e fragil no Windows, e tornar o guard
assincrono criaria um risco pior (um `await` esquecido viraria bypass silencioso).

---

## 3. PLANO (execute em ordem; cada fase termina com relatório e espera "ok" do usuário)

### FASE 0 — Ambiente seguro (sem tocar em produção)
- [ ] Confirme que o Docker Desktop está ativo; `supabase start`; aplique TODAS as migrations do repo no banco local e mostre `supabase migration list` local.
- [ ] Aponte o `.env.local` para o Supabase **local**. Remova dele a `SUPABASE_SERVICE_ROLE_KEY` de produção. A chave de produção fica só na Vercel.
- [ ] Crie `.env.example` sem valores (se já existir, revise).
- [ ] `.gitignore`: adicione `backups/`, `*.sql` de dados, `*.dump`, `.env*` (mantendo `.env.example`), `playwright-report/`, `test-results/`. Confirme que `git ls-files | grep -E "backups|\.env|exports"` não lista nada além de `.env.example`.
- [ ] Remova `deploy_template.sh` (resíduo da Base44: refere-se a `sdk/` e `e2b_template`, e faz `git add .`).
- [ ] **Guard obrigatório:** torne `scripts/lib/db-guard.js` chamado ANTES de criar o client em TODO script que escreve ou usa service_role (`truncar-tabelas-operacionais`, `migrar-dados`, `setup-auth-users`, `criar-operacoes-user`, `convidar-usuarios`, `backup-production`, todos os `test-*` e `audit-*`). Deve checar `VITE_SUPABASE_URL` **e** `SUPABASE_URL`, aceitar só `localhost/127.0.0.1`, e para produção exigir `--allow-production` mais digitação do ref. Prove com a saída de um script bloqueado.
- [ ] **0.7 — `supabase/seed.sql` SOMENTE para o banco local**, com contas de teste (admin, operador, TV) e operadores fictícios, para alimentar os testes Playwright da Fase 3. **Senhas lidas de variável de ambiente local; nunca commitar senha.** O seed roda só via `supabase db reset` local e jamais deve ser aplicável a um projeto remoto.
- **Aceite:** banco local de pé, nenhum script de escrita roda contra produção sem confirmação dupla, seed local reproduzível por `supabase db reset`.

### FASE 1 — Reconciliar repositório × produção (SOMENTE LEITURA, via usuário)
Você não tem (e não deve ter) acesso a produção. Peça ao usuário para rodar no **SQL Editor do Supabase (read-only)** e colar a saída:
```sql
select version, name from supabase_migrations.schema_migrations order by 1;
select p.proname, pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('is_admin','handle_new_user','protect_user_role_update','protect_admin_columns','protect_immutable_columns','protect_write_once_columns');
select c.relname as tabela, t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
 where not t.tgisinternal and t.tgname like 'trg_%' order by 1,2;
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets;
select policyname, tablename, cmd, qual, with_check from pg_policies where schemaname in ('public','storage') order by tablename, cmd;
select column_name from information_schema.columns where table_name='empilha_ocorrencias' and column_name='notificado_em';
-- Acrescentado na Fase 0 (achado F0-1): producao concede DML as roles do Supabase?
select grantee, table_name, string_agg(distinct privilege_type, ',' order by privilege_type) as privs
 from information_schema.table_privileges
 where table_schema='public' and grantee in ('anon','authenticated','service_role')
 group by grantee, table_name order by table_name, grantee;
-- E de onde vem o default: quem criou as tabelas (dono) e os default ACLs
select tablename, tableowner from pg_tables where schemaname='public' order by 1;
select pg_get_userbyid(defaclrole) as concedente, defaclnamespace::regnamespace as schema,
       defaclobjtype as tipo, defaclacl from pg_default_acl order by 1,2;
```

**No painel do Supabase (Authentication → Providers), confirmar (achado F0-2):**
o provedor **Email** esta **habilitado** (senao ninguem loga) e **"Allow new users to sign up"**
esta **desligado**. Sao dois controles distintos; o `config.toml` do repo os confundia.
- Compare função por função e trigger por trigger com o repo; liste TODAS as diferenças.
- Pergunte ao usuário qual commit a Vercel serve em produção e se a `main` faz deploy automático.
- Liste os fluxos que **hoje** falham em produção para o operador, com evidência.
- **Aceite:** tabela "repo × produção" completa. Nenhuma alteração feita.

### FASE 2 — Migration de reconciliação (nova, idempotente)
- Restaure `20261006000001` e `20261006000002` ao conteúdo originalmente aplicado (veja `git log -p -- supabase/migrations/...` e a saída da Fase 1) para eles refletirem a história real. Não faça isso às cegas: se não for possível provar o conteúdo aplicado, deixe como está e documente.
- Crie **uma migration nova** `2026100700000X_reconcile_security.sql` que leve QUALQUER estado ao desejado (idempotente):
  - `is_admin`, `handle_new_user` (role fixo `operator`), `protect_user_role_update` (invoker, sem `current_user='postgres'`) e seu trigger, todos com `SET search_path = public, pg_temp`.
  - `protect_admin_columns`, `protect_immutable_columns`, `protect_write_once_columns` e todos os triggers por tabela (derrube triggers antigos pelo nome real que a Fase 1 mostrou).
  - **Buraco a fechar:** em `status_assinatura`, hoje o operador só é barrado ao ir PARA `Completo`; ele ainda pode REVERTER um registro já `Completo`. Bloqueie qualquer mudança de `status_assinatura` e das colunas de assinatura quando `OLD.status_assinatura = 'Completo'`, salvo admin/service_role.
  - Escrita única (operador comum só preenche se `OLD` for NULL/vazio): `operator_id`, `operador` (envase_records e checkout_itens), `operador_empilhadeira`, `operador_empilhadeira_id` (empilha_linhas).
  - Admin-only: assinatura de líder (empilha_linhas, limpeza_programacoes, recebimentos), `resolvido/resolucao/registrado_por*` (ocorrências), `descartado*`/`arquivo_url` (nota_fiscal_arquivos), `criado_por_*` (checklist).
  - Imutáveis para todos (exceto service_role): colunas de protocolo e `created_at`.
  - Incorpore (ou mantenha como migrations próprias, em ordem): CHECKs de domínio (`NOT VALID` + `VALIDATE`), buckets (`fotos-operadores` privado, limites de tamanho e MIME nos 2 buckets), `notificado_em`.
- Teste no Supabase local, com JWT real de operador (bloqueia) e de admin (permite), para cada trigger.
- **Aceite:** `supabase db reset` local aplica tudo do zero sem erro; suíte de triggers passa; **e** a suíte E2E da Fase 3 passa.

### FASE 3 — Código e testes de interface real (Playwright, banco local)
Corrija o que o teste revelar e prove cada fluxo com a UI de verdade, logando como `operacoes.equipe` (operador) e `pcp-brasil` (admin) no banco local:
- [ ] Iniciar linha da empilhadeira (grava `operador_empilhadeira` e `_id`; passa pelo CHECK).
- [ ] Concluir e assinar como operador/ajudante; assinar como líder (admin). Operador NÃO consegue assinar como líder nem reverter uma linha `Completo`.
- [ ] Check-out: selecionar operador num item `Pendente`, iniciar, concluir; segundo operador NÃO consegue trocar o operador já gravado.
- [ ] Envase: criar com autosave, finalizar (sem duplicar registro), editar como outro operador (autoria preservada), submit rápido duplo.
- [ ] Recebimento: assinatura de coordenador (operador) e de líder (admin); resolver ocorrência só admin.
- [ ] Limpeza: assinatura de responsável e de líder.
- [ ] Nota fiscal: upload, URL assinada, descarte só admin.
- [ ] TV: abre autenticada com `tv-fabrica`, atualiza sem logout; fotos de operador carregam por URL assinada (bucket privado).
- [ ] Admin: logout por inatividade de 60 min (use relógio simulado), TV imune.
- Adapter: `update()` não injeta autoria do `localStorage`; só resolve `operator_id` quando vier o nome. Cuidado: resolução por nome é frágil com homônimos; prefira enviar o `id` direto do select.
- `AuthContext.jsx`: remova o fallback que lê `user_metadata.role` (editável pelo próprio usuário). O papel deve vir só de `user_profiles`.
- **Aceite:** relatório Playwright com todos os fluxos verdes e capturas de tela.

### FASE 4 — Segurança restante
- [ ] `api/notificarOcorrencia.js`: confirme Bearer + `getUser`, reserva atômica de `notificado_em` (`UPDATE ... WHERE notificado_em IS NULL RETURNING`) e rollback se o envio falhar. Teste com duas chamadas simultâneas contra o banco local.
- [ ] Rate limit: o `Map` em memória não funciona em serverless. Proponha e implemente algo persistente (Upstash Redis ou Vercel Firewall) **depois de perguntar** ao usuário qual prefere e se aceita custo/conta nova.
- [ ] `api/csp-report.js`: limite de tamanho do corpo, tratar `Content-Type: application/csp-report`, truncar campos logados.
- [ ] CSP: acompanhe os relatórios em Report-Only, ajuste, e só depois passe para modo bloqueante. `frame-ancestors` é ignorado em Report-Only (o `X-Frame-Options` cobre).
- [ ] Storage: `UploadFile({ bucket })` aceita bucket vindo do chamador; limite a uma lista permitida. Investigue o bucket `arquivos` (público, sem limite, sem uso no código) e proponha remover/privatizar após backup.
- [ ] `config.toml`: confirme `[auth.rate_limit]`, captcha (Turnstile) e MFA TOTP para admin. Lembre o usuário que o `config.toml` do repo não aplica nada sozinho no projeto remoto; ele precisa conferir no painel.
- [ ] Remova código morto de "TV pública" (`ehRotaTv`, `ehRotaTvPublica`, `isPublicTv`): o `anon` não tem mais acesso e a TV precisa de login.
- [ ] `Layout.jsx`: troque os `list()` de 7 tabelas a cada 60s por contagens `select('*', { count: 'exact', head: true })` com filtros, ou uma RPC única de contadores (admin).
- [ ] Validação: schema Zod do `EnvaseForm` com `sala` só `Bio | Industrial`; validação nos demais formulários críticos; botões desabilitados durante envio em todas as mutations.
- [ ] `npm audit --omit=dev` antes e depois; mantenha `tailwindcss*`, `postcss`, `autoprefixer` em `devDependencies`.
- [ ] Documentos desatualizados: `src/AUDITORIA.md` e `README.md` ainda descrevem a Base44; atualize ao final.

### FASE 5 — Limpeza dos dados de teste (**só com autorização escrita do usuário em cada passo**)

Simplificada em 07/10/2026: como o EnvasePro **não entrou em uso**, não há dado operacional real em `xifzjpbkpxislqrowswd` e não é preciso separar real de teste. O que precisa sobreviver é **o catálogo**. Ordem obrigatória:

1. **Dump verificado do catálogo**, fora do repositório: `products`, `embalagens`, os 14 operadores reais, `empilhadeira_configs` e outras configs, `user_profiles`, `auth.users` com identities, e os **arquivos** dos buckets (`fotos-operadores`, `notas-fiscais`, `arquivos`: baixar de fato). **Restaurar num banco LOCAL e provar que as contagens por tabela batem.** Sem restauração testada, não é backup — e o plano Supabase é gratuito, sem backup automático: não há rede de segurança.
2. **Esvaziar as tabelas operacionais**, mantendo o catálogo. Respeite a ordem das chaves estrangeiras (`operators` é referenciado com `ON DELETE RESTRICT`: apague quem os usa antes). Inclua `checkout_programacoes`, `empilha_programacoes`, `limpeza_programacoes`, `recebimento_ocorrencias`, `envase_records`, `checkout_itens`, `empilha_linhas`, `checklist_recebimentos` e os arquivos do storage. Arquivos via **API de Storage**, nunca por SQL.
3. **Dry-run em transação com `ROLLBACK`**, mostrando as contagens antes/depois de cada tabela. `COMMIT` só após confirmação **por escrito** do usuário.
4. `empilhadeira_configs` ("Empilhadeira Elétrica 01", 29/09) **não** entra na limpeza sem confirmação explícita.
5. Remover o usuário `operacoes@interlub.com` de `auth.users` e `user_profiles` só depois de comparar o e-mail **caractere a caractere** com os 4 oficiais, mostrando o UID. (`operacoes@interlub.com` tem 22 caracteres; `operacoes.equipe@interlub.com` tem 29. Não confundir.)
6. **Reimportação do histórico não acontece nesta fase** — ela faz parte do go-live (seção 8), a partir de um export NOVO da Base44.
7. Produção não dá acesso à máquina do Claude: **o usuário executa os comandos de dump** ou fornece o dump.


### FASE 6 — Preparar a versão 2.0 (NÃO começar antes das fases 0–5 aprovadas)
Apenas propor, com estimativa:
1. **Identidade:** uma conta por operador (login simples/PIN) para que `auth.uid()` identifique a pessoa e o RLS vire "só o dono edita".
2. **Indicadores no banco** (views/RPC) em vez de baixar tabelas inteiras para o navegador.
3. **Performance:** polling, índices, paginação.
4. **UX/UI:** diagnóstico com as capturas em `scratch/`; design system; telas de TV; mobile.
5. **Ambientes:** projeto Supabase de staging + Vercel Preview apontando para ele; branch protection e secret scanning no GitHub.

---

## 4. AÇÕES QUE SÓ O USUÁRIO PODE FAZER (lembre-o quando chegar a hora)
- Abrir o Docker Desktop.
- **Rotacionar a `SUPABASE_SERVICE_ROLE_KEY`** (e a anon key, se achar necessário) no painel do Supabase e atualizar a Vercel. Pendente.
- Trocar as senhas das contas reais (`pcp-brasil`, `operacoes.equipe`, `tv-fabrica`, dev) e as de teste que apareceram no histórico do git.
- No painel do Supabase: confirmar que "Allow new users to sign up" está desligado, política de senha de 12+ com complexidade, captcha/MFA; ver se o plano tem backups automáticos.
- GitHub: confirmar repositório **privado**, ligar branch protection na `main` e secret scanning/push protection.
- Fazer cópia segura de `exports-base44/` fora do projeto.
- Decidir: limpeza do banco, reimportação do histórico, criação de projeto de staging (pode ter custo).

## 5. COMO REPORTAR
Para cada tarefa: **o que mudou (arquivos/commit) → como provou (comando) → saída real → riscos que restam.** Marque explicitamente: `PROVADO`, `NÃO VERIFICADO` ou `BLOQUEADO (precisa do usuário)`. Termine cada fase com uma tabela de status e pare.

## 6. ARMADILHAS JÁ ENCONTRADAS
- IAs anteriores afirmaram "resolvido" sem prova e erraram fatos (contagem de registros, política de senha, ambiente).
- Testes anteriores chamavam a API direto e não a interface; não detectaram regressões dos triggers.
- Migrations editadas depois de aplicadas (ver seção 2).
- Sugestão antiga e errada: `CHECK (nota_final BETWEEN 0 AND 100)` quebra o checklist.
- Sugestão antiga e errada: restringir UPDATE por `inspecionado_por = auth.uid()` (campo é lista de nomes; as contas são compartilhadas).
- `createSignedUrls` de fotos: URLs duram 24h; telas de TV refazem a consulta a cada 2 min, mas confirme que nenhuma tela grava a URL assinada de volta no banco como `foto_url` (guarde o caminho).
- Resolução de operador por nome falha com homônimos (existiam 13 operadores de teste com o mesmo nome).

## 7. PERGUNTE AO USUÁRIO ANTES DE COMEÇAR
1. Alguém usou o sistema de verdade depois de 06/10 17:12 (envase, check-out, empilhadeira)?
2. O histórico (5.884 envases, 7.874 itens de check-out, 36 checklists) será reimportado? Quando?
3. De quem é `lauremank622@gmail.com` e ele deve continuar admin?
4. A `main` faz deploy automático na Vercel? Qual commit está em produção?
5. Qual o plano do Supabase (backups automáticos)? Aceita criar um projeto de staging?
6. A chave de serviço já foi rotacionada?

---

## 8. PLANO DE VIRADA (GO-LIVE) — Base44 → EnvasePro

Só executar depois das fases 0–4 aprovadas e da Fase 5 concluída. Até o go-live a **Base44 é o sistema real**; o EnvasePro é ambiente de testes. Cada passo precisa de autorização do usuário.

**Pré-requisitos (bloqueiam a virada):**
- [ ] Fases 0–4 aprovadas; suíte Playwright da Fase 3 verde contra o banco local.
- [ ] Migration de reconciliação (Fase 2) aplicada em produção e **conferida** com as mesmas consultas de leitura da Fase 1.
- [ ] `fotos-operadores` privado; bucket `arquivos` resolvido (removido ou privatizado, após backup).
- [ ] Senhas das 4 contas oficiais trocadas (as do histórico do git estão comprometidas).
- [ ] Decidido o que fazer com `lauremank622@gmail.com`.

**Sequência da virada (janela de parada combinada com a operação):**
1. **Congelar a Base44.** Avisar a fábrica, definir a hora do corte e deixar a Base44 **somente leitura** a partir dali. Nada de operação em dois sistemas ao mesmo tempo — dado lançado na Base44 após o export se perde.
2. **Export NOVO da Base44**, completo, depois do congelamento. Guardar fora do repositório; `exports-base44/` antigo permanece intocado como referência. Registrar as contagens de origem por entidade.
3. **Ensaio no banco local primeiro:** rodar `migrar-dados.js` (com o guard) contra o Supabase local usando o export novo. Validar contagens linha a linha (origem × destino), amostras de campos calculados (`nota_final` dentro de −90..+90), enums (`sala`), FKs de `operators`, e os CHECKs de `empilha_linhas`/`checkout_itens`. Só depois de bater 100% no local a importação toca produção.
4. **Rotação de chaves** (só o usuário): `SUPABASE_SERVICE_ROLE_KEY` e, se quiser, a anon key, no painel do Supabase; atualizar a Vercel; `.env.local` permanece apontando para o **local**, sem chave de produção. Confirmar que a aplicação na Vercel volta a subir depois da rotação.
5. **Importação em produção**, com o usuário executando, em transação quando possível, e relatório de contagens antes/depois. Erro de validação ⇒ `ROLLBACK` e a Base44 continua sendo o sistema real.
6. **Smoke test na UI de produção**, com conta real, nos fluxos da Fase 3 (empilhadeira, check-out, envase, recebimento, limpeza, NF) — interface, não API.
7. **Troca das TVs:** apontar `/Televisao`, `/TelevisaoEmpilha` e `/Painel` para o EnvasePro, com a conta `tv-fabrica` logada e sessão persistente. Confirmar **in loco** que a tela não cai por inatividade e que as fotos carregam por URL assinada do bucket privado.
8. **Plano de retorno (rollback):** critério escrito de quando desistir, e como voltar a operar na Base44 (que fica congelada mas intacta por pelo menos 30 dias após a virada). Não remover a Base44 no mesmo dia.
9. **Pós-virada:** acompanhar os relatórios de CSP, erros da Vercel e as contagens diárias nos primeiros dias; só então passar a CSP para modo bloqueante, se ainda não estiver.

