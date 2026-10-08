# Virada para o EnvasePro — começo limpo

Documento de execução. Uma página, na ordem exata.

**O histórico da Base44 NÃO será importado.** Decisão do dono em 08/10/2026. O
EnvasePro começa com os cadastros e nada de movimento: nenhum envase, check-out,
recebimento ou nota fiscal antigos. Isso torna a virada bem mais simples — não
há export, nem reimportação, nem janela de parada longa.

Até a virada, **a Base44 é o sistema real**. Ela fica **congelada mas intacta por
no mínimo 30 dias** depois, porque é o plano de retorno.

**Quem é quem:** *Dono* = Kauan. *Claude* = assistente. Onde não estiver escrito,
é do Dono.

---

## Situação de partida (08/10/2026)

O banco de produção está **vazio**, de propósito. Foi limpo com autorização
escrita, depois de backup verificado.

| O que | Situação |
|---|---|
| 21 tabelas de dados | **0 linhas** |
| Arquivos no storage | **0** (os 3 buckets vazios e privados) |
| Sequences de protocolo | **reiniciadas**: o primeiro registro será o `000001` |
| `auth.users` | **5 contas**, intactas |
| `user_profiles` | **5 papéis**, intactos |
| `empilhadeira_configs` | **1 registro**, mantido |

Backup completo e com restauração conferida:
`C:\Users\kauan.pereira\EnvasePro-backups\prod_2026-10-08T12-20-02Z_PRE-LIMPEZA-TOTAL\`

---

## Antes de marcar a data

| | Quem | Situação |
|---|---|---|
| Fases 0 a 4 concluídas | Claude | feito |
| V1 (a–g) concluída | Claude | em andamento |
| Suítes verdes | Claude | triggers 31, injection 21, upload 22, interface 37, rotas 26, checklist 41, sessão 26, CSP 0 violações |
| Backup com restauração testada | Claude | feito: 24/24 tabelas, 1869/1869 linhas |
| **Qualidade confirma o critério do checklist (A ou B)** | **Qualidade** | **PENDENTE — ver o fim** |
| Janela combinada com a fábrica | Dono | — |
| Critério de desistência lido e aceito | Dono | — |

---

## Janela

Como não há importação, a janela é curta: **1 a 2 horas**, quase toda em
conferência. O trabalho pesado é o Dono subir 6 fotos e testar as telas.

Entre o passo 1 e o passo 7, ninguém deve lançar nada em sistema nenhum.

---

## 1. Congelar a Base44

**Quem:** Dono.

Avisar a fábrica e deixar a Base44 em somente leitura. Anotar a hora do corte.

**Conferir:** ninguém consegue lançar.

**Desfazer:** destravar. Reversível a qualquer momento.

---

## 2. Restaurar os cadastros

**Quem:** Claude gera, Dono autoriza, Claude aplica.

Só catálogo, nada de movimento:

| Tabela | Linhas |
|---|---|
| `products` | 1.599 |
| `embalagens` | 52 |
| `operators` | **14** (os reais; os 13 de teste ficam de fora) |
| `limpeza_locais` | 1 |

```
node scripts/backup/restaurar-cadastros.mjs <pasta-backup> RESTAURAR-CADASTROS.sql
```

O script **não executa nada**: gera o `.sql` para revisão. Ele descarta os 13
operadores de teste por critério duplo — nome **e** matrícula `QA-` —, porque
são a origem dos homônimos que tornam ambígua a resolução de operador por nome.

**Conferir depois:** `operators` = 14, `products` = 1.599, `embalagens` = 52, e
**nenhum** operador chamado "Operador Teste Funcional QA".

**Desfazer:** apagar as 4 tabelas e restaurar de novo. Não há movimento
dependendo delas nesse momento.

---

## 3. Subir as 6 fotos reais

**Quem:** Dono, pelo cadastro de operador, como admin.

Já baixadas e guardadas fora do repositório:

```
C:\Users\kauan.pereira\EnvasePro-backups\prod_2026-10-07T17-21-25Z_pre-limpeza\fotos-reais-base44\
```

| Operador | Arquivo | Tamanho |
|---|---|---|
| Alisson | `Alisson.jpg` | 17 KB |
| Wilber | `Wilber.jpg` | 49 KB |
| Lucas | `Lucas.jpg` | 77 KB |
| Matheus | `Matheus.jpg` | 249 KB |
| William | `William.jpg` | 129 KB |
| Jorge Willian | `Jorge_Willian.jpg` | 53 KB |

São as **únicas fotos reais que existem**. As que estavam no bucket eram PNGs de
70 bytes dos operadores de teste, e foram apagadas na limpeza.

**Como:** admin → **Operadores** → editar → **Foto do Operador** → escolher o
arquivo → salvar. Repetir para os 6. O sistema grava o caminho e gera URL
assinada na leitura; não é preciso mexer em bucket.

Os outros **8 operadores reais não têm foto nenhuma**: Lucas Araujo, Lucas
Fontes, Rodrigo, Mike, Márcio, Elder, Victor e Renan. Decidir se entram sem.

**Conferir depois:** as 6 fotos aparecem no modal de seleção de operador.

**Desfazer:** limpar o campo `foto_url` do operador.

---

## 4. Confirmar o critério do checklist

**Quem:** Qualidade decide, Claude aplica.

Hoje está no critério **A — pontos**, que é o comportamento de sempre: aprovado
a partir de 80, numa escala que vai de −90 a +90. Só duas combinações chegam
lá: **9 "Sim"** (90) ou **8 "Sim" + 1 "N/A"** (80).

A alternativa **B — percentual sobre o aplicável** ignora os "N/A" e mede
conformidade. Resolve um efeito colateral do A: como "N/A" vale 0, um checklist
**sem nenhum problema** mas com 4 perguntas não aplicáveis tira 50.

**Trocar é uma linha:** a constante `CRITERIO_ATIVO` em `src/lib/checklist.js`.
As faixas propostas para B (aprovado ≥ 90%, atenção 70–89%, reprovado < 70%)
**ainda não foram confirmadas**.

**Conferir depois:** abrir um checklist de cada faixa e ver o rótulo.

**Desfazer:** trocar a constante de volta e publicar.

---

## 5. Teste do Dono, logado

**Quem:** Dono. O Claude **não tem as senhas** e não pode fazer este passo.

A lista exata está em **"O que o Dono precisa testar"**, no fim deste documento.

**Conferir:** todos os itens da lista funcionando.

**Desfazer:** nada a desfazer; é teste.

---

## 6. Trocar a chave de serviço e as 4 senhas

**Quem:** Dono. O Claude não toca em chave nem em senha.

Primeiro passo **irreversível** — chave rotacionada não volta. Por isso vem
depois de tudo que é reversível.

As senhas antigas (padrão `Interlub@...`) estão no histórico do git e estão
comprometidas, junto com os tokens que passaram por chat.

**Ordem, sem pular:**

1. rotacionar a `service_role` no painel do Supabase;
2. atualizar a variável na Vercel;
3. **forçar novo deploy** — a Vercel não recarrega variável sem redeploy;
4. trocar as senhas das 4 contas: `pcp-brasil`, `operacoes.equipe`,
   `tv-fabrica` e a de desenvolvimento.

Entre os passos 1 e 3, as funções serverless (o e-mail de ocorrência) ficam fora
do ar. É esperado e dura poucos minutos.

**Conferir depois:** login nas 4 contas com a senha nova, e registrar uma
ocorrência de empilhadeira para ver o e-mail sair — isso exercita a chave nova.

**Desfazer:** não volta. Se quebrar, rotacionar de novo e corrigir onde a chave
está configurada.

---

## 7. Reautenticar as TVs

**Quem:** Dono, **presencialmente em cada TV**.

As telas de TV **não são mais públicas**. Cada equipamento precisa entrar uma
vez na conta `tv-fabrica` (com a senha nova do passo 6) e a sessão fica salva
naquele navegador.

**Conferir, olhando a tela:** `/Televisao`, `/TelevisaoEmpilha` e `/Painel`
carregam; as fotos aparecem; e a tela **não cai** por inatividade — só o admin
cai, aos 60 minutos. Deixar rodando um turno inteiro sob observação.

**Desfazer:** apontar as TVs de volta para a Base44.

---

## 8. Smoke test final

**Quem:** Claude, no que der sem senha; Dono, no resto.

Conferir que as telas carregam, que o console fica limpo e que os protocolos
começam em `000001`.

---

## O que o Dono precisa testar (passo 5)

O Claude não tem as senhas, então estes itens **só o Dono pode fazer**. Marque
cada um.

### Como **admin** (`pcp-brasil`)

- [ ] Entrar e ver o Dashboard carregar sem erro.
- [ ] **Operadores**: a lista mostra **14**, nenhum "Operador Teste Funcional QA".
- [ ] **Produtos**: a lista mostra 1.599 e a busca por código encontra.
- [ ] **Embalagens**: mostra 52.
- [ ] Editar um operador e salvar — inclusive **sem preencher matrícula**, que
      é opcional (os 14 reais não têm).
- [ ] Subir a foto de um operador e ver a imagem aparecer.
- [ ] Criar uma **programação de check-out** e conferir que o código é
      `CKO-2026-000001`.
- [ ] Criar uma **programação de empilhadeira**: `EMP-2026-000001`.
- [ ] Abrir **Produtos, Embalagens, Operadores, as 3 telas de Importar,
      Gerenciar Usuários, Configuração da Empilhadeira e os 2 Indicadores** —
      todas devem **abrir** para você.
- [ ] Assinar como **líder** uma linha de empilhadeira concluída.
- [ ] Tentar alterar o **código de uma programação** já criada — deve ser
      **recusado**, inclusive para admin.

### Como **operador** (`operacoes.equipe`)

- [ ] Entrar e **escolher o operador do turno** no modal; a foto aparece para
      quem tem.
- [ ] **Envase**: criar um registro novo até o fim.
- [ ] **Check-out**: num item pendente, **selecionar o operador** e salvar.
      *(Era o fluxo que estava bloqueado antes.)*
- [ ] **Empilhadeira**: iniciar uma linha com **operador e ajudante**.
      *(Era o fluxo que falhava no código antigo.)*
- [ ] Tentar **trocar o operador** de um item que já tem um — deve ser
      **recusado**.
- [ ] Tentar **assinar como líder** — deve ser **recusado**.
- [ ] Digitar na barra de endereço `/Produtos`, `/Operadores` e
      `/GerenciarUsuarios` — todas devem **recusar** e mandar para a
      Empilhadeira com aviso.
- [ ] Conferir que o menu **não mostra** catálogo nem importações.
- [ ] **Recebimento**: preencher um checklist e ver a nota e o rótulo
      (Aprovado / Atenção / Reprovado).
- [ ] **Nota fiscal**: subir um PDF e abri-lo pelo sistema.
- [ ] Tentar subir um arquivo **renomeado** (um `.txt` salvo como `.png`) —
      deve ser **recusado** com mensagem clara.

### Como **TV** (`tv-fabrica`), em cada equipamento

- [ ] `/Televisao`, `/TelevisaoEmpilha` e `/Painel` carregam com dado.
- [ ] As fotos dos operadores aparecem.
- [ ] A tela **continua ligada** depois de 1 hora sem ninguém tocar.
- [ ] Recarregar a página **não pede login de novo**.

### Depois da V1 (e)(f)(g) — como **admin**, no **tablet**

Estes três itens mudaram telas que você usa todo dia; valem uma conferida
separada.

- [ ] **Listas** (Produtos, Embalagens, Operadores, Registros): o rodapé diz
      "Mostrando 50 de 1599" e **Carregar mais 50** soma mais 50.
- [ ] **Busca**: procurar um código que esteja lá no fim do catálogo —
      tem de achar **sem** você carregar as páginas anteriores.
- [ ] **Excluir** um produto: o aviso diz **qual** produto é, e **Cancelar**
      não apaga nada.
- [ ] Nenhuma dessas telas **rola para o lado** no tablet nem no celular.
- [ ] **No celular** as listas viram cartões, não tabela.
- [ ] **Checklist**: os botões Sim / Não / N-A dão para acertar com o dedo,
      inclusive os dois primeiros (Etapa 5 e Data de Entrega), que eram os
      menores.
- [ ] **Contador do menu**: o número ao lado de Empilhadeira e de Recebimento
      bate com as pendências de verdade.
- [ ] **Contador do menu, com a internet caindo**: desligue o wi-fi por um
      minuto. Tem de aparecer o aviso **"Contadores desatualizados"** no menu.
      Antes a falha era escondida e o número velho continuava na tela.

### Em qualquer conta

- [ ] Abrir o console do navegador (F12) e conferir que **não há erro
      vermelho**.
- [ ] Testar no **celular** pelo menos uma tela de lançamento.

---

## Critério de desistência

**Volta para a Base44 se qualquer uma destas acontecer:**

- um fluxo de operador não funcionar no teste do passo 5;
- as TVs não sustentarem a sessão por um turno;
- qualquer perda de dado que o backup não cubra.

**Como voltar:** destravar a Base44 e avisar a fábrica. Leva minutos, porque ela
fica **congelada mas intacta por no mínimo 30 dias**.

**Não desligar a Base44 no dia da virada.** Só depois de 30 dias de operação
estável, e com as 6 fotos já no bucket.

**Rollback do código, a qualquer momento:** Vercel → **Deployments** → o deploy
anterior → `...` → **Promote to Production**. Instantâneo, não depende de git.

---

## Depois da virada

- Acompanhar os relatórios de CSP, os erros da Vercel e as contagens diárias
  nos primeiros dias. A CSP já está **bloqueando** e continua reportando em
  `/api/csp-report`.
- Aplicar os dois limites de requisições (`docs/LIMITE-DE-REQUISICOES.md`).
- Conferir que `authenticated` não voltou a ter `TRUNCATE`: tabela criada pelo
  painel nasce com ele, e `ALTER DEFAULT PRIVILEGES` não cobre o que o
  `supabase_admin` cria.
- Decidir o que fazer com a conta de teste `operacoes@interlub.com`, que
  continua em `auth.users`.

---

## Lição guardada: sequências não andam sozinhas

**Só importa se um dia o histórico for importado.** Como a decisão é começar
limpo, isto não se aplica agora — mas o erro é silencioso e caro, então fica
registrado.

Restaurar ou importar linhas **não avança as sequências de protocolo**: elas são
contadores separados. Sem sincronizar, o primeiro registro novo tenta reusar um
protocolo que já existe e esbarra na restrição de unicidade:

```
duplicate key value violates unique constraint
  "checkout_programacoes_codigo_programacao_key"
```

Aconteceu de verdade em 08/10, depois de restaurar o backup: a sequência estava
em 3 enquanto os dados já iam até `CKO-2026-000016`.

O `scripts/backup/gerar-restore-local.mjs` já sincroniza as 6 sequências com o
maior valor gravado. Qualquer rotina futura de importação precisa fazer o mesmo.
