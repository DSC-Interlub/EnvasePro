# Virada para o EnvasePro — passo a passo

Documento de execução. Uma página, na ordem exata.

Até a virada, **a Base44 é o sistema real**. O EnvasePro não entrou em uso, e é
por isso que esta virada pode ser feita com calma: se algo der errado, ninguém
para de trabalhar — basta voltar a usar a Base44.

**Quem é quem:** *Dono* = Kauan. *Claude* = assistente. Onde não estiver escrito,
é do Dono.

---

## Antes de marcar a data

| | Quem | Conferir |
|---|---|---|
| Fases 0 a 4 concluídas | Claude | feito |
| Suítes verdes | Claude | injection 21, upload 22, travas 31, interface 37, CSP 0 violações |
| Backup com restauração testada | Claude | feito: 24/24 tabelas, 1869/1869 linhas |
| **Decisão sobre as 3 linhas negativas** | **Dono** | **ver "Decisão pendente" no fim. Bloqueia a reimportação** |
| Janela de parada combinada com a fábrica | Dono | data, hora e duração avisadas a quem usa |
| Critério de desistência lido e aceito | Dono | ver o fim deste documento |

---

## Janela de parada

Escolher um horário de baixa operação — fim de turno ou sábado. Entre o passo 1
e o passo 7 **ninguém deve lançar nada em sistema nenhum**: nem na Base44 (que
estará congelada) nem no EnvasePro (que ainda não terá o histórico).

Estimativa: **2 a 3 horas**, sendo a reimportação a parte mais longa. No ensaio
no banco local, os 15.770 registros entraram em menos de 5 segundos; o tempo real
vai para conferência, não para a máquina.

---

## 1. Congelar a Base44

**Quem:** Dono.

Avisar a fábrica que a Base44 entra em modo somente leitura a partir daquela
hora. Nada de operar nos dois sistemas ao mesmo tempo: o que for lançado na
Base44 depois do export **se perde**.

**Conferir depois:** ninguém consegue lançar. Anotar a hora exata do corte.

**Desfazer:** destravar a Base44. Reversível a qualquer momento.

---

## 2. Export novo da Base44

**Quem:** Dono.

Exportar **depois** do congelamento. O export que existe no projeto é de
**24/09** e já está velho.

Exportar estas entidades, uma a uma, em CSV, com o nome
`<Entidade>_export.csv`, e entregar a pasta ao Claude:

```
Operator        Product        Embalagem        SapPedido
CheckoutProgramacao            CheckoutItem
EnvaseRecord                   ChecklistRecebimento
Recebimento     RecebimentoItem    RecebimentoParticipante    RecebimentoOcorrencia
RecebimentoFornecedor          NotaFiscalArquivo
EmpilhaProgramacao             EmpilhaLinha       EmpilhaOcorrencia
EmpilhadeiraConfig             EmpilhadeiraParada EmpilhadeiraManutencao
LimpezaLocal                   LimpezaProgramacao
```

No export de 24/09, **13 dessas entidades vieram vazias**. Se continuarem
vazias, tudo bem — significa que não há dado. O que não pode é vir vazia por
erro de exportação, então vale conferir na Base44 se a tela correspondente tem
registro antes de aceitar um CSV de 0 byte.

**Conferir depois:** anotar a contagem de linhas de cada arquivo. É contra esses
números que a importação será validada.

**Desfazer:** exportar de novo. Nada é alterado.

---

## 3. Ensaio da reimportação no banco local

**Quem:** Claude.

Roda `scripts/migrar-dados.js` contra o **Supabase local** com o export novo e
valida contagem por contagem, CSV contra banco.

**Já ensaiado em 08/10/2026** com o export de 24/09: 8 de 8 tabelas conferem,
15.770 registros. **Com uma ressalva que bloqueia** — ver "Decisão pendente".

**Conferir depois:** 100% das tabelas batendo. Qualquer divergência para a
virada aqui, antes de tocar em produção.

**Desfazer:** não se aplica. É local.

---

## 4. Publicar o código novo

**Quem:** Claude. **Já feito** — a `main` está publicada e verificada.

Se houver commit novo até a virada, repetir: build, `npm audit --omit=dev`,
busca de segredos, as 4 suítes, merge, e verificação do site publicado.

**Conferir depois:** o site carrega, exige login, console sem erro.

**Desfazer:** Vercel → projeto → **Deployments** → o deploy anterior → `...` →
**Promote to Production**. Instantâneo, não depende de git.

---

## 5. Reimportar o histórico em produção

**Quem:** Dono executa, Claude acompanha. É o passo mais longo.

Só começa depois do ensaio (passo 3) bater 100%.

**Conferir depois:** contagem de cada tabela em produção igual à do CSV. Se
alguma divergir, **parar** e não seguir para o passo 6.

**Desfazer:** restaurar do backup. Por isso o backup do passo 0 tem de estar
testado — e está.

---

## 6. Limpeza dos 13 operadores de teste

**Quem:** Claude executa, **mas o `COMMIT` só com o "sim" do Dono na hora.**

Autorizada pelo Dono para acontecer no go-live. A sequência é sempre a mesma:

1. backup novo, imediatamente antes;
2. `ROLLBACK` mostrando as contagens antes e depois;
3. Dono lê os números e diz "sim";
4. só então `COMMIT`.

O script **aborta sozinho** se o critério não casar exatamente 13 operadores e
deixar 14. Critério duplo: `nome = 'Operador Teste Funcional QA'` **e**
`matricula LIKE 'QA-%'`.

**Números medidos (dry-run de 07/10):** apaga 10 `recebimento_participantes`,
1 `envase_records`, 3 `recebimentos` (que levam 2 `recebimento_ocorrencias` por
cascata) e os 13 operadores. Também os 13 arquivos do bucket, que são deles.
Resultado esperado: 14 operadores, catálogo intacto.

**Dois efeitos a confirmar antes do "sim":** `recebimento_ocorrencias` vai de 2
para 0, e os 6 `checklist_recebimentos` **já são órfãos hoje** — a limpeza não
orfana nada novo.

**Desfazer:** restaurar do backup do item 1 desta lista.

---

## 7. Subir as 6 fotos reais

**Quem:** Dono (pelo cadastro de operador, como admin).

As 6 fotos **já estão baixadas** e guardadas fora do repositório:

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

São as **únicas fotos reais que existem**. As 13 que estão no bucket são PNGs de
70 bytes dos operadores de teste e somem no passo 6.

**Como subir:** entrar como admin → **Operadores** → editar o operador →
**Foto do Operador** → escolher o arquivo → salvar. Repetir para os 6. O sistema
grava o caminho e gera URL assinada na leitura; não é preciso mexer em bucket.

Outros **8 operadores reais não têm foto nenhuma**: Lucas Araujo, Lucas Fontes,
Rodrigo, Mike, Márcio, Elder, Victor e Renan. Decidir se entram sem foto.

**Conferir depois:** `select nome, foto_url from operators where foto_url like
'%base44%'` → **0 linhas**. E as fotos aparecem no modal de seleção de operador.

**Desfazer:** regravar o `foto_url` antigo. Só funciona enquanto a Base44
estiver no ar — por isso este passo vem antes de desligá-la.

---

## 8. Trocar a chave de serviço e as 4 senhas

**Quem:** Dono. **O Claude não toca em chave nem em senha.**

É o primeiro passo **irreversível**: chave rotacionada não volta. Por isso vem
depois de tudo que é reversível.

As senhas antigas (padrão `Interlub@...`) estão no histórico do git e estão
comprometidas, junto com os tokens que passaram por chat.

**Ordem, sem pular:**

1. rotacionar a `service_role` no painel do Supabase;
2. atualizar a variável na Vercel;
3. **forçar novo deploy** — a Vercel não recarrega variável sem redeploy;
4. trocar as senhas das 4 contas: `pcp-brasil`, `operacoes.equipe`,
   `tv-fabrica` e a de desenvolvimento.

Entre os passos 1 e 3 as funções serverless (o e-mail de ocorrência) ficam fora
do ar. É esperado e dura poucos minutos.

**Conferir depois:** login nas 4 contas com a senha nova, e registrar uma
ocorrência de empilhadeira para ver o e-mail sair — isso exercita a chave nova.

**Desfazer:** não volta. Se quebrar, rotacionar de novo e corrigir onde a chave
está configurada.

---

## 9. Reautenticar as TVs

**Quem:** Dono, **presencialmente em cada TV**.

As telas de TV **não são mais públicas**. Cada equipamento precisa entrar uma
vez na conta `tv-fabrica` (com a senha nova do passo 8) e a sessão fica salva
naquele navegador.

**Conferir depois, olhando a tela:** `/Televisao`, `/TelevisaoEmpilha` e
`/Painel` carregam com dado; as fotos aparecem; e a tela **não cai** por
inatividade — só o admin cai, aos 60 minutos. Deixar rodando um turno inteiro
sob observação.

**Desfazer:** apontar as TVs de volta para a Base44.

---

## 10. Smoke test na interface de produção

**Quem:** Claude, com conta real.

Os fluxos do operador, clicando de verdade: envase, check-out com seleção de
operador, empilhadeira (iniciar linha com operador e ajudante), limpeza,
recebimento/checklist/nota fiscal.

**Conferir depois:** todos funcionam e o console fica sem erro.

**Desfazer:** não se aplica — é leitura e lançamentos de teste, que são
apagados em seguida.

---

## Critério de desistência

**Volta para a Base44 se qualquer uma destas acontecer:**

- a reimportação (passo 5) divergir em contagem e a causa não for entendida em
  até 30 minutos;
- um fluxo de operador não funcionar no smoke test (passo 10);
- as TVs não sustentarem a sessão por um turno;
- qualquer perda de dado que o backup não cubra.

**Como voltar:** destravar a Base44 e avisar a fábrica para usá-la. Leva
minutos, porque a Base44 fica **congelada mas intacta por no mínimo 30 dias**.

**Não desligar a Base44 no dia da virada.** Só depois de 30 dias de operação
estável no EnvasePro, e com as 6 fotos já no bucket.

---

## Depois da virada

- Acompanhar os relatórios de CSP, os erros da Vercel e as contagens diárias
  nos primeiros dias. A CSP já está **bloqueando** e continua reportando em
  `/api/csp-report`.
- Aplicar os dois limites de requisições (ver `docs/LIMITE-DE-REQUISICOES.md`).
- Conferir que `authenticated` não voltou a ter `TRUNCATE`: tabela criada pelo
  painel nasce com ele.

---

## Decisão pendente — bloqueia o passo 5

**O histórico tem 3 registros de envase com quantidade negativa, e as restrições
que estão em produção os recusam.**

Encontrado no ensaio de 08/10. São 3 linhas em 5884 (0,05%):

| Data | Operador | Produto | Produzida | Embalagens |
|---|---|---|---|---|
| 2026-04-24 | Alisson | IVP072591270 | −1 | −1 |
| 2026-03-16 | Elder | IVP073615240 | −2 | −5 |
| 2025-12-08 | Victor | IVP070425020 | −4 | −20 |

Parecem lançamentos de **estorno** — correção de um envase lançado a mais. Mas
isso é leitura minha; quem sabe é quem opera.

Mais nada no histórico viola restrição alguma: varri todos os CSVs contra todas
as CHECKs, e `nota_final` vai de 0 a 70, dentro da faixa −90 a +90.

**Três caminhos, e a escolha é do Dono:**

1. **Afrouxar as duas restrições** de `envase_records` para aceitar negativo.
   Assume que estorno é lançamento legítimo. É mudança no banco.
2. **Importar as 3 linhas com o valor zerado ou nulo**, registrando a observação.
   Preserva a linha, altera o número. É mudança no dado histórico.
3. **Não importar as 3 linhas.** Preserva a restrição, perde 3 registros de
   5884.

Sem essa resposta a reimportação para na linha 3.000 e não termina. As três
opções exigem autorização, porque são mudança no banco ou nos dados.
