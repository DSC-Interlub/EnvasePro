# Funções do banco — referência

Escrito para quem for manter o EnvasePro. Lista **o que existe em produção**
(lido do banco em 20/10/2026, não de memória), o que cada função devolve, quem
pode chamá-la e onde está a prova. A história de por que cada uma existe está em
`docs/ETAPA2-INDICADORES.md`.

## Regras que valem para todas as funções de leitura

- **`STABLE`** e **sem `SECURITY DEFINER`**: rodam com os direitos de quem chama,
  então o RLS continua valendo exatamente como numa consulta comum.
- **`search_path = public, pg_temp`** fixo.
- **EXECUTE só para `authenticated`** (e `service_role`/`postgres`). `anon` e
  `PUBLIC`: nada. Provado em produção em 19/10/2026: com a chave pública, todas
  respondem 401 / `42501`.
- **"Hoje" é o dia de Brasília**: `(now() AT TIME ZONE 'America/Sao_Paulo')::date`.
  Nunca `CURRENT_DATE` (segue o fuso da sessão, que é UTC: vira o dia às 21h).
- Cada uma tem um **recuo** em `src/lib/` com a mesma regra: se a função não
  existir no banco (código publicado antes da migration), a tela calcula o mesmo
  no navegador, lendo só o período. O recuo é testado como igual à função.

## Painéis e indicadores

| Função | Devolve | Tela | Migration | Recuo | Prova |
|---|---|---|---|---|---|
| `painel_televisao_empilha()` | jsonb: linhas do dia (total, concluídas, em andamento, críticas pendentes, tempo médio), ocorrências abertas e a mais recente, até 60 operações em andamento, `meta` | `/TelevisaoEmpilha` | `20261019000001` (+ meta na `…006`) | `src/lib/painelEmpilha.js` | `test-painel-empilha.mjs` |
| `painel_televisao()` | jsonb: `envase` (produção, concluídos, lançados, em andamento, por sala, operações), `checkout`, `empilha` (o painel acima + parada ativa e empilhadeira), `mes` (por sala e categoria), `metas` | `/Televisao` | `20261019000002` (+ `…006`) | `src/lib/painelTelevisao.js` | `test-painel-televisao.mjs` |
| `painel_geral()` | jsonb: `hoje`, `semana` (segunda a domingo), `pendencias`, `ao_vivo` (4 cartões por módulo + totais), `ocorrencias` (5) | `/Painel` | `20261019000003` | `src/lib/painelGeral.js` | `test-painel-geral.mjs` |
| `indicadores_empilhadeira(de, ate)` | jsonb: produção (por tipo, por dia), operadores (empilhadores, ajudantes), paradas, ocorrências, OEE por dia e médio | `/IndicadoresEmpilha`, aba da `/Empilhadeira` | `20261019000004` | `src/lib/indicadoresEmpilha.js` | `test-indicadores-empilha.mjs` |
| `indicadores_recebimento(de, ate)` | jsonb: volume (status, tipo, dia), tempo (médio, totais, por tipo), ocorrências, equipe (top 8) | `/IndicadoresRecebimento` | `20261019000005` | `src/lib/indicadoresRecebimento.js` | `test-indicadores-recebimento.mjs` |
| `metas_do_dia(dia)` | jsonb: meta vigente de cada item no dia (ou `null`) | lida pelos dois painéis de TV | `20261019000006` | `src/lib/metas.js` | `test-metas.mjs` |
| `contadores_do_menu()` | 1 linha: 8 contadores dos selos do menu | menu lateral (admin) | `20261008000001` | — | `test-contadores-menu.js` |

**O checklist não tem função de propósito.** As faixas de nota (critério A/B) moram
em `src/lib/checklist.js`; copiá-las para o SQL criaria duas verdades sobre o
mesmo checklist. O indicador de checklist continua no navegador, buscando só o
período.

**O Dashboard também não**: ele busca só a faixa de datas que os filtros pedem
(`src/lib/faixaDashboard.js`) e o filtro de sempre roda por cima. Ver
`docs/ETAPA2-INDICADORES.md` §8 para o porquê.

## Dicionário dos indicadores (o que cada número conta)

| Indicador | Regra | Onde |
|---|---|---|
| Envase — produção do dia | soma de `quantidade_produzida` dos envases com `data` = hoje | `painel_televisao`, `painel_geral` |
| Envase — concluídos | envases do dia com `termino` preenchido | idem |
| Envase — lançados | envases do dia com início **ou** término, cada um uma vez | `painel_televisao` |
| Envase — em andamento | começou; na sala Bio até o material ser retirado, nas outras até terminar | idem |
| Check-out — pendentes | itens das programações de hoje com status ≠ Concluído | `painel_televisao` |
| Check-out — total do dia | todos os itens das programações de hoje | idem |
| Empilhadeira — tempo médio | média de `tempo_total` (H:MM → min) das linhas concluídas, arredondada como o `Math.round` | painéis e indicadores |
| Empilhadeira — OEE | por dia: `min(100, round(produtivo / turno × 100))`; médio = média dos dias do período, inclusive dias sem dado | `indicadores_empilhadeira` |
| Recebimento — data | a de chegada, senão a prevista | `indicadores_recebimento` |
| Semana (Painel) | segunda a domingo; datas de registros pelo dia de Brasília | `painel_geral` |
| Meta vigente | a linha de `vigente_desde` mais recente que não seja posterior ao dia | `metas_do_dia` |

## Funções de gatilho (não são chamadas pelo app)

EXECUTE só para `postgres`/`service_role` — gatilho não precisa de EXECUTE do
usuário.

| Função | O que protege |
|---|---|
| `protect_admin_columns(...)` | colunas que só admin muda (assinatura do líder, resolução de ocorrência, descarte de NF, autoria do checklist) |
| `protect_immutable_columns(...)` | protocolos e `created_at` — ninguém muda, nem admin |
| `protect_write_once_columns(...)` | operador e ids de operador: preenche quando vazio, não troca depois |
| `protect_assinatura_completa()` | registro já "Completo": operador não mexe em assinatura nem status |
| `protect_status_completo()` | só admin leva `status_assinatura` a "Completo" (`20261019000007`, 19/10/2026) |
| `protect_user_role_update()` | o próprio usuário não muda seu papel |
| `calcular_nota_checklist()` | nota do checklist (−90 a +90) |
| `set_updated_at()` | `updated_at` |
| `handle_new_user()` | `SECURITY DEFINER` (cria o perfil): papel sempre `operator` |

`is_admin()` (`SECURITY DEFINER`, `search_path` fixo) é usada pelas políticas e
gatilhos. `gerar_protocolo(prefixo, sequence)` gera `PREFIXO-AAAA-NNNNNN` com o
ano de Brasília e uma lista fechada de sequences. `rls_auto_enable()` é da
plataforma Supabase, não deste repositório.

## Desfazer

Cada migration de 19/10/2026 tem rollback em `supabase/rollbacks/`, testado por
`scripts/test-rollbacks.mjs`: desfeito, o esquema fica igual ao de produção antes
das migrations; reaplicado, igual ao de depois. Aplicar à mão, um arquivo por vez,
na ordem inversa. O de `…006` **apaga as metas lançadas** — exportar antes.
