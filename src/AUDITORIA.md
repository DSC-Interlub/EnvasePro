# DOCUMENTO DE AUDITORIA — EnvasePro
**Sistema de Controle de Produção — Interlub**
*Data do documento: 29/05/2026*

---

## 1. VISÃO GERAL DO SISTEMA

**Nome:** EnvasePro
**Propósito:** Sistema interno de gestão de operações de envase, check-out de pedidos, empilhadeira, limpeza e recebimento de materiais da empresa Interlub.

**Usuários:** Operadores de produção, supervisores e gestores das salas Bio e Industrial.

**Versão atual:** v8
**URL:** https://interlub-envase.online
**Última atualização:** Maio 2026

**Stack tecnológica:**
- Frontend: React 18 + TypeScript/JSX
- Estilização: Tailwind CSS + shadcn/ui (Radix UI)
- Roteamento: React Router DOM v7
- State/Cache: TanStack React Query v5
- Gráficos: Recharts
- Backend/BaaS: Base44 (banco de dados, autenticação, funções serverless, storage)
- Funções Serverless: Deno Deploy (via Base44)
- Exportação: geração de CSV client-side

**Arquitetura:** SPA (Single Page Application) — monolito frontend com BaaS.

---

## 2. BANCO DE DADOS ATUAL

**Provedor:** Base44 (banco gerenciado na nuvem, sem acesso direto ao motor de banco)
**Tipo:** NoSQL orientado a documentos (similar ao MongoDB)
**Acesso:** Exclusivamente via SDK Base44 (`base44.entities.*`)

---

### ENTIDADES (TABELAS)

#### `Product` — Cadastro de Produtos
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| codigo | string | ✅ | — | Código do produto |
| nome | string | ✅ | — | Nome/descrição |
| unidade_medida | string | ❌ | — | L, KG, etc. |
| consistencia | string | ✅ | — | Ex: 2, x, 0-00, 100-320 |
| categoria | enum | ❌ | — | "Graxa", "Óleo", "Pasta" |
| nsf_3h | boolean | ❌ | false | Certificação NSF 3H |
| nsf_h1 | boolean | ❌ | false | Certificação NSF H1 |
| halal | boolean | ❌ | false | Certificação HALAL |
| kosher | boolean | ❌ | false | Certificação KOSHER |

---

#### `Embalagem` — Cadastro de Embalagens
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| codigo | string | ✅ | — | Código da embalagem |
| descricao | string | ✅ | — | Descrição |
| conteudo | number | ✅ | — | Capacidade |
| tipo | string | ❌ | — | Tipo (digitável) |
| conteudo_ext | string | ❌ | — | Conteúdo externo/adicional |
| ultimos_4_digitos | string | ✅ | — | Últimos 4 dígitos para vínculo com produto |

---

#### `Operator` — Cadastro de Operadores
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| nome | string | ✅ | — | Nome completo |
| matricula | string | ❌ | — | Matrícula |
| sala | enum | ✅ | — | "Bio", "Industrial", "Ambas" |
| ativo | boolean | ❌ | true | Se está ativo |
| foto_url | string | ❌ | — | URL da foto |

---

#### `EnvaseRecord` — Registros de Envase
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| sala | enum | ✅ | — | "Bio" ou "Industrial" |
| data | date | ✅ | — | Data do envase |
| mes | number | ❌ | — | Mês extraído da data |
| ano | number | ❌ | — | Ano extraído da data |
| op | string | ❌ | — | Ordem de Produção |
| operador | string | ✅ | — | Nome do operador |
| codigo_produto | string | ✅ | — | Código do produto |
| descricao_produto | string | ❌ | — | Descrição do produto |
| consistencia | string | ❌ | — | Consistência |
| codigo_embalagem | string | ❌ | — | Código da embalagem |
| descricao_embalagem | string | ❌ | — | Descrição da embalagem |
| multiplo | number | ❌ | — | Conteúdo da embalagem |
| quantidade_produzida | number | ✅ | — | Qtd produzida |
| inicio | string | ❌ | — | Horário de início (HH:MM) |
| termino | string | ❌ | — | Horário de término |
| tempo_produtivo | string | ❌ | — | Tempo total calculado |
| quantidade_embalagens | number | ❌ | — | Qtd embalagens calculada |
| tempo_por_embalagem | string | ❌ | — | Tempo/embalagem |
| dificuldade_codigo | enum(0,1,2,3) | ❌ | — | 0=Normal, 1=Rotulagem, 2=Final Tambor, 3=Mescla |
| dificuldade_tipo | string | ❌ | — | Descrição da dificuldade |
| lote_embalagem | string | ❌ | — | Lote da embalagem |
| lotes_tampa | string | ❌ | — | Lotes das tampas |
| observacoes | string | ❌ | — | Observações |
| material_retirado | boolean | ❌ | false | Material retirado da sala Bio |

---

#### `CheckoutProgramacao` — Programações de Check-out
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| data_programada | date | ✅ | — | Data da programação |
| total_pedidos | number | ❌ | — | Total de pedidos |
| pedidos_concluidos | number | ❌ | 0 | Pedidos concluídos |
| status | enum | ❌ | "Pendente" | "Pendente", "Em Andamento", "Concluído" |
| observacoes | string | ❌ | — | Observações gerais |

---

#### `CheckoutItem` — Itens de Check-out
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| programacao_id | string | ✅ | — | **FK → CheckoutProgramacao.id** |
| numero_pedido | string | ✅ | — | Ex: PV-20.235 |
| data_entrega | date | ❌ | — | Data de entrega |
| cliente | string | ✅ | — | Nome do cliente |
| operador | string | ❌ | — | Operador do check-out |
| hora_inicio | string | ❌ | — | Horário de início |
| hora_termino | string | ❌ | — | Horário de término |
| tempo_total | string | ❌ | — | Tempo total calculado |
| critico | boolean | ❌ | false | Pedido crítico |
| data_saida | date | ❌ | — | Data de saída (para críticos) |
| finalizado_fora_do_prazo | boolean | ❌ | false | Finalizado com atraso |
| data_finalizacao_real | date | ❌ | — | Data real de finalização |
| motivo_atraso | string | ❌ | — | Motivo do atraso |
| status | enum | ❌ | "Pendente" | "Pendente", "Em Andamento", "Concluído" |
| observacoes | string | ❌ | — | Observações |

---

#### `LimpezaLocal` — Cadastro de Locais de Limpeza *(v5)*
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| nome | string | ✅ | — | Nome do local |
| tipo | enum | ❌ | — | "Sala", "Galpão", "Banheiro", "Área externa", "Corredor", "Outro" |
| descricao | string | ❌ | — | Observações sobre o local |
| ativo | boolean | ❌ | true | Se o local está ativo |

---

#### `LimpezaProgramacao` — Programações de Limpeza *(v5, atualizado em v6)*
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| local_id | string | ✅ | — | **FK → LimpezaLocal.id** |
| local_nome | string | ❌ | — | Nome do local (desnormalizado) |
| responsavel_id | string | ❌ | — | **FK → Operator.id** (principal, compatibilidade) |
| responsavel_nome | string | ❌ | — | Nomes dos responsáveis separados por vírgula |
| responsaveis | array | ❌ | — | Lista de responsáveis `[{id, nome}]` |
| assinaturas_responsaveis | array | ❌ | — | Assinaturas individuais `[{id, nome, assinado, hora}]` |
| data_prevista | date | ✅ | — | Data prevista |
| hora_prevista | string | ❌ | — | Hora prevista HH:MM |
| tipo_limpeza | enum | ❌ | — | "Varrição", "Lavagem", "Desinfecção", "Limpeza geral", "Outro" |
| observacoes | string | ❌ | — | Instruções |
| status | enum | ❌ | "Pendente" | "Pendente", "Em Andamento", "Concluído", "Atrasado" |
| data_realizada | date | ❌ | — | Data efetiva |
| hora_inicio | string | ❌ | — | Hora de início HH:MM |
| hora_fim | string | ❌ | — | Hora de fim HH:MM |
| assinatura_responsavel | boolean | ❌ | false | true quando TODOS os responsáveis assinaram |
| assinatura_responsavel_nome | string | ❌ | — | Nomes dos que assinaram |
| assinatura_responsavel_hora | string | ❌ | — | Hora da última assinatura |
| assinatura_lider | boolean | ❌ | false | Líder confirmou |
| assinatura_lider_nome | string | ❌ | — | Nome do líder |
| assinatura_lider_hora | string | ❌ | — | Hora da assinatura do líder |
| status_assinatura | enum | ❌ | "Pendente" | "Pendente", "Parcial", "Completo" |
| criado_por | string | ❌ | — | Nome do admin que criou |

---

#### `RecebimentoFornecedor` — Cadastro de Fornecedores *(novo em v6)*
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| nome | string | ✅ | — | Nome do fornecedor |
| tipo | enum | ❌ | — | "Nacional", "Internacional", "Ambos" |
| pais_origem | string | ❌ | — | País de origem |
| observacoes | string | ❌ | — | Observações gerais |
| ativo | boolean | ❌ | true | Se está ativo |

---

#### `Recebimento` — Cabeçalho do Recebimento *(novo em v6)*
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| tipo | enum | ✅ | — | "Importação", "Nacional", "Devolução", "Material auxiliar", "Outro" |
| numero_documento | string | ✅ | — | Número NF, DI, AWB, BL ou identificador interno |
| numero_nf | string | ❌ | — | NF vinculada (para importações) |
| fornecedor_id | string | ❌ | — | **FK → RecebimentoFornecedor.id** |
| fornecedor_nome | string | ❌ | — | Nome do fornecedor (desnormalizado ou esporádico) |
| data_prevista | date | ❌ | — | Previsão de chegada |
| data_chegada | date | ❌ | — | Data real de chegada |
| descricao | string | ❌ | — | Breve descrição do recebimento |
| status | enum | ❌ | "Agendado" | "Agendado", "Em andamento", "Pausado", "Concluído", "Cancelado" |
| prioridade | enum | ❌ | "Normal" | "Normal", "Alta", "Urgente" |
| coordenador_id | string | ❌ | — | **FK → Operator.id** |
| coordenador_nome | string | ❌ | — | Nome do coordenador (desnormalizado) |
| datetime_inicio | string | ❌ | — | ISO 8601 — início |
| datetime_pausa | string | ❌ | — | ISO 8601 — última pausa |
| datetime_retomada | string | ❌ | — | ISO 8601 — última retomada |
| datetime_fim | string | ❌ | — | ISO 8601 — fim |
| tempo_produtivo_minutos | number | ❌ | — | Tempo produtivo calculado (descontando pausas) |
| tempo_pausado_minutos | number | ❌ | — | Tempo total em pausa |
| observacoes_finais | string | ❌ | — | Observações ao finalizar |
| assinatura_coordenador | boolean | ❌ | false | Coordenador assinou |
| assinatura_coordenador_nome | string | ❌ | — | Nome do coordenador que assinou |
| assinatura_coordenador_datetime | string | ❌ | — | ISO 8601 |
| assinatura_lider | boolean | ❌ | false | Líder assinou |
| assinatura_lider_nome | string | ❌ | — | Nome do líder |
| assinatura_lider_datetime | string | ❌ | — | ISO 8601 |
| status_assinatura | enum | ❌ | "Pendente" | "Pendente", "Parcial", "Completo" |

---

#### `RecebimentoParticipante` — Equipe do Recebimento *(novo em v6)*
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| recebimento_id | string | ✅ | — | **FK → Recebimento.id** |
| operator_id | string | ✅ | — | **FK → Operator.id** |
| operator_nome | string | ❌ | — | Nome do operador (desnormalizado) |
| funcao | enum | ❌ | — | "Coordenador", "Conferente", "Auxiliar" |
| assinou | boolean | ❌ | false | Se assinou |
| assinatura_datetime | string | ❌ | — | ISO 8601 — quando assinou |

---

#### `RecebimentoItem` — Itens do Recebimento *(novo em v6)*
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| recebimento_id | string | ✅ | — | **FK → Recebimento.id** |
| produto_codigo | string | ❌ | — | Código do produto (referência ao Product) |
| produto_descricao | string | ✅ | — | Descrição do produto |
| lote | string | ❌ | — | Lote do produto |
| quantidade_prevista | number | ❌ | — | Quantidade esperada conforme documento |
| quantidade_recebida | number | ❌ | — | Quantidade efetivamente conferida |
| unidade | string | ❌ | — | Unidade: KG, UN, CX, L... |
| status_item | enum | ❌ | "Pendente conferência" | "Pendente conferência", "OK", "Divergência de quantidade", "Avaria", "Recusado" |
| observacoes | string | ❌ | — | Observações sobre o item |

---

#### `RecebimentoOcorrencia` — Ocorrências do Recebimento *(novo em v6)*
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| recebimento_id | string | ✅ | — | **FK → Recebimento.id** |
| item_id | string | ❌ | — | **FK → RecebimentoItem.id** (opcional) |
| tipo | enum | ✅ | — | "Avaria", "Divergência de quantidade", "Produto errado", "Atraso", "Problema de documento", "Problema de acesso", "Outro" |
| descricao | string | ✅ | — | Descrição detalhada |
| registrado_por | string | ✅ | — | Nome de quem registrou |
| datetime_registro | string | ✅ | — | ISO 8601 |
| resolvido | boolean | ❌ | false | Se foi resolvida |
| resolucao | string | ❌ | — | Como foi resolvida |

---

Entidades do módulo empilhadeira: `EmpilhadeiraConfig`, `EmpilhadeiraManutencao`, `EmpilhaProgramacao`, `EmpilhaLinha`, `EmpilhaOcorrencia`, `EmpilhadeiraParada` — ver seção 3.A.

---

#### `SapPedido` — Base de Pedidos SAP *(novo em v7)*
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| serie_documento | string | ❌ | — | Séries de documento |
| numero_documento | string | ✅ | — | **Chave de busca** — Nº doc. SAP |
| codigo_fornecedor | string | ❌ | — | Código do fornecedor |
| nome_fornecedor | string | ✅ | — | Nome do fornecedor |
| numero_referencia_fornecedor | string | ❌ | — | Nº ref.fornec. |
| data_vencimento | date | ❌ | — | Data de vencimento |
| valor | number | ❌ | — | Valor |
| valor_liquido | number | ❌ | — | Valor líquido |
| valor_imposto | number | ❌ | — | Valor do imposto |
| valor_original | number | ❌ | — | Valor original |
| data_lancamento | date | ❌ | — | Data de lançamento |
| data_documento | date | ❌ | — | Data do documento |
| tipo_documento | string | ❌ | — | Tipo de documento |
| nome_filial | string | ❌ | — | Nome da filial |
| ativo | boolean | ❌ | true | Se o registro está ativo |

---

#### `NotaFiscalArquivo` — Arquivo Digital de Notas Fiscais *(novo em v8)*
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| numero_nf | string | ✅ | — | Número da NF — chave de busca |
| serie | string | ❌ | — | Série da NF |
| chave_acesso | string | ❌ | — | Chave eletrônica (44 dígitos) |
| data_emissao | date | ✅ | — | Data de emissão |
| data_expedicao | date | ✅ | — | Data de expedição da empresa |
| destinatario_nome | string | ✅ | — | Nome do destinatário |
| destinatario_cnpj_cpf | string | ❌ | — | CNPJ/CPF |
| transportadora_nome | string | ❌ | — | Nome da transportadora |
| motorista_nome | string | ❌ | — | Nome do motorista |
| placa_veiculo | string | ❌ | — | Placa do veículo |
| arquivo_via_empresa_url | string | ❌ | — | URL da via empresa (canhoto) |
| arquivo_via_motorista_url | string | ❌ | — | URL da via motorista |
| arquivo_via_empresa_nome | string | ❌ | — | Nome original do arquivo empresa |
| arquivo_via_motorista_nome | string | ❌ | — | Nome original do arquivo motorista |
| status_arquivo | enum | ❌ | "Pendente digitalização" | "Pendente digitalização", "Parcial", "Completo" |
| data_validade_retencao | date | ❌ | — | data_emissao + 5 anos (calculada ao criar) |
| pode_descartar | boolean | ❌ | false | true se data atual ≥ data_validade_retencao |
| descartado | boolean | ❌ | false | Papel físico descartado pelo admin |
| data_descarte | date | ❌ | — | Data do descarte físico |
| observacoes | string | ❌ | — | Observações gerais |
| arquivado_por_nome | string | ❌ | — | Nome de quem cadastrou |
| recebimento_id | string | ❌ | — | **FK → Recebimento.id** (opcional) |

---

#### `ChecklistRecebimento` — Checklist de Qualidade no Recebimento *(novo em v7)*
| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| id | string (auto) | — | — | Chave primária |
| pedido_disponivel_etapa5 | enum | ✅ | — | "Sim", "Não" |
| numero_pedido_compras | string | ✅ | — | Número do pedido (chave de busca no SAP) |
| sap_pedido_id | string | ❌ | — | **FK → SapPedido.id** |
| nome_fornecedor | string | ✅ | — | Preenchido automaticamente via SAP ou manual |
| codigo_fornecedor | string | ❌ | — | Preenchido automaticamente via SAP ou manual |
| descricao_material | string | ✅ | — | Descrição do material |
| data_prevista_material | date | ❌ | — | Auto via SAP (data_vencimento) ou manual |
| data_entrega | date | ✅ | — | Data de entrega real |
| entrega_conforme_prevista | enum | ✅ | — | "Sim", "Não" |
| inspecionado_por | array[string] | ✅ | — | Nomes dos inspetores (mínimo 1) |
| numero_nota_fiscal | string | ✅ | — | Número da NF |
| material_recebimento | enum | ✅ | — | "Spray", "Rótulo", "Embalagem", "Produto Interlub", "Matéria Prima (Terceiros)" |
| quantidade_recebida | number | ✅ | — | Quantidade recebida |
| unidade_medida | enum | ✅ | — | "KG", "LT", "PC", "UN", "MILHEIRO", "M³" |
| numero_lote | string | ✅ | — | Número do lote |
| quantidade_conforme_nf | enum | ✅ | — | "Sim", "Não" |
| amostragem_inspecionada | enum | ✅ | — | "Sim", "Não", "N/A" |
| condicoes_gerais_conformes | enum | ✅ | — | "Sim", "Não", "N/A" |
| spray_conforme_feps | enum | ✅ | — | "Sim", "Não", "N/A" — destacado quando material=Spray |
| acompanha_certificado_analise | enum | ✅ | — | "Sim", "Não", "N/A" |
| acompanha_ficha_emergencia | enum | ✅ | — | "Sim", "Não", "N/A" |
| acompanha_fispq | enum | ✅ | — | "Sim", "Não", "N/A" |
| observacoes | string | ❌ | — | Obrigatório se houver resposta "Não" |
| total_sim | number | ❌ | — | Contagem de "Sim" nos 9 campos de checklist |
| total_nao | number | ❌ | — | Contagem de "Não" nos 9 campos |
| soma_sim | number | ❌ | — | total_sim × 10 |
| soma_nao | number | ❌ | — | total_nao × -10 |
| nota_final | number | ❌ | — | soma_sim + soma_nao (calculada e salva no envio) |
| recebimento_id | string | ❌ | — | **FK → Recebimento.id** (vínculo opcional) |
| criado_por_nome | string | ❌ | — | Nome do usuário que preencheu |

**Campos que entram na pontuação (9 campos):**
`pedido_disponivel_etapa5`, `entrega_conforme_prevista`, `quantidade_conforme_nf`, `amostragem_inspecionada`, `condicoes_gerais_conformes`, `spray_conforme_feps`, `acompanha_certificado_analise`, `acompanha_ficha_emergencia`, `acompanha_fispq`

**Regras de pontuação:** Sim → +10 | Não → -10 | N/A → 0 (não entra no cálculo)
**Classificação:** Aprovado ≥ 80 | Atenção 0–79 | Reprovado < 0

---

## 3. MAPEAMENTO COMPLETO DE MÓDULOS E TELAS

### `/` → Dashboard (`pages/Dashboard.jsx`)
**Propósito:** Painel central de KPIs e métricas.

**Componentes visuais:**
- Cards de estatísticas (`StatsGrid`, `CategoryStatsGrid`, `CheckoutStatsGrid`)
- Gráficos de análise (`AnalysisGrid`, `CheckoutAnalysisGrid`)
- **Bloco de Recebimentos** (`BlocoRecebimento`) — KPIs do dia, em andamento ao vivo, ocorrências abertas
- **Bloco de Limpeza** (`BlocoLimpeza`) — KPIs da semana, lista agrupada por dia, ações para admin
- Filtros de período, sala, operador
- Tabs para alternar entre modo Envase e Checkout
- Botão de exportação CSV

---

### `/GerenciarUsuarios` → Configurações (`pages/GerenciarUsuarios.jsx`) *(renomeado em v5, atualizado em v6)*
**Propósito:** Configurações administrativas do sistema, organizado em 4 abas.
**Acesso:** Somente `admin` (protegida via `RotaProtegidaAdmin`).

**Aba "Usuários":** Listagem e alteração de roles.
**Aba "Locais de Limpeza":** CRUD de `LimpezaLocal`.
**Aba "Programação de Limpeza":** Gestão de `LimpezaProgramacao`.
**Aba "Fornecedores"** *(nova em v6)*: CRUD completo de `RecebimentoFornecedor` — novo, editar, ativar/desativar.

---

### `/Recebimento` → Painel de Recebimento *(novo em v6)*
**Propósito:** Painel principal do módulo de controle de recebimento.
**Acesso:** Todos os usuários (admin e operator).

**Funcionalidades:**
- KPIs: total, agendados, em andamento, concluídos, com ocorrências abertas
- Filtro por período com atalhos (Hoje / Esta semana / Este mês)
- Filtro adicional por tipo e por status
- Lista de cards ordenada por prioridade (Urgente no topo)
- Badges visuais por prioridade (Urgente=vermelho, Alta=laranja)
- Botão "Novo Recebimento" (somente admin) → `/NovoRecebimento`
- Link para Indicadores → `/IndicadoresRecebimento`

---

### `/NovoRecebimento` → Criar Recebimento *(novo em v6)*
**Propósito:** Wizard em 2 passos para criar novos recebimentos.
**Acesso:** Somente `admin`.

**Passo 1 — Informações gerais:** tipo, número do documento (label dinâmico por tipo), NF vinculada (para importações), fornecedor (cadastrado ou texto livre), datas, prioridade, coordenador, equipe participante (multi-select com função), descrição.

**Passo 2 — Itens:** tabela editável para adicionar itens manualmente + importação via texto colado do Excel (Código | Descrição | Lote | Quantidade | Unidade). Mínimo 1 item para salvar.

**Ao salvar:** cria `Recebimento` (status="Agendado") + todos `RecebimentoItem` + todos `RecebimentoParticipante` atomicamente.

---

### `/ExecutarRecebimento?id=` → Tela Operacional *(novo em v6)*
**Propósito:** Tela usada durante a execução do recebimento.
**Acesso:** Todos os usuários.

**Header:** número do documento, tipo, fornecedor, status, timer em tempo real (quando em andamento), coordenador, participantes.

**Controles de status:** Iniciar → Pausar/Finalizar → Retomar. Todos registram datetimes ISO 8601.

**Lista de itens:** tabela com todos os `RecebimentoItem`. Campo quantidade_recebida editável inline — atualiza `status_item` automaticamente (OK se igual ao previsto, "Divergência de quantidade" se diferente). Status manual por item via select.

**Ocorrências:** seção colapsável com lista de todas as ocorrências + botão registrar + resolução (admin only).

**Fluxo de assinatura ao finalizar:**
1. Modal com lista de participantes — cada um assina individualmente (checkbox + datetime automático)
2. Quando todos assinaram → `status_assinatura = "Parcial"`, modal avança para etapa do líder
3. Admin assina como líder → `status_assinatura = "Completo"`

---

### `/IndicadoresRecebimento` → Indicadores *(novo em v6)*
**Propósito:** Análises e KPIs do módulo de recebimento com filtro de período.
**Acesso:** Somente `admin`.

**Bloco 1 — Volume:** total por status, por tipo (gráfico pizza), recebimentos por dia (gráfico barras).
**Bloco 2 — Tempo:** tempo médio geral, total produtivo, total pausado, comparativo por tipo.
**Bloco 3 — Qualidade:** itens recebidos vs divergências, % divergência, divergências por tipo, ranking de fornecedores com mais divergências, ocorrências por tipo.
**Bloco 4 — Equipe:** ranking de operadores por participações (gráfico barras horizontais).
**Bloco 5 — Importações:** comparativo tempo médio Importação vs Nacional lado a lado.

---

### `/ChecklistRecebimento` → Painel de Checklist *(novo em v7)*
**Propósito:** Listagem, KPIs e acesso ao formulário de checklist de qualidade.
**Acesso:** Todos os usuários (operadores e admins).

**KPIs:** Total de checklists, nota média, % conformidade, checklists com nota negativa.
**Filtros:** período (semana/mês/ano + datas), fornecedor (texto), material (dropdown), inspetor (dropdown).
**Lista:** data entrega, nº pedido, fornecedor, material, inspetor(es), nota (badge colorido).
**Botão "Novo Checklist":** visível para todos.
**Botão "Importar base SAP":** somente admin.

---

### `/NovoChecklist` → Formulário de Checklist *(novo em v7)*
**Propósito:** Criação de checklist de qualidade no recebimento.
**Acesso:** Todos os usuários.

**Seção 1 — Identificação:** pedido disponível na Etapa 5, número do pedido (com busca automática no SAP), fornecedor/código (auto ou manual), descrição, datas, conformidade de entrega, inspetores (multi-select), NF, material, quantidade, unidade, lote, vínculo com Recebimento.
**Seção 2 — Checklist:** 7 perguntas com botões Sim/Não/N/A; preview em tempo real (contadores + nota parcial); campo spray destaque quando material=Spray.
**Seção 3 — Observações e envio:** textarea + preview da nota final + botão enviar.
**Validações:** todos os campos obrigatórios, mínimo 1 inspetor, todas as perguntas respondidas, observações obrigatórias se houver "Não".

---

### `/ChecklistDetalhe?id=` → Visualização de Checklist *(novo em v7)*
**Propósito:** Visualização detalhada de um checklist preenchido.
**Acesso:** Todos os usuários.

Exibe os 3 grupos de campos. Respostas "Não" em vermelho, "N/A" em cinza. Card de nota final com cor e label (Aprovado/Atenção/Reprovado). Botão "Editar" somente para admin e somente se criado hoje.

---

### `/GerenciarUsuarios` → Configurações *(atualizado em v7)*
Nova aba **"Base SAP":** listagem paginada dos `SapPedido`, filtro por fornecedor/nº doc, toggle ativo/inativo, botão "Importar base SAP" (modal com parse de dados copiados do SAP).

---

### `/IndicadoresRecebimento` → Indicadores *(atualizado em v7)*
Agora com tabs: **"Recebimento"** (conteúdo anterior) + **"Checklist"** (novos indicadores).

**Aba Checklist — IndicadoresChecklist:**
- Visão geral: nota média, total, aprovados/atenção/reprovados, pizza de distribuição, evolução da nota por dia
- Por fornecedor: ranking por nota média, fornecedores com mais reprovados, gráfico de barras
- Por campo: % Sim/Não/N/A por pergunta, barra empilhada, ordenado por maior % de "Não"
- Por inspetor: ranking por volume e nota média
- Tabela resumo: todas as colunas filtráveis

---

### `/Recebimento` → Painel de Recebimento *(atualizado em v7)*
Cada `RecebimentoCard` agora exibe badge de checklist vinculado:
- ✓ Verde (nota ≥ 80): "Checklist (nota)"
- ⚠ Amarelo (0 ≤ nota < 80): "Checklist (nota)"
- ✗ Vermelho (nota < 0): "Checklist (nota)"
- Cinza: "Checklist pendente"
Clique no badge navega para `/ChecklistDetalhe`.

---

### `/Painel` → Painel Geral Cockpit *(novo em v8)*
**Propósito:** Visão completa e unificada de tudo que está acontecendo na empresa.
**Acesso:** Todos os usuários.

**Faixa 1 — Cabeçalho:** nome da empresa, data por extenso, relógio ao vivo (segundo a segundo), último refresh, botão de refresh manual, usuário + role.
**Faixa 2 — Em andamento agora** (polling 30s): cards de Envase, Checkout, Empilhadeira e Recebimento com estado atual em tempo real. Cards em scroll horizontal no mobile.
**Faixa 3 — KPIs do dia:** grid 4×2 com métricas de cada módulo (envase, checkout, empilhadeira, recebimento, checklist, limpeza, NFs).
**Faixa 4 — Pendências e alertas** (somente admin): alertas agrupados com badge de contagem e link direto para o módulo. Exibe mensagem verde "Tudo em dia" se sem pendências.
**Faixa 5 — Resumo da semana:** totais de todos os módulos desde segunda-feira.

---

### `/NotasFiscais` → Arquivo de Notas Fiscais *(novo em v8)*
**Propósito:** Listagem e busca no arquivo digital de NFs expedidas.
**Acesso:** Todos os usuários.

- Campo de busca proeminente com debounce 300ms (busca por número, destinatário, transportadora)
- Filtros: status arquivo, pode descartar, período (data expedição)
- Contadores: total, pendentes digitalização, prontas para descarte
- Tabela paginada (20/página) com badges coloridos de status
- Badge especial "Pode descartar" para NFs com retenção expirada
- Botão "Arquivar NF" → `/NovaNotaFiscal`
- Botão "NFs para descarte" (admin) com filtro automático

---

### `/NovaNotaFiscal` → Arquivar Nova Nota Fiscal *(novo em v8)*
**Propósito:** Cadastro de NF no arquivo digital.
**Acesso:** Todos os usuários.

**Seção 1 — Dados:** nº NF (verifica duplicidade ao sair do campo), série, chave de acesso (validação 44 dígitos), data emissão, data expedição, destinatário, CNPJ/CPF, transportadora, motorista, placa, observações.
**Seção 2 — Upload:** dois slots de arquivo (via empresa / via motorista) com botão de upload e botão de câmera (capture="camera" para celular). Status calculado automaticamente.
**Ao salvar:** calcula `data_validade_retencao = data_emissao + 5 anos`; faz upload via `UploadFile` da Base44; cria `NotaFiscalArquivo`.

---

### `/NotaFiscalDetalhe?id=` → Detalhes da Nota Fiscal *(novo em v8)*
**Propósito:** Visualização completa e gestão de uma NF.
**Acesso:** Todos (upload de arquivo); controle de descarte somente admin.

- Exibe todos os dados da NF
- Slots de arquivo: se existir → botão "Visualizar" (nova aba) + botão substituir; se não existir → área de upload com câmera
- Controle legal: data de validade em destaque, botão "Registrar descarte" (admin, com confirmação) quando `pode_descartar = true`
- Exibe "Papel descartado em [data]" quando `descartado = true`

---

### Demais telas
Ver versões anteriores da auditoria para `/NovoRegistro`, `/Registros`, `/Checkout`, `/NovaProgramacaoCheckout`, `/ExecutarCheckout`, `/Televisao`, `/Produtos`, `/Embalagens`, `/Operadores`, `/ImportarProdutos`, `/ImportarEmbalagens`, `/ImportarCategorias`.

---

## 3.A MÓDULO EMPILHADEIRA — TELAS ADICIONAIS

### `/Empilhadeira` → Painel da Empilhadeira
### `/NovaEmpilhaProgramacao` → Nova Programação
### `/ExecutarEmpilha?id=` → Executar Programação
### `/EmpilhadeiraConfig` → Config. Empilhadeira
### `/IndicadoresEmpilha` → Indicadores Empilhadeira

---

## 4. FLUXOS E REGRAS DE NEGÓCIO

### Fluxo de Checklist de Recebimento *(novo em v7)*
1. Usuário acessa `/ChecklistRecebimento` → clica "Novo Checklist"
2. Na **Seção 1**: digita o Nº do Pedido de Compras → ao sair do campo (onBlur), sistema busca em `SapPedido` pelo `numero_documento`
   - Encontrado: preenche automaticamente Nome/Código do Fornecedor e Data Prevista (somente leitura)
   - Não encontrado: mensagem de aviso, campos liberados para digitação manual
3. Preenche demais campos de identificação: descrição, datas, inspetores, NF, material, quantidade, lote
4. Na **Seção 2**: responde as 7 perguntas de conformidade (Sim/Não/N/A). Nota parcial atualiza em tempo real.
5. Se `material_recebimento = "Spray"`, o campo `spray_conforme_feps` é destacado visualmente.
6. Na **Seção 3**: adiciona observações (obrigatório se houver resposta "Não") e confere a nota final
7. Clica "Enviar Checklist" → sistema valida todos os campos obrigatórios → calcula e salva `total_sim`, `total_nao`, `soma_sim`, `soma_nao`, `nota_final` imutavelmente → redireciona para a listagem.
8. Na listagem, cada card de Recebimento vinculado exibe badge colorido com a nota.

### Fluxo de Importação da Base SAP *(novo em v7)*
1. Admin clica "Importar base SAP" (no painel `/ChecklistRecebimento` ou na aba "Base SAP" em Configurações)
2. Cola dados copiados do relatório SAP (formato TSV com 14 colunas)
3. Clica "Processar" → sistema faz parse linha a linha, ignora cabeçalho, exibe preview em tabela
4. Para cada linha: verifica se `numero_documento` já existe em `SapPedido` → marca "Novo" (verde) ou "Atualizar" (laranja)
5. Admin seleciona quais registros importar (checkbox por linha, padrão: todos)
6. Clica "Confirmar importação" → cria novos ou atualiza existentes → exibe resultado (X criados, Y atualizados)

### Fluxo de Recebimento *(novo em v6)*
1. Admin cria recebimento em `/NovoRecebimento` → status "Agendado"
2. Admin/operador acessa `/ExecutarRecebimento?id=` → clica "Iniciar" → registra `datetime_inicio` ISO 8601, status = "Em andamento"
3. Se necessário: "Pausar" → `datetime_pausa`; "Retomar" → `datetime_retomada` + calcula tempo pausado acumulado
4. Durante execução: operadores conferem itens (preenchem `quantidade_recebida`):
   - Qtd igual à prevista → `status_item = "OK"` automático
   - Qtd diferente → `status_item = "Divergência de quantidade"` + observação obrigatória
   - Manual: "Avaria" ou "Recusado" via select
5. Qualquer usuário pode registrar ocorrências. Somente admin marca como resolvida.
6. Ao finalizar: "Finalizar" → `datetime_fim`, calcula `tempo_produtivo_minutos` e `tempo_pausado_minutos`
7. Modal de assinatura etapa 1: cada participante assina individualmente → `RecebimentoParticipante.assinou = true`
   - Quando todos assinaram: `assinatura_coordenador = true`, `status_assinatura = "Parcial"`
8. Modal de assinatura etapa 2 (assíncrona — admin): `assinatura_lider = true`, `status_assinatura = "Completo"`
9. Regras de prioridade: "Urgente" sempre aparece no topo de todas as listagens
10. Recebimentos em andamento há mais de 4h sem atualização aparecem como pendência para admin

### Fluxo de Limpeza *(v5, atualizado em v6)*
1. Admin cadastra locais em `/GerenciarUsuarios` → aba "Locais de Limpeza"
2. Admin cria programações com múltiplos responsáveis
3. Modal de assinatura: cada responsável assina individualmente — quando todos assinaram, `assinatura_responsavel = true`
4. Líder (admin) assina → `status_assinatura = "Completo"`

### Fluxo de Registro de Envase / Check-out
Ver versões anteriores.

---

## 5. APIs E INTEGRAÇÕES

### Funções Serverless
**`atualizarCategorias`** — bulk update de categorias de produto
**`listarUsuarios`** — lista todos os usuários (admin only)
**`listarAdmins`** — lista admins para dropdowns de líder/supervisor
**`atualizarRoleUsuario`** — altera role de usuário via asServiceRole (admin only)
**`notificarOcorrencia`** — envia e-mail para admins sobre ocorrências

---

## 6. AUTENTICAÇÃO E AUTORIZAÇÃO

- **Mecanismo:** Base44 (email + senha)
- **Perfis:** `admin` e `operator`
- **Roles e permissões:**
  - `operator`: Ver programações, executar linhas, conferir itens de recebimento, registrar ocorrências, assinar individualmente, ver bloco de limpeza e recebimento no Dashboard
  - `admin`: Tudo do operator + criar/editar/cancelar recebimentos, criar programações de limpeza, assinar como líder, ver indicadores, gerenciar configurações
- **Rotas protegidas (somente admin):** `/NovaEmpilhaProgramacao`, `/IndicadoresEmpilha`, `/EmpilhadeiraConfig`, `/GerenciarUsuarios`, `/NovoRecebimento`, `/IndicadoresRecebimento`
- **Badge do menu:** inclui pendências de empilhadeira + limpeza + recebimento (aguardando líder + ocorrências abertas + em andamento > 4h)

---

## 7. INFRAESTRUTURA ATUAL

| Item | Detalhe |
|---|---|
| Plataforma | Base44 (BaaS completo) |
| Hosting frontend | Base44 (CDN gerenciado) |
| Banco de dados | Base44 (gerenciado, sem acesso direto) |
| Functions (backend) | Deno Deploy via Base44 |
| Domínio | interlub-envase.online |
| Storage de arquivos | Base44 UploadFile (fotos de operadores + NFs expedidas via URL pública) |

---

## 10. ESTRUTURA DE ARQUIVOS (principais)

```
src/
├── pages/
│   ├── Dashboard.jsx
│   ├── NovoRegistro.jsx
│   ├── Registros.jsx
│   ├── Checkout.jsx
│   ├── Empilhadeira.jsx
│   ├── ExecutarEmpilha.jsx
│   ├── NovaEmpilhaProgramacao.jsx
│   ├── EmpilhadeiraConfig.jsx
│   ├── IndicadoresEmpilha.jsx
│   ├── GerenciarUsuarios.jsx
│   ├── Recebimento.jsx          ← novo v6
│   ├── NovoRecebimento.jsx      ← novo v6
│   ├── ExecutarRecebimento.jsx  ← novo v6
│   └── IndicadoresRecebimento.jsx ← novo v6
├── components/
│   ├── dashboard/
│   │   ├── BlocoLimpeza.jsx
│   │   └── BlocoRecebimento.jsx  ← novo v6
│   ├── limpeza/
│   │   ├── ModalLimpezaProgramacao.jsx
│   │   ├── ModalAssinaturaLimpeza.jsx
│   │   ├── AbaLocaisLimpeza.jsx
│   │   └── AbaProgramacaoLimpeza.jsx
│   ├── recebimento/              ← nova pasta v6
│   │   ├── RecebimentoCard.jsx
│   │   ├── ModalOcorrenciaRecebimento.jsx
│   │   ├── ModalAssinaturaRecebimento.jsx
│   │   └── AbaFornecedoresRecebimento.jsx
│   └── empilhadeira/
│       └── ...
├── entities/
│   ├── Product.json
│   ├── Operator.json
│   ├── EnvaseRecord.json
│   ├── CheckoutProgramacao.json
│   ├── CheckoutItem.json
│   ├── LimpezaLocal.json
│   ├── LimpezaProgramacao.json
│   ├── RecebimentoFornecedor.json  ← novo v6
│   ├── Recebimento.json            ← novo v6
│   ├── RecebimentoParticipante.json ← novo v6
│   ├── RecebimentoItem.json        ← novo v6
│   ├── RecebimentoOcorrencia.json  ← novo v6
│   └── EmpilhadeiraConfig.json, ...
└── functions/
    ├── listarUsuarios.js
    ├── atualizarRoleUsuario.js
    ├── listarAdmins.js
    ├── atualizarCategorias.js
    └── notificarOcorrencia.js
```

---

## HISTÓRICO DE MUDANÇAS

| Data | Versão | Descrição da mudança |
|---|---|---|
| 2026-05-28 | v1 | Documento de auditoria inicial criado |
| 2026-05-28 | v2 | Módulo empilhadeira completo (6 entidades, 5 páginas) |
| 2026-05-29 | v3 | EmpilhadeiraParada, filtros, IndicadoresEmpilha, TV carrossel |
| 2026-05-29 | v4 | Roles admin/operator, assinaturas 3 etapas, RotaProtegidaAdmin, PainelPendenciasAdmin |
| 2026-05-29 | v4.1 | Fix KPIs, assinatura dupla, tempo negativo; /GerenciarUsuarios |
| 2026-05-29 | v5 | Módulo Limpeza: LimpezaLocal + LimpezaProgramacao, bloco no Dashboard, assinaturas em 2 etapas, abas em Configurações |
| 2026-05-29 | v6 | Módulo completo de controle de recebimento: 5 novas entidades (RecebimentoFornecedor, Recebimento, RecebimentoParticipante, RecebimentoItem, RecebimentoOcorrencia), páginas /Recebimento, /NovoRecebimento, /ExecutarRecebimento, /IndicadoresRecebimento; BlocoRecebimento no Dashboard; aba Fornecedores em Configurações; pendências de recebimento integradas ao badge do menu; assinaturas individuais por participante; suporte a múltiplos responsáveis na limpeza |
| 2026-06-01 | v7 | Módulo de checklist de recebimento: entidades SapPedido e ChecklistRecebimento, formulário /NovoChecklist com autopreenchimento via busca na base SAP, cálculo de nota (Sim +10, Não -10, N/A neutro), página /ChecklistRecebimento com KPIs e listagem, /ChecklistDetalhe com visualização completa, importação de base SAP via cola de dados TSV com preview e seleção, indicadores de checklist (por fornecedor/campo/inspetor) em aba nova de /IndicadoresRecebimento, aba "Base SAP" em Configurações, badge de checklist nos cards de Recebimento, link "Checklist Recebimento" no menu lateral |
| 2026-06-01 | v8 | Módulo de arquivo digital de NFs com entidade NotaFiscalArquivo (digitalização de 2 vias, controle de retenção 5 anos, busca por número); páginas /NotasFiscais (listagem com busca debounced, filtros, paginação, badges de status), /NovaNotaFiscal (formulário com upload de arquivo + câmera), /NotaFiscalDetalhe (visualização, upload inline, controle de descarte); Painel Geral /Painel com 5 faixas (cabeçalho com relógio ao vivo, em andamento com polling 30s, KPIs do dia, pendências admin, resumo semana); menu lateral reorganizado com Painel como primeiro item e Notas Fiscais adicionado |

---

*Documento mantido em sincronização com o código. Última atualização: 29/05/2026*