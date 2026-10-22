# Importação Base44 → EnvasePro

Carga **completa e reexecutável** do histórico da Base44 no Supabase. Cada execução
**limpa** as 22 tabelas que a Base44 alimenta e importa tudo de novo — o ensaio de
hoje e a carga do go-live são o mesmo comando, só muda o export.

- Importador: `scripts/importar-base44.mjs` (módulos em `scripts/importacao/`).
- Acesso ao banco **só pela CLI do Supabase**: local `supabase db query`; produção
  `supabase db query --linked` (login da CLI). **Nunca a service key.**
- Contas de usuário **não** são importadas (o dono as cria pelo sistema). Não toca em
  `user_profiles`, `auditoria_usuarios` nem `notificacao_destinatarios`.
- Exports e relatórios ficam **fora do git**: `exports-base44/` está no `.gitignore`
  e a saída padrão é `~/EnvasePro-importacao/` (fora do repositório; o script recusa
  saída dentro dele).

---

## 1. Mapa Base44 → Supabase

**Toda propriedade das 22 entidades da Base44 tem coluna de mesmo nome no banco**
(conferido contra `base44/entities/*.jsonc`). O que muda é só o tratamento:

| Base44 | Supabase | Tratamento |
|---|---|---|
| `id` (24 hex) | `id uuid` | Determinístico: `00000000-XXXX-XXXX-XXXX-XXXXXXXXXXXX`. O mesmo id gera o mesmo uuid em toda carga, então as referências entre tabelas (ex.: `programacao_id`, `sap_pedido_id`, `operator_id` do participante) se preservam sem tabela de tradução. |
| `created_date` / `updated_date` | `created_at` / `updated_at` | São **UTC** sem fuso (medido: em 97% dos envases o `created_date` em UTC bate com a hora de início em Brasília). Gravados como estão: os gatilhos de data só agem em UPDATE, logo os valores originais são preservados. |
| `created_by`, `created_by_id`, `is_sample` | — | Sem destino (contas não são importadas). |
| campos de **data** (`data`, `data_programada`, `data_entrega`...) | `date` | Texto `AAAA-MM-DD` gravado direto: **sem conversão de fuso, o dia não muda**. Data inexistente (ex.: 30/02) → quarentena. |
| campos de **hora** (`inicio`, `hora_termino`...) | `time` | `HH:MM` → `HH:MM:00`. Hora inválida → quarentena. |
| `datetime_*` (recebimento) | `timestamptz` | Mesma regra do `created_date` (UTC). |
| números | `numeric` / `integer` | `Number()` sem arredondar; inteiro com fração → quarentena. |
| `true` / `false` | `boolean` | Qualquer outro valor → quarentena. |
| `""` (vazio) | `NULL` | Em qualquer tipo. Vazio em coluna obrigatória → quarentena. |
| listas JSON (`inspecionado_por`) | `text[]` | `["Alisson","Lucas"]` → array. |
| listas de objetos (`responsaveis`) | `jsonb` | JSON como veio. |
| valores de lista fechada (sala, status, tipo...) | `enum` | Fora do domínio → quarentena. |
| **nome** do operador (`operador`, `operador_empilhadeira`, `registrado_por`, `criado_por`, `arquivado_por_nome`) | nome **+** `*_id` | A Base44 guardava só o nome. O `*_id` é resolvido pelo cadastro (sem diferenciar maiúsculas). Nome sem cadastro: se o `*_id` é obrigatório → quarentena; se não → id vazio, nome mantido (relatado). |
| — | **protocolo** (`protocolo`, `codigo_programacao`, `numero_checklist`, `protocolo_recebimento`, `protocolo_arquivo`) | A Base44 **não tinha protocolo**. O importador grava `PREFIXO-AAAA-NNNNNN`: AAAA = ano de **criação** do registro (Brasília), NNNNNN = ordem cronológica de criação, único na tabela. Se um export futuro trouxer protocolo, ele é **preservado**. |
| — | `nota_fiscal_arquivos.data_arquivo` | = dia de criação original (Brasília). **Não** a data da importação: a retenção legal de 5 anos (`data_expiracao_legal`, coluna gerada) conta da data original. |
| `checklist.criado_por_nome` | `criado_por_nome` (+ `criado_por_id` vazio) | Guarda a **conta** (`operacoes.equipe`, `pcp-brasil`), não um operador. |
| `checklist.total_sim/total_nao/soma_*/nota_final` | recalculados | O gatilho do banco recalcula; a verificação compara com o valor da Base44. |
| `foto_url` (operador), `arquivo_url` (NF) | **caminho** no bucket | Ver §4. |

Tabelas, na ordem de carga (pais antes dos filhos): `products`, `embalagens`,
`operators`, `sap_pedidos`, `empilhadeira_configs`, `recebimento_fornecedores`,
`limpeza_locais`, `checkout_programacoes`, `checkout_itens`, `envase_records`,
`empilha_programacoes`, `empilha_linhas`, `empilha_ocorrencias`,
`empilhadeira_paradas`, `empilhadeira_manutencoes`, `limpeza_programacoes`,
`recebimentos`, `recebimento_itens`, `recebimento_participantes`,
`recebimento_ocorrencias`, `checklist_recebimentos`, `nota_fiscal_arquivos`.

## 2. Validação e travas

Na ordem, por tabela; cada linha que falha vai para a **quarentena** e a carga segue:

1. **Tipo e domínio** de cada campo (tabela acima).
2. **Obrigatórios** (`NOT NULL` sem valor padrão).
3. **Únicos** (`products.codigo`, `embalagens.codigo`): fica o registro **mais
   recente** (`updated_date`); os outros vão para a quarentena, marcados como
   *cópia idêntica* ou *com diferenças*.
4. **Chaves estrangeiras** contra o que já foi **aceito** nas tabelas-pai (um pai na
   quarentena leva os filhos junto — relatado).
5. **CHECKs do banco** (`nota_final`, `operator_id` obrigatório quando
   `status <> 'Pendente'`, quantidades `>= 0`, `dificuldade_codigo` 0–3...):
   avaliados **pelo próprio banco**, com a mesma expressão, sem gravar
   (`json_populate_recordset` + `not (<expressão do CHECK>)`). Não há cópia das
   regras no script para ficar desatualizada.

Gravação: cada lote (~1 MB) é **um** bloco `DO` (uma transação). Dentro dele,
`set_config('request.jwt.claim.role','service_role', true)` — é a exceção que a trava
`protect_status_completo` prevê para o sistema; sem ela, todo registro histórico já
assinado ("Completo") seria recusado. As demais travas (`protect_*` de colunas
imutáveis, escrita única e admin) só agem em **UPDATE** e não interferem na inserção.
`data_expiracao_legal` (gerada) nunca é enviada.

## 3. Quarentena e decisões do dono

Nada é corrigido em silêncio. Sem `--decisoes`, tudo que viola regra vai para a
quarentena. Tratamentos alternativos só por decisão explícita em JSON
(`scripts/importacao/decisoes-propostas.json` é a **proposta**, com a evidência de
cada item):

| Chave | Opções | Proposta |
|---|---|---|
| `aliases_operador` | `{ "nome no histórico": "nome no cadastro" }` | Jorge → Jorge Willian; Maike → Mike |
| `operadores_historicos` + `sala_operador_historico` | nomes a criar como **inativos** | Renan (Ambas) |
| `operador_sem_sala` | `quarentena` · `Bio` · `Industrial` · `Ambas` | Ambas |
| `checkout_concluido_sem_operador` | `quarentena` · `importar_como_pendente` | quarentena |
| `checklist_sap_inexistente` | `quarentena` · `anular_referencia` | anular_referencia |
| `produto_inexistente` | `quarentena` · `criar_produto_do_registro` | quarentena (os códigos parecem digitados errado) |
| `aliases_codigo_produto` | `{ "código no histórico": "código no cadastro" }` | vazio — o dono indica |
| `normalizar_codigo_produto` | `true` · `false` (espaços/maiúsculas) | true |
| (automático) campo vazio com `default` no esquema da Base44 | — | aplica o padrão que a Base44 mostrava, e **relata** cada um |
| `apostrofo_exportador` | `manter` · `remover` | remover |
| `foto_inacessivel` | `manter_url_original` · `anular` | anular |

Saída (fora do repositório): `quarentena.csv` (tabela, entidade, **id original**,
regra, campo, valor), `tratamentos-aplicados.csv`, `anexos.csv`, `relatorio.json`,
`resumo.txt`.

## 4. Anexos

Fotos de operador (`foto_url`) e arquivos de NF (`arquivo_url`): URL da Base44 **ou**
nome de arquivo numa pasta (`--anexos=<pasta>`).

- Validação pelo **conteúdo** (magic bytes: JPEG, PNG, WebP, PDF) — a Base44 manda
  tudo como `application/octet-stream`, então extensão e content-type não valem nada.
- Limite de tamanho e tipos **do próprio bucket**: `fotos-operadores` 10 MB
  (JPEG/PNG/WebP), `notas-fiscais` 20 MB (PDF/JPEG/PNG).
- Nome seguro, derivado do id: `importacao/<uuid>.<ext>` (nunca o nome original).
- O banco guarda o **caminho**; as telas geram URL assinada como para qualquer upload.
- Envio pela API de Storage com a sessão de um **admin** (e-mail e senha), não a
  service key. Reexecução: apaga antes só o que está sob `importacao/`.
- Problema (faltando, corrompido, grande demais, tipo não aceito): foto → conforme a
  decisão; **NF → quarentena** (registro de NF sem o documento engana quem consulta).
- Antes de limpar, o script **aborta** se houver arquivo no Storage que não veio da
  importação (ficaria órfão quando a tabela for limpa); `--aceitar-orfaos` só se
  for intencional.

## 5. Sequences de protocolo

Depois da carga, cada uma das 6 sequences (a allowlist de `gerar_protocolo`) vai para
o maior número importado (`setval(seq, max, true)`). A verificação chama o próprio
`gerar_protocolo` e confere que o próximo número é **max + 1 e não colide**; depois
devolve a sequence ao ponto (o teste consome um número).

## 6. Verificação automática (sai em `resumo.txt`, em linguagem simples)

- Contagem por tabela: exportado → quarentena → criados pela importação → esperado → no banco.
- Somas de controle: quantidade produzida e embalagens dos envases; envases, itens de
  check-out e programações **por mês**.
- Amostra aleatória (padrão 25 por tabela) comparada **campo a campo** com o banco.
- FKs órfãs = 0 (todas as chaves estrangeiras entre as tabelas importadas).
- Duplicatas = 0 (ids, protocolos, únicos).
- Notas do checklist recalculadas pelo gatilho × valores da Base44 (lista as divergências).
- Próximo protocolo de cada sequence.
- Telas com os dados reais: `node scripts/medir-telas-importacao.mjs` (local; tempo,
  requisições, KB e erros por tela).

## 7. Comandos

```powershell
# Validar sem gravar (pode rodar em qualquer alvo; não escreve nada)
node scripts/importar-base44.mjs --dir=exports-base44/<data> --decisoes=<decisoes.json> --so-validar

# ENSAIO no Supabase local (padrão)
node scripts/importar-base44.mjs --dir=exports-base44/<data> --decisoes=<decisoes.json> [--anexos=<pasta>]
node scripts/medir-telas-importacao.mjs

# PRODUÇÃO — só com autorização escrita do dono, depois do relatório do ensaio
$env:IMPORT_PROD_ANON_KEY = "<chave pública anon do projeto>"
$env:IMPORT_ADMIN_EMAIL   = "<conta admin>"
$env:IMPORT_ADMIN_SENHA   = Read-Host "senha"
node scripts/importar-base44.mjs --dir=exports-base44/<data> --decisoes=<decisoes.json> `
  --producao --allow-production --confirm-ref=xifzjpbkpxislqrowswd
```

## 8. Passo a passo do go-live

1. **Congelar a Base44**: avisar a fábrica; ninguém lança mais nada nela.
2. **Exportar** todas as 22 entidades (CSV) para `exports-base44/<data>/`, com os
   anexos de NF numa subpasta, se a Base44 entregar arquivos e não URLs. Conferir que
   nenhum arquivo veio com 0 byte sem motivo.
3. **Validar sem gravar** (`--so-validar`) e revisar a quarentena com o dono.
   Ajustar o arquivo de decisões.
4. **Ensaio local** com o export final; conferir `resumo.txt` (tudo "ok") e as telas.
5. **Snapshot de produção, verificado** (`scripts/backup/snapshot-producao.mjs` +
   `verificar-snapshot.mjs`, restauração testada no banco local).
6. **Autorização escrita do dono.**
7. **Carga em produção** (comando do §7). Guardar a pasta de saída.
8. **Conferir**: `resumo.txt` com "VERIFICAÇÃO: TUDO CONFERE"; sequences OK; abrir
   Registros, Dashboard, Indicadores, Notas Fiscais e TVs logado.
9. Criar as contas (operador, TV) e seguir o restante do GO-LIVE.md.

**Reversão**: a carga começa limpando as 22 tabelas, então desfazer = restaurar o
snapshot do passo 5 (`scripts/backup/`). Reexecutar a carga também é seguro: ela é
idempotente (mesmos ids, mesmos protocolos para o mesmo export).

## 9. Tempo estimado

Ensaio local com o export de 21/10/2026 (≈ 18 mil registros): **4min30s** a 7min40s
por carga completa (139 chamadas ao banco), mais ~30 s de validação. Em produção a
CLI passa pela API de gerenciamento do Supabase: contar **~10–15 min** de carga e
reservar **1 h** de janela para validar, carregar, conferir e abrir as telas.
**NÃO MEDIDO em produção** (nada foi gravado lá).

## 10. Resultados dos ensaios — 21/10/2026, Supabase local

**Export real de hoje** (`exports-base44/2026-10-21`, 22 CSVs; 14 entidades vieram
**vazias**: empilhadeira, limpeza, recebimento e notas fiscais; nenhum anexo além das
6 fotos de operador por URL). Com as decisões propostas:

| Tabela | Exportado | Quarentena | Criados | No banco |
|---|---:|---:|---:|---:|
| products | 2.906 | 1.340 | 0 | 1.566 |
| embalagens | 53 | 1 | 0 | 52 |
| operators | 13 | 0 | 1 (Renan, inativo) | 14 |
| sap_pedidos | 103 | 1 | 0 | 102 |
| checkout_programacoes | 219 | 0 | 0 | 219 |
| checkout_itens | 8.565 | 12 | 0 | 8.553 |
| envase_records | 6.446 | 54 | 0 | 6.392 |
| checklist_recebimentos | 48 | 0 | 0 | 48 |

Verificação: contagens, somas (221.064,948 de quantidade produzida; 29.579
embalagens; totais por mês), amostra de 25 por tabela campo a campo, 0 FK órfã em 34,
0 duplicata em 32 colunas, 48/48 notas de checklist iguais às da Base44, 6 sequences
com o próximo número correto, 6/6 fotos validadas e servidas por URL assinada.
Reexecutada 4 vezes (inclusive real → sintético → real): mesmos números, sem resto.

Telas (`medir-telas-importacao.mjs`, build de produção local, histórico completo):
Dashboard 3,5 s; Registros 0,8 s (5,5 MB); Check-out 0,8 s (5,1 MB); Produtos 1,5 s;
Painel 2,1 s; demais 0,6–0,7 s; nenhum erro. **Registros e Check-out baixam o
histórico inteiro (~5 MB cada)**: no local não pesa; na rede da fábrica vai pesar.

**Export sintético** (`scripts/importacao/gerar-export-sintetico.mjs`, as 14
entidades vazias no formato da Base44): registros já assinados ("Completo") entram
(6 linhas de empilhadeira, 1 limpeza, 1 recebimento); NF com data original
(retenção até 2030 para NF de 2025) e protocolo `NFA-2025-…`; quarentena exatamente
a plantada (domínio, data 30/02, operador desconhecido em linha concluída, FK,
anexo corrompido / 21 MB / faltando / executável com extensão .png).

## 11. Carga em PRODUÇÃO — 22/10/2026

Autorizada por escrito pelo dono, com as decisões finais
(`scripts/importacao/decisoes-finais.json`). Snapshot antes, verificado com
restauração no banco local (24 OK): `C:\Users\kauan.pereira\EnvasePro-backups\prod_2026-10-22T07-57-35_PRE-CARGA-BASE44`.
Produção conferida vazia imediatamente antes (0 linhas nas 22 tabelas, 0 arquivos).

- Primeira tentativa: **parou antes de gravar** — `413 request entity too large` na
  validação dos CHECKs (o lote ia uma vez por regra, ~7 MB). Medido o teto da API de
  gerenciamento: **2,5 MB passa, 4 MB recusa**. Corrigido (lote único por consulta,
  ~900 KB). Validação só leitura em produção (`--so-validar`) idêntica ao ensaio local.
- Carga: **673 s (11min13s)**, 136 chamadas, 0 repetições. Verificação em produção:
  contagens, somas (221.064,948 / 29.579), amostra campo a campo, 0 FK órfã, 0
  duplicata, 48/48 notas de checklist, sequences em max+1 (conferidas só por leitura em
  produção; o teste que gera número roda no local). 6/6 fotos abrem por URL assinada.
- Em produção a verificação de sequence é só leitura (`last_value`), para não consumir
  número.
