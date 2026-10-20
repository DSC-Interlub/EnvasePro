# Gestão de usuários pelo sistema (20/10/2026)

Configurações → aba **Usuários**. Só administrador.

## O que dá para fazer

| Ação | O que acontece |
|---|---|
| **Novo usuário** | nome, e-mail, papel (Administrador ou Operador) e, para operador, o rótulo "Uso em TV". A conta nasce com o e-mail confirmado e uma **senha temporária de 20 caracteres**, mostrada **uma única vez** com botão de copiar. |
| **Editar** | nome, papel e o rótulo de TV. |
| **Resetar senha** | gera outra senha temporária (mostrada uma vez), **encerra as sessões abertas** da conta e obriga a trocar no próximo acesso. |
| **Desativar / Reativar** | desativada, a conta não entra (mensagem "Esta conta está desativada") e as sessões abertas caem. Reativada, entra com a senha que já tinha. |
| **Excluir** | só depois de digitar o e-mail da conta. Não tem volta. |
| **Histórico de alterações** | quem fez o quê, em qual conta e quando (as 100 mais recentes). Nunca guarda senha. |
| **Alterar minha senha** | no rodapé do menu, para qualquer conta. Ao trocar, todas as sessões da conta são encerradas e a pessoa entra de novo com a senha nova. |

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
- Limitação declarada: o JWT que a pessoa já tinha continua **matematicamente**
  válido até vencer (até 1 h). Na prática a conta desativada não usa: a sessão
  foi apagada e a função recusa conta desativada. A troca obrigatória de senha é
  imposta pela tela; quem chamasse a API do banco direto com a senha temporária
  ainda conseguiria ler dados até trocá-la — por isso a senha temporária é longa,
  aleatória e mostrada uma vez.

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

- `scripts/test-admin-usuarios.mjs` — JWT real, 71 conferências: recusas para
  anon/operador/TV, criar/editar/resetar/desativar/reativar/excluir, autoproteção,
  último admin com exclusão cruzada simultânea, troca da própria senha, limite
  de tentativas, auditoria imutável e sem senha.
- `scripts/test-gerenciar-usuarios-ui.mjs` — o fluxo inteiro na tela real
  (Playwright), 33 conferências, inclusive o primeiro acesso no celular.
