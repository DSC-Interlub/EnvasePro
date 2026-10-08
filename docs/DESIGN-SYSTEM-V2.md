# Design System V2 — proposta

**Status: proposta. Nada aqui está implementado.** Este documento descreve o que
o sistema usa hoje (medido no código) e o que proponho padronizar na V2. A
decisão de adotar, adiar ou mudar é do dono.

Escrito para quem for implementar a V2 e para quem precisar decidir sobre as
escolhas visuais.

---

## 1. Para quem é o produto

Três telas, três contextos muito diferentes. Tudo neste documento sai daqui.

| Contexto | Aparelho | Distância | Quem usa | Condição |
|---|---|---|---|---|
| **Chão de fábrica** | Tablet compartilhado | ~40 cm | Operadores, revezando | De pé, com luva, possivelmente com a mão suja ou molhada |
| **Escritório** | PC do admin | ~60 cm | Admin / líder | Sentado, mouse e teclado, sessão longa |
| **Mural** | TV 1080p | 3 a 5 m | Todo mundo de passagem | Ninguém interage; só lê |

Três consequências que atravessam o resto:

1. **O tablet manda no tamanho dos alvos.** Um alvo que funciona no mouse não
   funciona no dedo com luva.
2. **A TV não tem interação nenhuma.** Nada de hover, nada de tooltip, nada que
   dependa de clique. O que não dá para ler a 4 metros não deveria estar lá.
3. **O tablet é compartilhado.** A tela precisa deixar claro *quem* está
   registrando, porque a pessoa muda e o aparelho não.

---

## 2. O que existe hoje

Levantado no código em 08/10/2026, não de memória.

### 2.1 Há duas camadas de cor, e só uma é usada

O projeto tem a camada de tokens do shadcn em `src/index.css`
(`--primary`, `--background`, `--destructive`…) e o Tailwind a consome em
`tailwind.config.js`. **Mas `--primary` está em `0 0% 9%`, que é quase preto.**
O azul da marca não está nessa camada: ele aparece escrito à mão, em
`bg-blue-600` / `bg-blue-700`, **110 vezes** espalhadas pelas telas.

Resultado prático: trocar a cor da marca hoje é um "localizar e substituir" em
110 lugares, e o token que existe justamente para isso não tem efeito nenhum.
**Esta é a correção mais valiosa do documento inteiro.**

### 2.2 O que as telas realmente usam

Contagem de ocorrências nas classes do `src/`:

| Papel | Mais usado | Vezes |
|---|---|---|
| Texto secundário | `text-slate-500` | 244 |
| Borda | `border-slate-200` | 164 |
| Texto apagado | `text-slate-400` | 131 |
| Texto principal | `text-slate-900` | 102 |
| Ação primária | `bg-blue-600` | 58 |
| Erro / negativo | `text-red-700`, `bg-red-50` | 48 / 42 |
| Positivo | `text-green-700`, `bg-green-100` | 45 / 33 |
| Atenção | `text-orange-700`, `text-amber-600` | 30 / 23 |

Tipografia: `text-xs` (437) e `text-sm` (331) dominam — ou seja, **a maior parte
do texto do sistema está em 12px ou 14px**, o que é pequeno para o tablet e
inviável para a TV. Há ainda 68 usos de `text-[10px]` e 11 de `text-[9px]`.

Raios: `rounded-lg` (115), `rounded-full` (76), `rounded-xl` (43),
`rounded-md` (40), `rounded-sm` (19), `rounded-2xl` (6) — seis valores para o
mesmo papel.

Sombras: `shadow-lg` (87), `shadow-sm` (37), `shadow-md` (29), `shadow-xl` (8).

### 2.3 Os alvos de toque padrão são pequenos

Em `src/components/ui/button.jsx`:

| Tamanho | Altura | Em pixels |
|---|---|---|
| `default` | `h-9` | 36 px |
| `sm` | `h-8` | 32 px |
| `lg` | `h-10` | 40 px |
| `icon` | `h-9 w-9` | 36 × 36 px |

**Nenhum chega a 48 px.** Foi por isso que as correções V1 (f) e (g) tiveram de
escrever `h-12` e `min-h-[48px]` caso a caso, em vez de simplesmente usar o
botão. Enquanto o padrão for 36 px, cada tela nova nasce pequena e alguém
precisa lembrar de corrigir.

### 2.4 O tema escuro está configurado e não é usado

`tailwind.config.js` tem `darkMode: ["class"]` e `src/index.css` tem o bloco
`.dark` completo. Mas há **uma única** classe `dark:` em todo o `src/`, e nada
alterna a classe no `<html>`. O tema escuro existe no papel.

---

## 3. Tokens propostos

A regra que sustenta tudo: **nenhuma tela escreve uma cor; ela escreve um
papel.** `bg-primary`, não `bg-blue-600`. Assim a cor da marca muda num lugar
só, e o tema escuro passa a ser possível sem reescrever as telas.

### 3.1 Cor

O azul atual fica como cor da marca, até o dono confirmar o contrário — é a
premissa que ele deu. O que muda é que ele passa a morar num token.

| Token | Papel | Claro | Escuro |
|---|---|---|---|
| `--marca` | Ação primária, item ativo do menu | `blue-600` | `blue-500` |
| `--marca-forte` | Pressionado, hover | `blue-700` | `blue-400` |
| `--marca-fraca` | Fundo de destaque | `blue-50` | `blue-950` |
| `--superficie` | Fundo da página | `slate-50` | `slate-950` |
| `--superficie-alta` | Cartão, diálogo | `white` | `slate-900` |
| `--borda` | Borda padrão | `slate-200` | `slate-800` |
| `--texto` | Texto principal | `slate-900` | `slate-50` |
| `--texto-fraco` | Texto secundário | `slate-600` | `slate-400` |
| `--texto-apagado` | Legenda, marca d'água | `slate-400` | `slate-500` |

Cores de estado — as quatro que o sistema já usa, com nome do que significam e
não da cor:

| Token | Significa | Claro | Escuro |
|---|---|---|---|
| `--aprovado` | Conforme, concluído | `green-600` | `green-500` |
| `--atencao` | Pendente, a vencer, atrasado | `amber-500` | `amber-400` |
| `--reprovado` | Não conforme, erro, destrutivo | `red-600` | `red-500` |
| `--neutro` | Sem resposta, N/A | `slate-500` | `slate-400` |

> **Cor nunca é o único sinal.** Daltonismo é comum em população de fábrica, e
> a TV pode estar com cor desregulada. Todo estado leva também um ícone e uma
> palavra: "Aprovado ✓", não só um ponto verde. Isso já vale para o checklist,
> onde o rótulo vem de `src/lib/checklist.js`; a V2 estende a regra aos demais.

### 3.2 Tipografia

Uma escala só, com o tamanho escolhido pela **distância de leitura**, não pelo
gosto. A coluna "TV" existe porque a TV é lida a 4 metros: lá a escala inteira
sobe.

| Token | Papel | Tablet / PC | TV 1080p |
|---|---|---|---|
| `--texto-legenda` | Rodapé, unidade, metadado | 14 px | 24 px |
| `--texto-corpo` | Texto padrão | 16 px | 32 px |
| `--texto-destaque` | Valor de cartão, rótulo de campo | 20 px | 40 px |
| `--texto-titulo` | Título de seção | 24 px | 56 px |
| `--texto-numero` | O número grande do painel | 32 px | 96 px |

**O corpo sobe de 12–14 px para 16 px.** É a mudança que mais se nota no chão de
fábrica, e a que mais mexe no layout existente — vale fazer tela a tela, não de
uma vez.

Peso: 400 para corpo, 600 para rótulo e título, 700 só para número de painel.
Fonte: manter a padrão do sistema (nenhuma webfont), que carrega instantâneo e
não depende de rede — num tablet de fábrica isso conta.

### 3.3 Espaçamento

Escala de 4 px, sem valores soltos: `4, 8, 12, 16, 24, 32, 48, 64`.

- dentro de um controle: 8 ou 12
- entre controles de um mesmo grupo: 12 ou 16
- entre seções de um formulário: 24 ou 32
- **entre uma ação normal e uma destrutiva: 24, no mínimo** — é a trava contra o
  toque errado, não decoração (foi o que a V1 (f) aplicou com `ml-6`)

### 3.4 Raio e sombra

Seis raios viraram três, e quatro sombras viraram duas:

| Token | Valor | Onde |
|---|---|---|
| `--raio-pequeno` | 6 px | Selo, etiqueta, campo |
| `--raio` | 12 px | Botão, cartão, diálogo |
| `--raio-redondo` | 9999 px | Contador do menu, avatar |

| Token | Onde |
|---|---|
| `--sombra` | Cartão, barra fixa |
| `--sombra-alta` | Diálogo, menu suspenso |

Sombra separa camadas; não é enfeite. Um cartão dentro de outro cartão não leva
sombra: leva borda.

---

## 4. Toque: a regra de 48 px

**Todo alvo tocável tem no mínimo 48 × 48 px, com 8 px de folga até o vizinho.**

Vale para botão, aba, caixa de seleção, linha de lista clicável, ícone de ação e
campo de formulário. Não vale para link dentro de um parágrafo.

Para a V2 isso significa **mudar os padrões, não corrigir caso a caso**:

| Hoje | Proposta |
|---|---|
| `default: h-9` (36 px) | `h-12` (48 px) |
| `sm: h-8` (32 px) | `h-10` (40 px), e só no PC |
| `icon: h-9 w-9` (36 px) | `h-12 w-12` (48 px) |
| `lg: h-10` (40 px) | `h-14` (56 px), ação principal no tablet |

Enquanto o padrão for 36 px, toda tela nova nasce pequena. Mudar o padrão
inverte isso: a tela nasce certa, e quem quiser menor precisa pedir.

Mais três regras que vieram de problemas reais, não de teoria:

- **Ação destrutiva fica longe e pede confirmação**, num diálogo da aplicação
  que diz *qual* item será afetado. O `confirm()` do navegador abre no topo da
  janela, longe de onde o dedo está.
- **Nenhuma informação depende de `hover`.** No tablet não existe hover; no
  `title` de um ícone, a informação simplesmente não chega.
- **O alvo tem estado visível de "pressionado"**, não só de "selecionado". Com
  luva e tela sem retorno tátil, o único retorno é o visual.

---

## 5. TV: regras próprias

A TV não é a tela do PC em tela cheia. É outro produto.

- **Zero interação.** Nenhum controle, nenhum menu, nenhuma rolagem.
- **Escala de TV** (coluna da tabela em 3.2): o número do painel em 96 px.
- **Contraste alto**, porque a sala tem luz forte e a TV costuma estar mal
  calibrada: texto claro sobre fundo escuro, sem cinza sobre cinza.
- **Margem de segurança de 48 px** nas bordas: muitas TVs ainda cortam a borda
  do sinal (*overscan*), e o que fica no canto some.
- **Se rotacionar entre painéis, ≥ 15 s por painel**, com indicação de qual é e
  quantos são. Menos que isso, ninguém de passagem termina de ler.
- **A tela diz quando os dados são.** Um painel parado é indistinguível de um
  painel atualizado; precisa de "atualizado às 14:32" e de um aviso visível
  quando a atualização falha. É o mesmo princípio do aviso que a V1 (e) acabou
  de colocar no menu, no lugar do `catch {}`.
- **A TV usa uma sessão própria**, que não expira sozinha sem avisar.

---

## 6. Componentes

Lista do que precisa existir como peça única. "Existe" quer dizer: está no
código hoje de alguma forma. "A fazer" quer dizer: hoje está repetido nas telas.

### Base
| Peça | Situação | Observação na V2 |
|---|---|---|
| Botão | Existe (`ui/button.jsx`) | Altura padrão para 48 px |
| Campo de texto | Existe (`ui/input.jsx`) | Altura 48 px; rótulo sempre visível, nunca só `placeholder` |
| Seleção | Existe (`ui/select.jsx`) | Lista com itens de 48 px |
| Caixa / interruptor | Existe | Área tocável de 48 px, maior que o desenho |
| Grupo de resposta (Sim/Não/N/A) | **Existe só dentro do checklist** | Virar peça própria; é o controle mais tocado do sistema |
| Etiqueta de estado | Existe (`ChecklistNotaBadge`) | Generalizar para os 4 estados, com ícone + palavra |
| Diálogo | Existe (`ui/dialog`, `ui/alert-dialog`) | Botões de 48 px; o destrutivo afastado |

### Composição
| Peça | Situação | Observação na V2 |
|---|---|---|
| Cartão | Existe (`ui/card.jsx`) | Um nível de sombra só |
| Lista paginada | **Existe desde a V1 (f)** (`components/listas/`) | `useListaPaginada`, `AcoesDaLinha`, `RodapeDaLista`, `useEhCelular` — já é a base |
| Tabela ↔ cartão | **Existe desde a V1 (f)** | Monta um ramo só, não esconde com CSS |
| Formulário de etapas | A fazer | O checklist e o recebimento repetem a mesma estrutura |
| Estado vazio | A fazer | Hoje algumas telas dizem "nenhum registro" enquanto ainda carregam |
| Estado de carregando | Parcial | Precisa distinguir "vazio" de "ainda não chegou" |
| Aviso de dado velho | **Existe desde a V1 (e)** | Generalizar: toda tela que atualiza sozinha precisa |

### Painel e TV
| Peça | Situação |
|---|---|
| Cartão de número grande | Existe, espalhado |
| Gráfico (Recharts) | Existe | Paleta vinda dos tokens, hoje é a padrão |
| Painel de TV | Existe (`Televisao`, `TelevisaoEmpilha`) | Extrair a moldura comum |

---

## 7. Tema claro e escuro

A infraestrutura já está pronta (`darkMode: ["class"]` e o bloco `.dark`); falta
ligar.

Proposta:

- **Claro é o padrão** no tablet e no PC.
- **A TV usa o tema escuro sempre**, independente do resto — é o que dá
  contraste na sala e cansa menos quem passa o dia perto dela.
- A preferência do sistema operacional é respeitada no PC, com uma chave para
  sobrepor; a escolha fica no aparelho, não na conta — o tablet é compartilhado,
  e a preferência de uma pessoa não deve seguir a próxima.

Ligar isso só vale depois que as telas usarem tokens em vez de `bg-blue-600`
escrito à mão. Antes disso, o tema escuro deixaria 110 pontos azuis acesos num
fundo escuro.

---

## 8. Por onde começar

Ordem sugerida, da maior razão valor/risco para a menor:

1. **Ligar o azul ao token.** `--marca` passa a valer, as 110 ocorrências de
   `bg-blue-600`/`bg-blue-700` viram `bg-marca`/`bg-marca-forte`. Risco baixo,
   mecânico, e desbloqueia os itens 2, 5 e 7.
2. **Subir os padrões do botão para 48 px.** Uma mudança, efeito em todas as
   telas. Precisa de uma passada de Playwright nas três larguras, porque altura
   maior muda quebra de linha.
3. **Tokens de raio e sombra.** Seis raios viram três.
4. **Escala tipográfica**, tela a tela, começando pelas do operador.
5. **Tema escuro na TV.**
6. **Peças novas** (grupo de resposta, estado vazio, formulário de etapas).

Cada passo com Playwright antes e depois nas três larguras, do mesmo jeito que a
V1 foi feita. As suítes de segurança continuam valendo e não podem regredir.

---

## 9. O que este documento não decide

- **A cor da marca.** O azul fica por premissa do dono, não por análise.
- **Fonte própria.** Proponho não ter, mas é decisão de marca.
- **Nome dos tokens em português.** Segui o resto do código, que é em português;
  se a preferência for inglês, é um renomear mecânico.
- **Quando fazer.** Isto é uma proposta; a prioridade é do dono.
