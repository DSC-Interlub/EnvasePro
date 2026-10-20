# Gestão de usuários pelo sistema (20/10/2026)

Configurações → aba **Usuários**. Só administrador.

## O que dá para fazer

| Ação | O que acontece |
|---|---|
| **Novo usuário** | nome, e-mail, papel (Administrador ou Operador) e, para operador, o rótulo "Uso em TV". A conta nasce com o e-mail confirmado e uma **senha temporária de 20 caracteres**, mostrada **uma única vez** com botão de copiar. |
| **Editar** | nome, papel e o rótulo de TV. |
| **Resetar senha** | gera outra senha temporária (mostrada uma vez), **desloga a pessoa em até 20 s em todos os aparelhos** e obriga a trocar no próximo acesso. |
| **Desativar / Reativar** | desativada, a conta não entra (mensagem "Esta conta está desativada") e é **deslogada em até 20 s**. Reativada, entra com a senha que já tinha. |
| **Encerrar sessões** | desloga a pessoa em até 20 s, em todos os aparelhos, sem mudar a senha. |
| **Excluir** | só depois de digitar o e-mail da conta; deslogada em até 20 s. Não tem volta. |
| **Histórico de alterações** | quem fez o quê, em qual conta e quando (as 100 mais recentes). Nunca guarda senha. |
| **Alterar minha senha** | no rodapé do menu, para qualquer conta. Ao trocar, as **outras** sessões da conta (outras abas e aparelhos) caem; quem trocou continua logado. |

**Senha existente não se vê**: o sistema guarda só um código que não se
desfaz (hash). Quem esqueceu a senha precisa de um **Resetar senha**.

**Primeiro acesso:** com senha temporária, a conta só vê a tela "Crie a sua
senha" até escolher a própria. Política: 12+ caracteres, com minúscula,
maiúscula, número e símbolo (a mesma do Auth).

**TV:** a conta da TV é uma conta de **Operador**; o rótulo "Uso em TV" é só para
organizar a lista. A TV também troca a senha no primeiro acesso — faça isso no
próprio equipamento, uma vez.

## Proteções (todas no servidor, não só na tela)

- só **admin ativo** usa a gestão; operador, TV e quem não está logado recebem
  recusa, e a recusa fica no histórico;
- ninguém exclui, desativa, reseta ou rebaixa **a si mesmo**;
- o **último administrador** não pode ser excluído, desativado nem rebaixado —
  e, no banco, um gatilho garante isso mesmo se dois admins se excluírem ao
  mesmo tempo;
- **limite de tentativas**: 30 alterações por administrador a cada 10 minutos;
  5 tentativas de trocar a própria senha a cada 10 minutos;
- o histórico é **imutável**: nem a chave de serviço altera ou apaga um registro.

## Como funciona por dentro

- `api/admin-usuarios.js` — função serverless da Vercel. Confere o JWT de quem
  chamou no Auth, lê o papel no banco, valida as entradas (lista fechada de
  ações, tamanhos, e-mail, papel) e só então usa a `service_role`, **que existe
  apenas no servidor**. Respostas com `Cache-Control: no-store`; senha nunca vai
  para log nem para o histórico.
- `supabase/migrations/20261020000001_gestao_usuarios.sql` — tabela
  `auditoria_usuarios` (imutável), função `encerrar_sessoes` (só a
  `service_role` executa) e a trava do último admin. Rollback em
  `supabase/rollbacks/20261020000001.rollback.sql`.
- "Trocar senha no primeiro acesso" e "Uso em TV" ficam no `app_metadata` da
  conta, que só o servidor escreve — o usuário não consegue apagar.

## Encerramento imediato de sessão (migration 20261020000003)

**O buraco que existia:** resetar a senha, desativar ou excluir apagava as
sessões e os refresh tokens, mas o **access token (JWT) já emitido continuava
valendo até vencer** — até ~1 h — e o navegador da pessoa nem percebia.

**Como fecha:**

1. `user_profiles.sessoes_validas_desde` — a partir de quando os JWT da conta
   valem. Só o servidor muda (gatilho recusa até o admin pelo navegador).
   `encerrar_sessoes()` grava o início do **próximo** segundo: o `iat` do JWT
   tem resolução de segundo, e assim nenhum token emitido até a revogação
   sobrevive (o custo: um login refeito em menos de 1 s também é recusado).
2. `checar_sessao()` roda **antes de toda requisição** ao banco
   (`pgrst.db_pre_request`). Recusa com **401 `sessao_revogada`** se a conta
   não existe, está desativada, não tem perfil ou se o JWT é anterior a
   `sessoes_validas_desde`; e com **403 `senha_temporaria`** enquanto a conta
   não trocar a senha temporária (ela só consegue trocar a senha — não lê nem
   escreve dado nenhum).
3. Na tela: o cliente Supabase passa toda resposta por um detector
   (`src/lib/sessaoRevogada.js`). Recusa em **qualquer** chamada — ou o Auth
   recusando renovar o token — sai na hora e mostra "Sua sessão foi encerrada
   pelo administrador." (diferente de "e-mail ou senha inválidos"). Para telas
   paradas (TVs, painéis), um **bate-ponto** chama `checar_sessao` a cada 20 s
   com a aba visível.
4. "Alterar minha senha": o servidor revoga tudo e **devolve uma sessão nova**
   para quem trocou; as outras abas e aparelhos caem.

**Por que `checar_sessao` tem EXECUTE para `anon` e `authenticated`** (exceção à
regra "anon sem EXECUTE"): o PostgREST chama a função de pre-request **com o
papel da requisição**; sem EXECUTE, toda requisição falharia. Ela não recebe
parâmetro, não devolve nada, só olha a conta do **próprio** JWT por chave
primária, e para `anon` retorna sem consultar nada. Provado: anon recebe 204
vazio; perguntar por outra conta não é possível (a função não tem parâmetro).

**Medido (banco local):**

| | Resultado |
|---|---|
| Custo por requisição | mediana 4,65 → 4,81 ms (**+0,16 ms**); p95 igual (7,11 → 6,90 ms). As duas leituras: 0,05–0,06 ms cada |
| Tráfego das TVs | 1,8 → **4,8 req/min** por TV (+3/min do bate-ponto); KB/min iguais (a resposta é vazia) |
| Bundle | total 2.476 KB contra 2.487 KB da `main` no ar (não cresceu) |
| Queda na tela parada (duas abas) | desativar 19,8 s · excluir 18,1 s · resetar 18,2 s · encerrar 17,9 s |

**O que continua sem cobrir (declarado):**

- **Storage** (fotos e PDFs de NF): o serviço de arquivos valida o JWT sozinho,
  sem passar pelo `checar_sessao`. Um JWT revogado ainda baixaria/enviaria
  arquivo pela API do Storage até vencer (≤ 1 h) — mas só chamando a API direto;
  a tela já saiu. URLs **assinadas já emitidas** valem até expirar (as das fotos
  duram 24 h).
- **Tela de outra aba já em segundo plano**: o bate-ponto só roda com a aba
  visível; ao voltar a ficar visível, confere na hora.
- **Até 20 s**: uma tela parada leva até o próximo bate-ponto para cair; qualquer
  clique que vá ao banco cai na hora.
- **Login refeito em menos de 1 s** depois de uma revogação é recusado (ver 1).

## A variável na Vercel (para o dono)

A função usa **`SUPABASE_SERVICE_ROLE_KEY`** — a mesma que o e-mail de
ocorrência já usa. Em 20/10/2026 **ela já existe** em produção (conferido de
fora: a função de ocorrência passa da checagem da variável). Para conferir:

1. entrar em https://vercel.com e abrir o projeto **envase-pro**;
2. **Settings** → **Environment Variables**;
3. procurar **`SUPABASE_SERVICE_ROLE_KEY`**, com o ambiente **Production**
   marcado. Se existir, nada a fazer.

Se **não** existir:

1. no Supabase: **Project Settings** → **API Keys** → copiar a chave
   **`service_role`** (secreta; não colar em chat nem em arquivo);
2. na Vercel, na mesma tela: **Add New** → Key `SUPABASE_SERVICE_ROLE_KEY` →
   Value: a chave → marcar **Production** (e Preview, se usar) → **Save**;
3. **Deployments** → no deploy mais recente, menu **⋯** → **Redeploy**. Sem
   redeploy a função não enxerga a variável.

Enquanto a variável não existir, a aba Usuários mostra "A gestão de usuários
ainda não está configurada no servidor…" e o resto do sistema funciona
normalmente.

**Ao trocar a chave de serviço (go-live, passo 6): atualizar esta variável e
fazer o Redeploy.**

## Provas

- `scripts/test-sessao-revogada.mjs` — JWT real: para resetar, desativar, excluir e
  encerrar sessões, o token antigo é recusado (leitura, escrita, bate-ponto,
  refresh) e o novo funciona; senha temporária não lê; ninguém além do servidor
  muda `sessoes_validas_desde`; anon não vaza nada.
- `scripts/test-sessao-revogada-ui.mjs` — duas abas na tela real: a aba parada
  cai sozinha em até 20 s com a mensagem.

- `scripts/test-admin-usuarios.mjs` — JWT real, 74 conferências: recusas para
  anon/operador/TV, criar/editar/resetar/desativar/reativar/excluir, autoproteção,
  último admin com exclusão cruzada simultânea, troca da própria senha, limite
  de tentativas, auditoria imutável e sem senha.
- `scripts/test-gerenciar-usuarios-ui.mjs` — o fluxo inteiro na tela real
  (Playwright), 33 conferências, inclusive o primeiro acesso no celular.
