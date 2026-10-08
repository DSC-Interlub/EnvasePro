# Auditoria para a versão 2 — EnvasePro

Levantamento do que existe hoje, com número medido e arquivo:linha. **Nada foi
implementado.** Nenhuma mudança em código de produto, banco ou produção.

**Como foi medido.** Banco local com os dados reais restaurados do backup de
08/10 (1.599 produtos, 27 operadores, 61 envases, 14 itens de check-out).
111 capturas de tela em 3 larguras — celular 390, tablet 820, desktop 1440 —
nomeadas `<largura>_<papel>_<tela>.png`. As **medições** das 111 estão
versionadas em `docs/auditoria/medidas.json` e `desempenho.json`.

As **imagens não entram no repositório**: são 26 MB que ficariam no histórico
do git para sempre, e o valor delas é de consulta pontual. Ficam na pasta de
backups, fora do repositório:
`C:\Users\kauan.pereira\EnvasePro-backups\auditoria-v2-prints\`.
Para refazê-las: `node scripts/auditoria-v2-capturas.js`.

As capturas são de página inteira, exceto as três de Produtos: ali a página
inteira dava **12 MB de imagem**, porque a tela desenha as 1.599 linhas de uma
vez, sem paginação. O tamanho do arquivo virou, ele mesmo, evidência do
problema; essas três foram refeitas em tamanho de tela. Desempenho
medido contra a **build de produção**, não contra o servidor de desenvolvimento:
em desenvolvimento o Vite serve cada módulo solto e a contagem de requisições
não tem relação com o que o usuário vê.

**Observação sobre o item 8 do pedido:** o arquivo `docs/V2.md` **não existe**
no repositório. Usei como base as fases da seção 6 do `CLAUDE.md`.

---

## Resumo: os 8 achados que mais pesam

| # | Achado | Número medido |
|---|---|---|
| 1 | Critério de aprovação do checklist é rígido e está repetido em 6 lugares | limiar ≥ 80 numa escala que vai a 90; nenhum do histórico passou de 70 |
| 2 | O peso de toda tela é o bundle, não o dado | ~2,1 MB fixos em qualquer tela e papel |
| 3 | Interface inviável no celular | 89% dos alvos de toque abaixo de 48 px |
| 4 | O menu do **admin** baixa 7 tabelas a cada 60 s | `Layout.jsx:49-85`; operador e TV não pagam isso |
| 5 | Um único pedaço de JavaScript | 1.973 KB, sem divisão por rota |
| 6 | 11 telas estouram a largura no celular | 18 de 111 capturas |
| 7 | Sem design system | 2.522 cores literais, 186 tons distintos |
| 8 | Busca de 1.599 produtos no navegador | `Produtos.jsx:35-37` |

---

## 1. UX por fluxo

### Como a busca funciona hoje — vale para todas as telas

Nenhuma busca consulta o banco. Todas baixam a tabela inteira e filtram em
memória: `Produtos.jsx:35-37` faz
`p.nome?.toLowerCase().includes(searchTerm.toLowerCase())` sobre os 1.599
produtos. O mesmo padrão está em Embalagens, Notas Fiscais e Registros.

Três consequências: o celular baixa 2,6 MB para procurar um produto; quem pode
ler, lê **tudo** (não dá para esconder parte do catálogo); e não há busca por
pedaço do meio da palavra com acento normalizado.

**Não existe leitura de código de barras ou QR.** Nenhuma biblioteca no
`package.json`, nenhuma referência no código. Num envase, o código do produto é
digitado à mão.

### Campos por tarefa

| Formulário | Campos | Arquivo |
|---|---|---|
| Checklist de recebimento | 13 | `src/pages/NovoChecklist.jsx` |
| Envase | 10 | `src/components/registro/EnvaseForm.jsx` |
| Iniciar linha de empilhadeira | 9 | `src/components/empilhadeira/EmpilhaLinhaCard.jsx` |
| Item de check-out | 8 | `src/components/checkout/CheckoutItemCard.jsx` |
| Cadastro de operador | 5 | `src/components/cadastros/OperatorForm.jsx` |

### Envase

Entrar → escolher quem é você no modal → Novo Registro → preencher 10 campos →
salvar. O autosave existe e há trava contra envio duplo (`EnvaseForm`).

**O que poderia ser lembrado e não é:** o último produto envasado, a última
sala, o último múltiplo. Quem envasa o mesmo produto o dia todo redigita tudo a
cada registro.

### Check-out

O operador é escolhido num `Select` com a lista completa. Hoje são 27
operadores; com homônimos a lista fica ambígua — e **há 13 operadores com o
mesmo nome** no backup. A correção de 07/10 faz a tela enviar o identificador
junto, mas a **lista continua mostrando nomes repetidos**, sem matrícula ou
sala para desempatar.

### Empilhadeira

Iniciar linha abre um modal com dois `Select` (empilhador e ajudante). O
ajudante usa o valor `"nenhum"` como sentinela, convertido para nulo no envio.
Funciona, mas é um valor mágico que precisa ser tratado em dois lugares.

### Recebimento / checklist / NF

O checklist tem 13 campos e exige observação quando qualquer resposta é "Não" —
regra boa, implementada no `superRefine` do Zod. A nota é calculada por trigger
no banco, o que é correto. **Mas o limiar de aprovação está errado** (ver
seção 4).

### Limpeza

Não tem tela própria: é um bloco dentro do Dashboard
(`src/components/dashboard/BlocoLimpeza.jsx`). Quem procura "Limpeza" no menu
não encontra.

### TVs

Funcionam e atualizam sozinhas. Desde 08/10 exigem sessão.

### Estados de carregando, vazio, erro e sucesso

Há tratamento de lista vazia em vários lugares — por exemplo
`IndicadoresChecklist.jsx:22` devolve "Nenhum checklist no período" antes de
calcular, o que evita divisão por zero. **Mas o erro costuma ser silencioso:**
`Layout.jsx:81` usa `catch {}`, que descarta a falha sem avisar ninguém. Se os
contadores do menu pararem de funcionar, nada indica isso na tela.

### Conexão ruim

**NÃO VERIFIQUEI.** Não testei com rede lenta ou intermitente. Pelo código, o
risco é alto: cada tela baixa megabytes e não há indicação de progresso nem
repetição automática.

### Ganhos rápidos (menos de 1 dia cada)

1. Mostrar matrícula e sala junto do nome nos `Select` de operador.
2. Lembrar último produto, sala e múltiplo no envase.
3. Trocar `catch {}` do `Layout.jsx:81` por um aviso visível.
4. Esconder do menu, para o operador, as telas em que ele não pode escrever.
5. Aumentar os alvos de toque das listas (ver seção 2).

### Redesenhos maiores

1. Busca no banco, com paginação (resolve 2, 3 e 8 do resumo).
2. Leitura de código de barras para produto e lote.
3. Tela de limpeza própria.
4. Modo de operação para celular, pensado para a mão e não para o mouse.

---

## 2. Interface e design

### Consistência

**2.522 ocorrências de cor literal, em 186 tons distintos.** Não há tokens nem
tema: a cor é escolhida em cada arquivo. Mudar o azul da marca exige varrer
2.522 pontos.

### Modo escuro

Configurado em `tailwind.config.js:3` (`darkMode: ["class"]`), mas **existe
exatamente 1 classe `dark:` em todo o código**. Está declarado e não
implementado — nas TVs, que ficam ligadas o dia inteiro, isso pesa.

### Alvos de toque

Medido com o Playwright a 390 px de largura, contando todo botão, link e caixa
visível:

**4.224 de 4.721 alvos abaixo de 48 px — 89%.**

| Tela | Pequenos / total |
|---|---|
| Produtos | 3.203 / 3.203 (todos) |
| Registros | 242 / 290 |
| Embalagens | 108 / 108 (todos) |
| Operadores | 56 / 104 |

Em Produtos, Embalagens e Registros **nenhum** alvo atinge o mínimo. São listas
com dois botões por linha; com 1.599 linhas, são milhares de alvos pequenos
lado a lado.

### Responsividade

**18 das 111 capturas estouram a largura** — 14 no celular, 4 no tablet.
11 telas no celular: Registros, Empilhadeira, EmpilhadeiraConfig,
IndicadoresEmpilha, IndicadoresRecebimento, ChecklistRecebimento, Produtos,
Embalagens, Operadores, GerenciarUsuarios, ImportarCategorias.

O padrão é tabela larga que não vira cartão. Compare
`celular_admin_Produtos.png` com `desktop_admin_Produtos.png`.

### Acessibilidade

- **59 campos `<Input>` sem `id` nem `aria-label`** — leitor de tela não
  anuncia o que é.
- 1 `<img>` sem `alt`.
- Contraste e navegação por teclado: **NÃO VERIFIQUEI** (exigiria ferramenta
  dedicada).

### Legibilidade das TVs

As TVs usam fonte grande e bom contraste (`desktop_tv_Televisao.png`). **Não dá
para afirmar que são legíveis à distância** sem medir na fábrica, com a
distância e a resolução reais.

---

## 3. Navegação e arquitetura de informação

### Papéis

Só **5 rotas** são protegidas por `RotaProtegidaAdmin`. As telas de catálogo
**não são**:

| Tela | Protegida? | Operador consegue escrever? |
|---|---|---|
| Produtos | **não** | não (RLS barra) |
| Embalagens | **não** | não |
| Operadores | **não** | não |
| ImportarProdutos / Embalagens / Categorias | **não** | não |
| GerenciarUsuarios | sim | — |

> **CORREÇÃO.** A primeira versão dizia que "o operador vê catálogo e botões de
> editar, e a interface mente". **Está errado:** essas telas **não aparecem no
> menu do operador** — `Layout.jsx` filtra os itens por papel. Só são
> alcançáveis digitando a URL, que é o que o teste fez.

Medido: das 10 telas abertas **por URL** como operador, só `GerenciarUsuarios`
barrou. As demais renderizam.

Na prática do dia a dia isso quase não aparece, porque o operador não tem o
link. Mas continua sendo uma lacuna de defesa em profundidade: quem souber a
URL abre a tela de catálogo, vê a lista inteira e vê botões de editar que vão
falhar. **O dado está protegido pelo RLS**; o que falta é a rota recusar antes
de desenhar a tela. É o item (d) da fase V1.

### Página morta

`src/pages/GuiaCapturas.jsx` tem **928 linhas** e **zero referências** em
`Layout.jsx` e `App.jsx`. Não está no menu, mas é alcançável pela URL — entra
no bundle de todo mundo.

### Código repetido

| Arquivo | Linhas |
|---|---|
| `src/pages/Televisao.jsx` | 690 |
| `src/pages/Dashboard.jsx` | 667 |
| `src/pages/Painel.jsx` | 568 |
| `src/pages/IndicadoresEmpilha.jsx` | 438 |
| `src/pages/TelevisaoEmpilha.jsx` | 284 |
| `src/components/checklist/IndicadoresChecklist.jsx` | 271 |
| `src/pages/IndicadoresRecebimento.jsx` | 255 |

As três telas de TV e o Dashboard recalculam os mesmos números cada uma do seu
jeito. É daí que vem o risco de duas telas discordarem sobre o mesmo indicador.

---

## 4. Engenharia de indicadores

### Inventário

Todos os indicadores são calculados **no navegador**, em JavaScript, depois de
baixar as tabelas inteiras. Nenhum está no banco.

| Indicador | Onde | Fórmula como está escrita | Fonte |
|---|---|---|---|
| Produção total | `Dashboard.jsx:366` | `reduce((s,r) => s + (r.quantidade_produzida \|\| 0), 0)` | `envase_records` |
| Produção de hoje | `Dashboard.jsx:367` | idem, sobre `todayRecords` | `envase_records` |
| Nota média do checklist | `IndicadoresChecklist.jsx:32` | `round(soma(nota_final) / total)` | `checklist_recebimentos` |
| Aprovados | `IndicadoresChecklist.jsx:33` | `nota_final >= 80` | idem |
| Atenção | `IndicadoresChecklist.jsx:34` | `0 <= nota_final < 80` | idem |
| Reprovados | `IndicadoresChecklist.jsx:35` | `nota_final < 0` | idem |
| % Sim/Não/N/A por pergunta | `IndicadoresChecklist.jsx:83-85` | `round(x / total * 100)` | idem |
| Linhas por tipo | `IndicadoresEmpilha.jsx:95-97` | `filter(tipo_linha === X).length` | `empilha_linhas` |
| Concluídas / pendentes | `IndicadoresEmpilha.jsx:98-99` | `length - concluídas` | idem |
| Tempo médio por linha | `IndicadoresEmpilha.jsx:104` | média dos minutos | idem |
| Tempo parado total | `IndicadoresEmpilha.jsx:152` | `reduce(+parseInt(tempo_total))` | `empilhadeira_paradas` |
| Tempo médio de recebimento | `IndicadoresRecebimento.jsx:69-70` | média de `tempo_produtivo_minutos` dos concluídos | `recebimentos` |
| Tempo pausado total | `IndicadoresRecebimento.jsx:71` | soma | idem |

Filtro de período: cada tela tem o seu, em estado local. **Não há comparação
com meta em lugar nenhum** — não existe tabela de metas.

### Critério de aprovação do checklist — rígido, e repetido em 6 lugares

> **CORREÇÃO.** A primeira versão deste relatório afirmava que "nenhum
> checklist pode ser Aprovado". **Isso estava errado.** Com 9 "Sim" a nota é
> 90, e com 8 "Sim" + 1 "N/A" é 80 — as duas aprovam, e a tela mostra
> "Aprovado" corretamente nesses casos. O erro foi concluir impossibilidade a
> partir de um limite que o histórico não alcançou.

A nota é calculada pela trigger `calcular_nota_checklist`: **9 perguntas**,
cada "Sim" vale **+10**, cada "Não" **−10**, "N/A" **0**. A faixa é de **−90 a
+90**, de 10 em 10.

O limiar de aprovação é `nota_final >= 80`. Só duas combinações chegam lá:
**9 "Sim"** (90) ou **8 "Sim" + 1 "N/A"** (80). Qualquer "Não", ou dois "N/A",
já tira a aprovação.

**O que está provado:** no histórico real da Base44, `nota_final` vai de **0 a
70** — nenhum dos 36 checklists alcançou 80. Então, nesse período, nenhum foi
aprovado.

**O que NÃO está provado:** que isso seja um defeito. Um critério que exige
quase perfeição pode ser intencional numa inspeção de recebimento. Quem decide
é a Qualidade, não a auditoria.

O ponto de atenção real é outro, e é de desenho: como "N/A" vale 0, um
checklist sem nenhum problema mas com 4 perguntas não aplicáveis tira 50 —
**ser "não aplicável" pesa igual a meio erro**. Se a intenção for medir
conformidade, o natural seria **percentual sobre o aplicável**
(`soma_sim / (total_sim + total_nao)`), ignorando os "N/A". As colunas
`total_sim`, `total_nao`, `soma_sim` e `soma_nao` já existem e já são gravadas
pela trigger.

### A regra ≥ 80 está escrita em 6 lugares

Mudar o critério hoje significa mudar seis arquivos em sincronia. Esquecer um
faz duas telas discordarem sobre o mesmo checklist.

Varri o código: são **7 arquivos e 22 ocorrências** — duas telas a mais do que
as apontadas na revisão.

| Arquivo | Linhas | O que faz |
|---|---|---|
| `src/components/checklist/IndicadoresChecklist.jsx` | 33, 34, 112, 113, 114, 225, 260 | contagem, gráfico, tabela e lista |
| `src/pages/NovoChecklist.jsx` | 181, 182, 486 | cor e rótulo ao preencher |
| `src/pages/ChecklistDetalhe.jsx` | 79, 81, 82 | selo na tela de detalhe |
| `src/components/checklist/ChecklistNotaBadge.jsx` | 5, 12, 14 | selo reutilizável |
| `src/components/recebimento/RecebimentoCard.jsx` | 54, 60 | cor e rótulo no cartão |
| `src/pages/ChecklistRecebimento.jsx` | 125, 129 | nota média e % de conformidade |
| `src/pages/Painel.jsx` | 498, 549 | cor do indicador na TV |

Duas inconsistências que a varredura mostrou, e que só aparecem quando se olha
tudo junto:

- `ChecklistRecebimento.jsx:129` usa **outros limiares** (`>= 80` e `>= 60`),
  mas sobre um **percentual de conformidade**, não sobre a nota. Dois números
  diferentes com a mesma cor verde podem ser lidos como a mesma coisa.
- `Painel.jsx:549` só tem **dois ramos** (`>= 80 ? verde : amarelo`), sem o
  vermelho. Na TV, nota negativa aparece amarela, enquanto em toda outra tela
  aparece vermelha.

É o caso clássico para uma função única, e é o item (a) da fase V1.

### Quanto dado é baixado — medido por papel

> **CORREÇÃO.** A primeira versão media só com admin e apresentava "2 a 3 MB
> por tela" como se valesse para todo mundo. O polling do menu **só roda para
> admin** (`Layout.jsx:51`), então misturar os papéis escondia a causa.
> Remedido com os três papéis, na build de produção:

**Admin**

| Tela | Tempo | Req | Baixado | Tabelas |
|---|---|---|---|---|
| Dashboard | 2.727 ms | 28 | 2.698 KB | 11 |
| Registros | 843 ms | 22 | 2.688 KB | 12 |
| Recebimento | 824 ms | 24 | 2.166 KB | **13** |
| Produtos | 832 ms | 18 | 2.617 KB | 10 |
| NotasFiscais | 781 ms | 17 | 2.135 KB | 10 |

**Operador**

| Tela | Tempo | Req | Baixado | Tabelas |
|---|---|---|---|---|
| Dashboard | 740 ms | 13 | 2.641 KB | 7 |
| Registros | 751 ms | 11 | 2.632 KB | 5 |
| Recebimento | 710 ms | 13 | 2.110 KB | 8 |
| Checkout | 692 ms | 7 | 2.085 KB | 3 |
| NotasFiscais | 661 ms | **6** | 2.079 KB | **2** |

**TV**

| Tela | Tempo | Req | Baixado | Tabelas |
|---|---|---|---|---|
| Televisao | 780 ms | 25 | **3.308 KB** | 12 |
| Painel | 773 ms | 21 | 2.204 KB | **16** |
| TelevisaoEmpilha | 706 ms | 10 | 2.106 KB | 5 |

**O que isso mostra, e que a primeira leitura errou:** o peso em KB é
praticamente **o mesmo para todos (~2,1 MB)**, porque **isso é o bundle**
(1.973 KB de JavaScript + 98 KB de CSS). O que varia por papel é o **número de
tabelas** e de requisições.

Medindo o dado de verdade (o que passa dos ~2,1 MB de bundle):

- NotasFiscais como operador: **~0 KB de dado**, 2 tabelas;
- Dashboard como operador: ~560 KB, 7 tabelas;
- Televisao: **~1,2 MB de dado**, 12 tabelas — a mais pesada, e é a que fica
  ligada o dia todo.

Para o operador, **a tela de Produtos não está nessa lista: ele não a vê no
menu** (ver a seção 3). As tabelas que Produtos consulta e não usa
(`empilhadeira_paradas`, `recebimentos`) vêm do menu do **admin**.

### O menu do admin baixa 7 tabelas a cada 60 segundos

`src/Layout.jsx:51` corta logo na entrada: `if (role !== "admin") return;`.
**Operador e TV não pagam isso.** Para o admin, a cada 60 s, baixa **inteiras**
`EmpilhaLinha`, `EmpilhaOcorrencia`, `EmpilhadeiraParada`,
`EmpilhadeiraConfig`, `LimpezaProgramacao`, `Recebimento` e
`RecebimentoOcorrencia` — só para calcular **6 números** de badge. Os filtros
(`l.status === "Concluído" && !l.assinatura_lider`) rodam no navegador.

Isso roda em **toda tela do admin**, e é por isso que a tela de Produtos
consulta recebimentos. Explica também a diferença medida: 10 a 13 tabelas por
tela como admin, contra 2 a 8 como operador.

Seriam 6 `count(*)` com filtro, ou uma função única no banco. Com o histórico
reimportado (5.884 envases, 7.874 itens de check-out), o custo cresce junto.

### Polling de uma TV

Medido, uma TV aberta por 120 segundos: **30 chamadas, 15 por minuto**.

```
envase_records 8 | checkout_itens 5 | checkout_programacoes 4
empilha_linhas 3 | empilhadeira_paradas 2 | empilha_ocorrencias 2
empilha_programacoes 2 | products 2 | sap_pedidos 1 | operators 1
```

Com 3 TVs ligadas o dia inteiro: **45 requisições por minuto**, ~65 mil por dia,
cada uma trazendo tabela inteira. Mais o menu de cada admin.

### Riscos de erro

| Risco | Situação |
|---|---|
| Divisão por zero | **Protegido** nos pontos que olhei: `IndicadoresChecklist.jsx:22` sai antes se a lista está vazia; `IndicadoresEmpilha.jsx:104` testa `length > 0` |
| Fuso horário e datas | **Tratado** desde 08/10 pelo `src/lib/datas.js`, que força horário local. Antes, `new Date('2026-10-07')` era lido como UTC e, em fuso negativo, a data voltava um dia |
| Arredondamento | Todo indicador usa `Math.round` no fim. Médias de tempo em minutos inteiros: ok para minutos, perde precisão se virar hora |
| Mesma definição em telas diferentes | **Risco real.** Dashboard, Televisao e Painel recalculam a produção cada um por si |
| Dados truncados por paginação | **Protegido.** O adaptador pagina de 1.000 em 1.000 até o fim (`base44Client.js`) |
| `nota_final` de −90 a +90 | **Não respeitado pela interface** — ver o achado grave acima |
| Cancelados e pendentes | `IndicadoresRecebimento.jsx:48` só conta os `Concluído` com tempo preenchido no tempo médio, o que é correto. Mas `porStatus` conta todos, então dois gráficos da mesma tela usam universos diferentes sem dizer |

### O que falta para uma operação de envase

**Dá para fazer com as colunas de hoje:**

| Indicador | Como |
|---|---|
| Produtividade por operador | `envase_records` agrupado por `operator_id` |
| Produtividade por sala | agrupado por `sala` |
| Tempo de ciclo do envase | `hora_inicio` e `hora_termino` já existem |
| Tempo por embalagem | coluna `tempo_por_embalagem` já existe |
| Paradas e tempo parado | `empilhadeira_paradas.tempo_total` |
| Aderência ao programado | `checkout_itens` concluídos ÷ programados |
| Atraso de check-out | `finalizado_fora_do_prazo` e `data_finalizacao_real` já existem |
| Qualidade por fornecedor | `IndicadoresChecklist.jsx:68` já agrupa |

**Exige dado novo:**

| Indicador | O que falta |
|---|---|
| Perdas e rendimento | quantidade planejada vs. produzida, e motivo da perda |
| Disponibilidade (OEE) | tempo disponível planejado por turno |
| Metas e alertas | **não existe tabela de metas** |
| Produtividade por turno | `envase_records` tem `turno`? **NÃO VERIFIQUEI** se é preenchido de forma confiável |

### Dicionário de KPIs proposto

| Nome | Pergunta | Fórmula | Fonte | Público |
|---|---|---|---|---|
| Produção do dia | Quanto saiu hoje? | `sum(quantidade_produzida)` do dia | `envase_records` | TV, operador |
| Produtividade por operador | Quem produziu quanto? | `sum(quantidade_produzida)` ÷ horas | `envase_records` | admin |
| Tempo de ciclo | Quanto demora um envase? | média de `hora_termino − hora_inicio` | `envase_records` | admin |
| Aderência ao programado | Cumprimos o plano? | concluídos ÷ programados | `checkout_itens` | admin, TV |
| Atraso de check-out | Quanto saiu atrasado? | `count(finalizado_fora_do_prazo)` ÷ total | `checkout_itens` | admin |
| Disponibilidade da empilhadeira | Quanto ficou parada? | 1 − (parado ÷ turno) | `empilhadeira_paradas` | admin, TV |
| Qualidade de recebimento | Fornecedor entrega bem? | **percentual sobre o aplicável**, não o valor absoluto | `checklist_recebimentos` | admin |

### Mover os cálculos para o Postgres

Cada indicador vira uma **view `security_invoker = true`** — assim o RLS do
usuário continua valendo, em vez de a view virar porta dos fundos — ou uma
**função `STABLE` com `SET search_path = public, pg_temp`**, no mesmo padrão
que `is_admin` e as `protect_*` já usam.

`GRANT` mínimo: `SELECT` para `authenticated`, nada para `anon` (que hoje não
tem privilégio algum e assim deve continuar).

Índices que faltam, pelos filtros que as telas usam: `envase_records(data)`,
`envase_records(operator_id)`, `checkout_itens(programacao_id, status)`,
`empilha_linhas(programacao_id, status)`, `recebimentos(status, data)`.
**NÃO VERIFIQUEI** quais índices já existem.

Ganho esperado: a TV passaria de 15 requisições por minuto com tabelas inteiras
para uma chamada trazendo números prontos.

---

## 5. Funcionalidades, por impacto × esforço × risco

| # | O quê | Impacto | Esforço | Risco |
|---|---|---|---|---|
| 1 | Função única do critério do checklist (6 lugares hoje) | **alto** | baixo | baixo |
| 2 | Trocar os badges do menu por contagens no banco | alto | baixo | baixo |
| 3 | Busca no banco com paginação | alto | médio | baixo |
| 4 | Dividir o JavaScript por rota | alto | baixo | baixo |
| 5 | Esconder do operador as telas que ele não usa | médio | baixo | baixo |
| 6 | Views de indicadores no Postgres | alto | médio | **médio** — view sem `security_invoker` vazaria dado |
| 7 | Listas em cartão no celular, alvos ≥ 48 px | alto | médio | baixo |
| 8 | Leitura de código de barras | alto | médio | baixo |
| 9 | Tabela de metas e alertas | médio | médio | baixo |
| 10 | Tokens de cor e modo escuro | médio | médio | baixo |
| 11 | Uma conta por operador (identidade real) | **alto** | **alto** | **alto** — mexe em RLS, triggers e login |
| 12 | Apagar `GuiaCapturas` | baixo | mínimo | nenhum |

---

## 6. Desempenho

### Bundle

```
index-CSEujXOH.js    1973 KB
index-BIsChyVy.css     98 KB
arquivos .js: 1  -> NAO HA DIVISAO POR ROTA
```

**Um único pedaço de 1,9 MB.** Quem abre a TV baixa o código de importação de
produtos, do checklist e as 928 linhas da página morta.

### Por tela

Já na tabela da seção 4. Resumo: **17 a 32 requisições e 2,1 a 3,3 MB por
tela**, 9 a 16 tabelas consultadas. Tempo até a tela pronta entre **694 e
788 ms** — rápido, mas medido em rede local com Postgres na mesma máquina. Na
fábrica, com 2,6 MB por tela, será bem pior.

### Erros

**Zero erro de console ou rede** nas 111 capturas.

### O 401 intermitente — causa raiz encontrada

> **RECONCILIAÇÃO.** O 401 apareceu no teste de importação da limpeza, não
> apareceu nas 111 capturas, e a primeira versão deste relatório se limitou a
> dizer "segue sem explicação". Investiguei com um teste que reproduz.

`scripts/test-401-intermitente.js` faz ciclos de login seguidos de navegação
imediata — a janela onde a corrida acontece — e, para cada resposta 401,
registra **o cabeçalho `Authorization` que foi enviado**. É o que faltava:
saber se o token foi mandado, e qual.

Reproduziu no primeiro de 12 ciclos, em três requisições:

```
/rest/v1/recebimento_ocorrencias?select=*
  token : JWT role=authenticated sub=22c45e70 expira em 3600s (valido)
  corpo : {"code":"PGRST303","message":"JWT issued at future"}
```

**O token é válido.** Papel certo, usuário certo, uma hora até expirar. O
PostgREST o recusa porque o `iat` do token — o instante em que foi emitido —
está **no futuro em relação ao relógio do PostgREST**.

Ou seja: **não é o aplicativo.** É desvio de relógio entre o contêiner que
emite o token (GoTrue) e o que o valida (PostgREST), no Docker local. O
`PGRST303` existe exatamente para essa condição. Explica tudo o que era
estranho: só acontece nos primeiros segundos após o login, é intermitente
(depende de o desvio passar da tolerância), e **nunca apareceu em produção**,
onde o Supabase mantém os relógios sincronizados.

Também explica por que a correção anterior (`aguardarSessao()` no adaptador)
não resolveu: ela trata de consulta disparada **antes** da sessão existir, que
é um problema real e distinto. Aqui a sessão existe e o token está correto.

**Conclusão: não há o que corrigir no código.** É artefato do ambiente local.
Se incomodar, reiniciar o Docker Desktop ressincroniza os relógios. **O que
NÃO consegui fazer** foi medir o desvio em milissegundos: o contêiner do
PostgREST não tem utilitário de data, e o `date` do Git Bash no Windows não
devolveu epoch confiável. A prova é a mensagem do PostgREST, não a medição.

---

## 7. O que a v2 NÃO pode quebrar

### Regras de negócio

1. `checklist_recebimentos.nota_final` vai de **−90 a +90**. Nunca criar CHECK
   de 0 a 100.
2. `envase_records.sala` é `Bio | Industrial`. `operators.sala` é
   `Bio | Industrial | Ambas`. **"Ambas" só vale para operador.**
3. `empilha_linhas` e `checkout_itens` exigem o **identificador** do operador
   quando o status sai de `Pendente` — não basta o nome.
4. Notas fiscais têm **retenção legal de 5 anos** (`data_expiracao_legal`, que
   é coluna gerada). Arquivo de NF real nunca é apagado.
5. Colunas de protocolo e `created_at` são **imutáveis, inclusive para admin**.
6. As TVs usam `tv-fabrica` com sessão persistente e **não podem cair por
   inatividade**. Só o admin cai, aos 60 minutos.
7. O histórico tem **3 envases com quantidade negativa** (estornos). Decisão
   ainda pendente — ver `docs/GO-LIVE.md`.

### Riscos de regressão nos itens de segurança

| Item | Como a v2 quebraria |
|---|---|
| `anon` sem privilégio | Criar tabela pelo **painel** faz nascer com `arwdDxtm`, devolvendo `TRUNCATE` a `authenticated` |
| Papel só de `user_profiles` | Reintroduzir leitura de `user_metadata.role` em qualquer tela |
| Escrita única da autoria | Trocar o trigger por regra de aplicação |
| Reversão de `Completo` barrada | Fluxo novo de assinatura que não passe pelo trigger |
| `EXECUTE` revogado | Função nova nasce com `EXECUTE` para `PUBLIC` se não for revogado |
| `gerar_protocolo` com allowlist | Sequence nova precisa entrar na lista |
| Buckets privados | Bucket novo nasce **público** |
| Upload com lista permitida | Bucket novo precisa entrar em `BUCKETS_PERMITIDOS` |
| CSP bloqueando | Biblioteca de CDN, estilo embutido ou iframe viram tela quebrada. **Rodar `scripts/test-csp.js` antes de publicar** |
| Mensagens sem vazamento | `error.message` cru de volta à tela |
| Sem SQL injection | Primeiro uso de `.or()`, `.rpc()` ou `.ilike()` com texto digitado |

---

## 8. Priorização

As fases abaixo seguem a seção 6 do `CLAUDE.md`, já que `docs/V2.md` não existe.

**V1 — Corrigir o que está errado** (dias)
1. Função única do critério do checklist, usada nos 6 lugares.
2. Badges do menu por contagem.
3. Dividir o JavaScript por rota.
4. Apagar `GuiaCapturas`.
5. Esconder telas sem permissão.

**V2 — Indicadores no banco** (semanas)
6. Dicionário de KPIs acordado com quem usa.
7. Views `security_invoker` e funções `STABLE`.
8. Índices pelos filtros reais.
9. Telas passam a ler números prontos.

**V3 — Desempenho e mobile** (semanas)
10. Busca no banco com paginação.
11. Listas em cartão, alvos ≥ 48 px.
12. Reduzir o polling das TVs.

**V4 — Operação de chão de fábrica** (meses)
13. Código de barras.
14. Metas e alertas.
15. Perdas e rendimento.

**V5 — Identidade por operador** (meses, maior risco)
16. Uma conta por operador, RLS vira "só o dono edita", triggers simplificam.

Ordem sugerida: **V1 inteira antes de qualquer coisa** — são correções baratas
e de baixo risco, e a do checklist tira de seis arquivos uma regra que precisa
ser decidida uma vez só. Depois V2, porque é o que sustenta V3 e V4.

---

## O que eu não consegui verificar

- **Contraste e navegação por teclado** — exige ferramenta dedicada.
- **Legibilidade das TVs à distância** — exige medir na fábrica.
- **Comportamento com conexão ruim** — não testei com rede lenta.
- **Índices existentes no banco** — não levantei.
- **Se `envase_records.turno` é preenchido de forma confiável.**
- **Número de cliques por tarefa com usuário real** — contei campos e botões no
  código, não observei ninguém usando.
- **O desvio de relógio em milissegundos** entre os contêineres locais — a
  causa do 401 está provada pela mensagem do PostgREST, mas não medi o desvio.
