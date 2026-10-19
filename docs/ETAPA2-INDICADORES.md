# Etapa 2 — indicadores no banco

**Status (19/10/2026): os cinco passos do §4.1 e as metas diárias implementados e provados no
banco LOCAL. NADA aplicado em produção.** Passos 1 a 3 (telas de parede) na
seção 7; passos 4 e 5 (telas de admin) na seção 8.

Escrito para quem for implementar a Etapa 2 e para quem precisar aprovar o
gasto de tráfego.

---

## 1. O problema, medido

As telas calculam indicador no navegador. Para isso elas **baixam as tabelas
inteiras** e contam em JavaScript. Quantas tabelas cada tela pede:

| Tela | Tabelas | Intervalo de recarga |
|---|---|---|
| `Televisao` | **11** | de 30 s a 300 s, oito intervalos diferentes |
| `Painel` | **15** | sem recarga automática |
| `TelevisaoEmpilha` | 4 | **10 s**, 15 s e 60 s |
| `IndicadoresEmpilha` | 5 | — |
| `IndicadoresRecebimento` | 4 | — |
| `Dashboard` | 5 | — |

### Requisições por minuto, medido

`scripts/medir-trafego-tv.mjs`, 3 minutos por tela, no banco local:

| Tela | Requisições/min |
|---|---|
| `tv/Televisao` | **18,0** |
| `tv/TelevisaoEmpilha` | **17,6** |
| `tv/Painel` | 12,3 |
| `admin/IndicadoresEmpilha` | 4,0 |
| `admin/IndicadoresRecebimento` | 3,7 |
| `admin/Dashboard` | 4,0 |

Isso confirma a ordem de grandeza que o dono citou (15/min).

### O volume em bytes NÃO foi medido — e por quê

O banco local está **vazio** nas tabelas operacionais, então a medição de bytes
deu 1,5 a 2,9 KB/min, número que não significa nada. Seria desonesto usá-lo.

O que dá para fazer é **projetar**, a partir do tamanho real por linha medido
nos backups de produção e do número de requisições por tabela que acabei de
medir:

| Tabela | Bytes por linha (medido no backup) |
|---|---|
| `checklist_recebimentos` | 1.086 |
| `empilha_linhas` | 1.019 |
| `recebimentos` | 1.012 |
| `envase_records` | 826 |
| `checkout_itens` | 625 |
| `products` | 304 |
| `operators` | 301 |

Projeção **ao chegar ao volume que a Base44 tinha** (5.884 envases, 7.874 itens
de check-out, 1.599 produtos):

| Tela | Requisições/min | Tráfego projetado |
|---|---|---|
| `tv/Televisao` | 18,0 | **35,8 MB/min** |
| `tv/Painel` | 12,3 | **10,4 MB/min** |
| `tv/TelevisaoEmpilha` | 17,6 | 3,3 MB/min |
| `admin/Dashboard` | 4,0 | 1,8 MB/min |

O que pesa em `Televisao`: `envase_records` pedido **13 vezes** em 3 minutos
(60 MB no total) e `checkout_itens` **9 vezes** (43 MB).

**Três TVs ligadas ao mesmo tempo passam de 49 MB/min, ou ~71 GB por dia.**

### Quando isso vira problema

**Não é hoje.** Pela decisão de começo limpo, as tabelas operacionais entram em
uso vazias, e aí a projeção acima é perto de zero. O problema cresce com o
dado: cada envase registrado aumenta o que as três TVs baixam, de minuto em
minuto, para sempre.

> **O dono precisa conferir uma coisa no painel do Supabase:** o limite de
> tráfego (*egress*) do plano gratuito. Não vou afirmar o número de cabeça. O
> que este documento dá é o consumo projetado, para comparar com o limite.

---

## 2. Dicionário de indicadores

Levantado no código, não de memória. "Fonte" é a tabela; "fórmula" é o que o
JavaScript faz hoje.

### 2.1 Envase — `StatsGrid.jsx`, no Dashboard e no Painel

| Indicador | Fórmula de hoje | Fonte | Quem usa |
|---|---|---|---|
| Produção Total | `soma(quantidade_produzida)` | `envase_records` | Admin, TV |
| Produção Bio | `soma(quantidade_produzida) onde sala='Bio'` | `envase_records` | Admin, TV |
| Produção Industrial | idem, `sala='Industrial'` | `envase_records` | Admin, TV |
| Registros | `contagem(*)`, e por sala | `envase_records` | Admin |
| Produtos cadastrados | `contagem(*)` | `products` | Admin |
| Operadores ativos | `contagem(*) onde ativo` | `operators` | Admin |

### 2.2 Envase — `ProductionChart.jsx` e `AnalysisGrid.jsx`

| Indicador | Fórmula de hoje | Fonte |
|---|---|---|
| Produção dos últimos 7 dias | soma por dia, `data = cada um dos 7 dias` | `envase_records` |
| Tempo produtivo médio por consistência | média de `tempo_produtivo` (HH:MM → minutos), agrupado por `consistencia` | `envase_records` |
| Quantidade por mês | soma de `quantidade_produzida` agrupada por `mes` | `envase_records` |
| Produção por categoria | soma por `categoria`, com filtro de sala | `envase_records` + `products` |

> `tempo_produtivo` é texto `HH:MM` e hoje é convertido no navegador. No banco
> isso vira `interval`, e a média deixa de depender de parsing de string.

### 2.3 Check-out — `CheckoutStatsGrid.jsx`

| Indicador | Fórmula de hoje | Fonte |
|---|---|---|
| Total de pedidos | `contagem(*)` | `checkout_itens` |
| Concluídos | `onde status='Concluído'` | `checkout_itens` |
| Críticos | `onde critico` | `checkout_itens` |
| Finalizados com atraso | `onde finalizado_fora_do_prazo` | `checkout_itens` |

### 2.4 Empilhadeira — `IndicadoresEmpilha.jsx`

| Indicador | Fórmula de hoje | Fonte |
|---|---|---|
| Linhas por tipo | contagem por `tipo_linha` (Normal / Crítico / Avulso); sem tipo conta como Normal | `empilha_linhas` |
| Concluídas / Pendentes | `status='Concluído'`, e o resto | `empilha_linhas` |
| Tempo médio por linha | média de `tempo_total` (HH:MM → min) das concluídas | `empilha_linhas` |
| Linhas por dia | junta `empilha_programacoes.data_programada` com as linhas da programação | `empilha_programacoes` + `empilha_linhas` |
| Tempo total parado | `soma(tempo_total)` | `empilhadeira_paradas` |
| Paradas por dia | contagem por `data` | `empilhadeira_paradas` |
| **Aproveitamento (OEE)** | `min(100, round(produtivo / duracao_turno * 100))` por dia, onde `produtivo` = soma do `tempo_total` das linhas concluídas do dia | 3 tabelas + `empilhadeira_configs.duracao_turno_horas` |
| OEE médio | média dos aproveitamentos diários | idem |

> O OEE é o indicador mais caro: cruza três tabelas e a configuração do turno,
> e hoje isso acontece no navegador. É o primeiro candidato a virar função no
> banco.

### 2.5 Recebimento — `IndicadoresRecebimento.jsx`

| Indicador | Fórmula de hoje | Fonte |
|---|---|---|
| Total / Concluídos / Em andamento / Cancelados | contagem por `status` | `recebimentos` |
| Por tipo | contagem por `tipo` | `recebimentos` |
| Por dia | contagem por data | `recebimentos` |
| Tempo médio geral | média de `tempo_produtivo_minutos` dos concluídos | `recebimentos` |
| Tempo pausado total | `soma(tempo_pausado_minutos)` | `recebimentos` |
| Tempo produtivo total | `soma(tempo_produtivo_minutos)` | `recebimentos` |
| Tempo médio por tipo | média por `tipo`, só concluídos | `recebimentos` |
| Ocorrências por tipo | contagem por `tipo`, filtradas pelos recebimentos do período | `recebimento_ocorrencias` |

### 2.6 Checklist — `IndicadoresChecklist.jsx`

| Indicador | Fórmula de hoje | Fonte |
|---|---|---|
| Total de checklists | `contagem(*)` | `checklist_recebimentos` |
| Nota média | `round(média(nota_final))` | `checklist_recebimentos` |
| Aprovados | `onde nota_final >= 80` | `checklist_recebimentos` |
| Reprovados | `onde nota_final < 0` | `checklist_recebimentos` |
| Conformidade por pergunta | contagem de Sim/Não/N-A em cada coluna | `checklist_recebimentos` |

> **Atenção:** o limite de 80 e as faixas vêm de `src/lib/checklist.js`
> (`CRITERIO_ATIVO`). Se um indicador no banco repetir o número 80 escrito à
> mão, passam a existir duas verdades sobre o mesmo checklist. Qualquer função
> SQL aqui tem de receber a faixa como parâmetro, ou o critério muda num lugar
> e não no outro. Isto é condição, não preferência.

### 2.7 Contadores do menu — **já feito**

`public.contadores_do_menu()`, aplicada em produção em 09/10/2026. É o modelo
que o resto deve seguir: `STABLE`, direitos do invocador (o RLS continua
valendo), `search_path` fixo, `EXECUTE` só para `authenticated`.

---

## 3. Proposta: o que vira o quê no banco

Três formas, escolhidas por motivo e não por gosto.

### 3.1 Visão com `security_invoker` — para agregado simples

Para somas e contagens sem parâmetro. Exemplo, a produção por sala e dia:

```
CREATE VIEW vw_producao_diaria WITH (security_invoker = on) AS
SELECT data, sala, sum(quantidade_produzida) AS quantidade, count(*) AS registros
FROM envase_records GROUP BY data, sala;
```

**`security_invoker = on` é obrigatório.** Sem isso a visão roda com os
direitos de quem a criou e vira um caminho para ler linha que o RLS esconde —
o mesmo raciocínio que manteve `contadores_do_menu` fora de `SECURITY DEFINER`.

### 3.2 Função `STABLE` — quando há parâmetro

Para o que depende de período, sala ou tipo. Exemplo, o OEE:

```
CREATE FUNCTION indicadores_empilhadeira(de date, ate date)
RETURNS TABLE (dia date, linhas_concluidas bigint, minutos_produtivos numeric,
               minutos_parados numeric, aproveitamento int)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$ ... $$;
```

Mesmas regras da `contadores_do_menu`: `STABLE`, **não** `SECURITY DEFINER`,
`search_path` fixo, `REVOKE` de `PUBLIC` e de `anon`, `GRANT EXECUTE` só a
`authenticated`.

**Datas:** qualquer "hoje" dentro dessas funções usa
`(now() AT TIME ZONE 'America/Sao_Paulo')::date`, nunca `CURRENT_DATE` —
`CURRENT_DATE` segue o fuso de quem chama. Está provado em
`scripts/test-fuso-banco.js` e é o assunto da migration `20261013000001`.

### 3.3 Uma chamada por tela de TV

A TV não precisa de 11 consultas: precisa dos números que ela mostra. Uma
função por painel, devolvendo uma linha com tudo:

```
painel_televisao()        -> os números da tela de envase e check-out
painel_televisao_empilha() -> os da tela de empilhadeira
painel_geral()             -> os do Painel
```

**11 requisições viram 1.** O corpo baixado passa a ser proporcional ao número
de indicadores, não ao número de linhas das tabelas — é a mudança que faz o
tráfego parar de crescer com o uso.

---

## 4. Plano para a TV

### 4.1 Ordem, da maior razão valor/risco para a menor

1. **`painel_televisao_empilha()`** primeiro. É a tela que recarrega a cada
   **10 segundos**, a mais frequente, e depende de só 4 tabelas — a menor
   superfície para errar.
2. **`painel_televisao()`**. É a de maior tráfego projetado (35,8 MB/min) e a
   que mais se beneficia.
3. **`painel_geral()`**, para o `Painel`.
4. **`indicadores_empilhadeira(de, ate)`** e
   **`indicadores_recebimento(de, ate)`**, que são de admin e não ficam
   abertas o dia todo.
5. **Visões de agregado** para o Dashboard.

### 4.2 Cada passo precisa de teste de PARIDADE

O mesmo que o item (e) da V1 exigiu: a conta antiga é copiada para o teste e
comparada com a função, indicador por indicador, sobre dados criados ali com
casos de borda. Trocar um número certo por um errado num painel de fábrica é
pior do que o tráfego que se quer economizar — o selo do menu é o que diz ao
líder que há assinatura pendente.

Paridade com todos os indicadores em zero não prova nada: o teste tem de exigir
que nenhum esteja zerado, como `test-contadores-menu.js` faz.

### 4.3 Unificar os intervalos de recarga

`Televisao` tem **oito** intervalos diferentes (30, 35, 40, 45, 50, 60, 120 e
300 segundos). Isso não foi desenhado, foi acumulado. Com uma chamada só, passa
a ser **um** intervalo, e ele pode ser mais folgado: 30 segundos numa chamada
leve custa menos que 300 segundos baixando `envase_records` inteiro.

### 4.4 A TV precisa dizer quando os dados são

Com números prontos fica mais fácil ficar com dado velho sem perceber. A TV
tem de mostrar "atualizado às HH:MM" e **avisar quando a atualização falha** —
é a mesma regra que o item (e) da V1 colocou no menu, no lugar do `catch {}`.

---

## 5. Meta de tráfego, e como medir

### 5.1 A meta

| | Hoje (projetado, volume Base44) | Meta |
|---|---|---|
| `tv/Televisao` | 18,0 req/min · 35,8 MB/min | **≤ 2 req/min · ≤ 50 KB/min** |
| `tv/TelevisaoEmpilha` | 17,6 req/min · 3,3 MB/min | **≤ 2 req/min · ≤ 50 KB/min** |
| `tv/Painel` | 12,3 req/min · 10,4 MB/min | **≤ 2 req/min · ≤ 50 KB/min** |
| **3 TVs somadas** | ~49 MB/min · ~71 GB/dia | **≤ 150 KB/min · ≤ 220 MB/dia** |

As 2 requisições por minuto são: a chamada do painel mais a renovação de
sessão. Os 50 KB/min saem do tamanho de uma linha de indicadores (algumas
centenas de bytes) vezes a frequência, com folga larga.

**O que a meta realmente diz:** o tráfego passa a ser **constante**, em vez de
crescer a cada registro lançado. É isso que importa, mais que o número.

### 5.2 Como vai ser medido

Com o instrumento que já existe, `scripts/medir-trafego-tv.mjs`, que conta
requisições e bytes por tabela a partir das respostas do navegador.

Três cuidados, aprendidos nas medições anteriores:

1. **Medir com dado, não com banco vazio.** Foi o que invalidou a medição de
   bytes deste documento. O ensaio precisa de um banco local carregado no
   volume projetado — `scripts/backup/gerar-restore-local.mjs` já faz isso.
2. **Medir antes e depois no mesmo banco e na mesma sessão.** Comparar medições
   de dias diferentes não vale: já cometi esse erro comparando capturas feitas
   com 4 dias de intervalo.
3. **Rodar um controle.** Duas medições do **mesmo** código, para saber o ruído
   do instrumento antes de atribuir qualquer diferença à mudança. Nas telas de
   TV isso importa: elas têm relógio e atualizam sozinhas.

### 5.3 O que não entra nesta meta

- **Tamanho do bundle.** É outro assunto, e o código já foi dividido em
  pedaços (1973 → 607 KB no pedaço compartilhado).
- **Tráfego do admin navegando.** Sessão curta, não fica aberta o dia todo. A
  meta é para as telas que ficam ligadas.

---

## 6. O que este documento não decide

- **Se a Etapa 2 acontece antes ou depois do go-live.** A prioridade é do dono.
  Registro só que o problema cresce com o uso, não de uma vez.
- **O limite de tráfego do plano.** O dono confere no painel do Supabase; aqui
  está o consumo para comparar.
- **As faixas do checklist.** Dependem da decisão de Qualidade (critério A ou
  B), que é pré-requisito do go-live.
- **Nomes das funções.** Seguem o padrão em português do resto do código; se a
  preferência for inglês, é renomear.

---

## 7. Execução — 19/10/2026 (banco LOCAL; produção intocada)

### 7.1 O que foi feito

| Passo | Migration (nova, idempotente) | Substitui |
|---|---|---|
| 1 | `20261019000001_painel_televisao_empilha.sql` | 4 consultas a cada 10–60 s em `/TelevisaoEmpilha` |
| 2 | `20261019000002_painel_televisao.sql` | 11 consultas, oito intervalos, em `/Televisao` |
| 3 | `20261019000003_painel_geral.sql` | 16 consultas com teto em `/Painel` |

As três funções: `STABLE`, **sem** `SECURITY DEFINER` (o RLS vale), `search_path`
fixo, `EXECUTE` só para `authenticated` (anon e service_role recusados, provado),
"hoje" e "semana" de Brasília. Cada migration cria os índices que a função usa
— o banco não tinha nenhum índice além das chaves primárias e dos UNIQUE.

No navegador: um intervalo só (30 s, `usePainelTV`); "atualizado às HH:MM" e
"Sem atualizar desde HH:MM" quando a busca falha, mantendo o último painel;
e um **recuo**: se a função não existe no banco (o código pode subir antes da
migration), a tela calcula o mesmo painel com consultas **filtradas por dia**
(`src/lib/painel*.js`). O recuo é exigido igual à RPC, objeto inteiro.

### 7.2 Tráfego — medido, mesma sessão, mesmo banco, com controle

Banco local carregado por `scripts/semear-volume.mjs` no volume da Base44. Base
medida num worktree limpo do `main` (porta 5174), depois na mesma sessão. Regime
= depois de 20 s assentando. Controle (o mesmo código antigo medido duas vezes):
diferença < 0,5% nas três telas.

| Tela | Antes | Depois | Redução |
|---|---|---|---|
| `/Televisao` | 20,9 req/min · 9.449 KB/min | 1,8 req/min · 28,1 KB/min | −91% · −99,7% |
| `/TelevisaoEmpilha` | 16,2 · 1.928 | 1,8 · 5,2 | −89% · −99,7% |
| `/Painel` | 6,0 · 211,8 | 1,8 · 10,3 | −70% · −95% |
| **3 telas** | **43,1 req/min · 11,6 MB/min** | **5,4 req/min · 43,6 KB/min** | **−87% · −99,6%** |

As três ficam dentro da meta do §5.1 (≤ 2 req/min, ≤ 50 KB/min por tela). E o
que importa mais que o número: o tráfego **não cresce mais com o histórico** — o
painel tem o tamanho do dia, não da tabela.

Fora da conta: `operators` a cada 30 min (fotos; a URL assinada vale 24 h) e
`sap_pedidos` a cada 10 min na `/Televisao`.

### 7.3 Correções que vieram junto — declaradas, cada uma com antes × depois no teste

As funções reproduzem as regras das telas, menos onde a regra estava errada. Nada
disso foi escondido: cada teste imprime o valor que a tela antiga mostrava ao lado
do novo.

| Tela | Defeito | Efeito no volume carregado |
|---|---|---|
| Empilha | dia filtrado dentro das 200 linhas mais recentes | mostrava **0 de 12** linhas do dia |
| Empilha | anel lia `total`, o `MetaTV` lê `meta` (PR #24) | anel sempre em **0%** |
| Televisao | operações em andamento dentro das 100 mais recentes | envase **0 de 20**, check-out **0 de 11** |
| Televisao | "pendentes" do check-out era o total do dia | rodapé dizia 31 pendentes; são 21 |
| Televisao | anel do check-out contava concluídos duas vezes | "41 no dia"; são 31 |
| Televisao | "lançados" contava duas vezes o Bio pronto | 31; são 23 |
| Painel | contagens dentro de tetos de 100/50 | assinaturas pendentes **120**; são 2.996 |
| Painel | "hoje" do checklist em UTC | checklist das 22:30 de ontem contava como hoje |
| Painel | limpezas da semana incluíam as semanas seguintes | 30; são 14 |
| Painel | pílula "N ativo(s)" contava depois do corte de 4 | 4; são 20 |
| Painel | participante do recebimento: `operador_nome` não existe | nome nunca aparecia |
| Painel | linha da empilhadeira: `numero_linha`/`descricao` não existem | todo cartão dizia "Linha" |

### 7.4 Provas

| Script | O que prova |
|---|---|
| `test-painel-empilha.mjs` | 6 indicadores iguais à fórmula da tela, nenhum zerado; recuo idêntico; linha crítica ao vivo; quem executa |
| `test-painel-televisao.mjs` | 23 indicadores iguais, nenhum zerado; 4 correções com antes × depois; parada ativa nos dois valores |
| `test-painel-geral.mjs` | como TV **e** como admin: 25 iguais, 4 diferenças só por correção declarada; fuso das 22:30 |
| `test-tv-paineis-ui.mjs` | Playwright nas 3 telas: com a função, **sem** a função (recuo) e com a rede caindo |
| `test-tv-layout.mjs` | 228/228 com o volume carregado; 116/116 com o banco sem ele (0, 1 e 12 operações de verdade) |
| mutantes | 7 mutações nas funções, todas pegas; anel com o defeito de volta, pego |

### 7.5 O que falta

- **Aplicar em produção** as migrations (as três daqui e as duas da seção 8) — só com autorização escrita do
  dono. Até lá o código publicado roda no recuo, que é correto mas não economiza
  o tráfego. O tráfego do recuo **não foi medido**; ele lê só o dia, a semana e
  o mês (e só os produtos desses códigos), então é limitado, mas maior que o
  da RPC.
- O PR #11 (fuso) tem migration `20261013000001`, **anterior** a estas. Se for
  aplicado depois delas, o `supabase db push` vai exigir `--include-all`.

---

## 8. Passos 4 e 5 — telas de admin (19/10/2026, banco LOCAL)

### 8.1 O que foi feito

| Passo | Mudança | Tela |
|---|---|---|
| 4 | `20261019000004_indicadores_empilhadeira.sql` — `indicadores_empilhadeira(de, ate)` | `/IndicadoresEmpilha` e aba "Indicadores" de `/Empilhadeira` |
| 4 | `20261019000005_indicadores_recebimento.sql` — `indicadores_recebimento(de, ate)` | `/IndicadoresRecebimento` |
| 5 | **sem migration**: o Dashboard busca só a faixa de datas que os filtros pedem | `/Dashboard` |

As contas da empilhadeira saíram de dentro do `BlocosIndicadores.jsx` para
`src/lib/indicadoresEmpilha.js` (o componente agora só desenha); as do
recebimento, para `src/lib/indicadoresRecebimento.js`. Essas funções são o recuo
e a referência de paridade, como nas TVs. A `/Empilhadeira` tinha uma **terceira**
cópia das contas, calculada a cada render e nunca exibida — removida.

**O checklist ficou no navegador de propósito** (§2.6): as faixas de nota moram em
`src/lib/checklist.js` e copiá-las para o SQL criaria duas verdades. Ele passou a
buscar só o período, em vez dos 500 checklists mais recentes.

**Por que o passo 5 não virou função SQL.** O Dashboard tem cinco componentes de
gráfico, exportação para Excel e regras de filtro que divergem entre envase e
check-out (no envase, início e fim só valem com um mês escolhido; no check-out,
sempre). Levar tudo para o banco exigiria reescrever os cinco componentes e
decidir qual regra vale — decisão do dono, não minha. Em vez disso, o servidor
devolve a **menor faixa que contém** tudo o que o filtro do navegador deixaria
passar (`src/lib/faixaDashboard.js`), e o filtro de sempre roda em cima dela: os
gráficos recebem **as mesmas linhas**, provado por combinação de filtros.

### 8.2 Tráfego — por abertura de tela, build de produção nos dois lados

| Tela | Antes | Depois |
|---|---|---|
| `/IndicadoresEmpilha` | 13 req · 3.222 KB | 6 req · 4,2 KB (−99,9%) |
| `/IndicadoresRecebimento` | 9 req · 256 KB | 7 req · 14,1 KB (−94%) |
| `/Dashboard` | 15 req · 4.961 KB | 11 req · 400 KB (−92%) |

Telas de admin não atualizam sozinhas; o custo é por abertura (e por foco de
janela). A aba "Indicadores" da `/Empilhadeira` não foi medida à parte: a página
continua lendo as tabelas para as outras abas.

### 8.3 Correções declaradas

| Tela | Correção |
|---|---|
| Indicadores da empilhadeira | a aba da `/Empilhadeira` usava a PRIMEIRA empilhadeira da lista para o turno; agora a ATIVA, como a página |
| Indicadores da empilhadeira | parada sem tipo aparecia na pizza como "null"; agora "Sem tipo" |
| Indicadores da empilhadeira | período invertido derrubava a tela; agora devolve vazio |
| Indicadores (os dois) | desempates de ranking e fatias em ordem alfabética, em vez da ordem de chegada |
| Indicadores de recebimento | tempo médio por tipo omitia **"Nacional"**; entra |
| Indicadores de recebimento | checklists limitados aos 500 mais recentes; agora o período |

### 8.4 Provas

| Script | O que prova |
|---|---|
| `test-indicadores-empilha.mjs` | RPC = recuo (objeto inteiro) em 6 períodos, incluindo vazio e invertido; recuo = conta antiga em 20 indicadores; nenhum zerado em 30 dias; 2 mutantes pegos |
| `test-indicadores-recebimento.mjs` | o mesmo, 16 indicadores; "Nacional" presente; 2 mutantes pegos |
| `test-indicadores-ui.mjs` | Playwright: as 3 telas, Hoje e Mês, com a função e sem ela — números na tela = RPC; nenhuma tabela lida sem filtro de período |
| `test-dashboard-faixa.mjs` | 8 combinações de filtro do Dashboard e 3 períodos da limpeza: mesmas linhas da tabela inteira |

A carga de volume ganhou paradas (com e sem tipo, com `tempo_total` em três
formatos), ajudantes (inclusive `"nenhum"`), tempos e cancelamentos de
recebimento — sem eles, metade desses indicadores compararia zero com zero.

---

## 9. Metas diárias (Bloco 2b) — 19/10/2026, banco LOCAL

### 9.1 O que o dono decidiu

| Pergunta | Decisão |
|---|---|
| O que a meta do envase conta | **as duas coisas**: unidades produzidas **e** envases concluídos |
| Por sala ou da fábrica | **uma por sala** (Bio e Industrial) |
| Quais módulos têm meta | **envase, check-out e empilhadeira** |
| Como muda no tempo | **valor fixo com histórico**: vale a partir de uma data, até ser trocado |

### 9.2 O que foi feito

- Migration `20261019000006_metas_diarias.sql`: tabela `metas_diarias` (uma linha por
  item e data de início; CHECK de item/sala/valor; índice único com
  `NULLS NOT DISTINCT`), função `metas_do_dia(dia)` e os dois painéis das TVs
  recriados com a meta e o realizado do envase por sala — **só esses acréscimos**.
- **RLS:** qualquer conta logada lê (as TVs precisam); só admin escreve; anon nada.
  **O histórico é imutável no banco:** meta que já valeu em dia passado não se
  altera nem se apaga, nem pelo admin. Hoje e o futuro podem ser corrigidos.
- Tela `/Metas` (só admin, menu "Cadastros"): o que vale hoje, lançar/trocar, histórico.
- TVs: com meta, o anel mede o realizado contra ela; **sem meta, nada muda** — o texto
  é idêntico ao de antes (provado). No envase, o anel soma só as salas que **têm**
  meta, e a legenda diz qual sala está sem meta. A pílula "Produção de hoje" mostra
  "% da meta de N un.".
- Recuo: sem a função/tabela no banco, as telas calculam o mesmo (sem meta, se a
  tabela não existir).

### 9.3 Provas

| Script | O que prova |
|---|---|
| `test-metas.mjs` | JWT real: TV e operador leem e não escrevem; anon não lê; admin lança; CHECKs e duplicidade recusados; vigência (hoje × amanhã); histórico imutável até para o admin; `metas_do_dia` = regra do navegador |
| `test-meta-na-tela.mjs` | sem meta, anel e legenda idênticos aos de antes; só uma sala com meta; acima de 100% |
| `test-metas-ui.mjs` | Playwright: admin lança pela tela, a TV mostra, admin apaga; operador não abre `/Metas` |
| `test-tv-layout.mjs` | 232/232 com as legendas de meta, inclusive em 800×395 |

### 9.4 Não decidido (fica para o dono)

- **Alerta de ritmo** ("abaixo do esperado para este horário") exige saber o horário
  do turno de cada módulo. Não foi inventado: a TV mostra % da meta, sem julgar o ritmo.
