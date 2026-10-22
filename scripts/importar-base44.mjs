/**
 * scripts/importar-base44.mjs — carga COMPLETA da Base44 no Supabase, reexecutável.
 *
 * Cada execução LIMPA as 22 tabelas que a Base44 alimenta e reimporta tudo do
 * zero (go-live = repetir com o export final). Não importa contas de usuário
 * (o dono as cria pelo sistema) e não toca em user_profiles, auditoria nem
 * nos destinatários de alerta.
 *
 * NUNCA descarta nem corrige em silêncio: linha que viola regra vai para a
 * QUARENTENA (arquivo fora do repositório) com tabela, id original, regra e
 * valor; o resto segue. Tratamentos alternativos só com decisão explícita do
 * dono no arquivo de decisões (--decisoes).
 *
 * Acesso ao banco só pela CLI do Supabase (scripts/importacao/banco.mjs):
 *   local    (padrão)  `supabase db query`
 *   produção           `supabase db query --linked` — login da CLI, nunca a service key
 *
 * Uso:
 *   node scripts/importar-base44.mjs --dir=exports-base44/2026-10-21 [opções]
 *     --decisoes=<arquivo.json>   tratamentos escolhidos pelo dono (padrão: tudo em quarentena)
 *     --anexos=<pasta>            arquivos de NF/fotos que não vierem como URL
 *     --saida=<pasta>             relatórios (padrão: ~/EnvasePro-importacao/<data>-<modo>)
 *     --so-validar                não grava nada: só lê, valida e gera a quarentena
 *     --sem-anexos                não baixa/envia anexos (mantém foto_url como veio)
 *     --amostra=N                 registros por tabela na conferência campo a campo (padrão 25)
 *   Produção (só com autorização escrita do dono e snapshot verificado):
 *     --producao --allow-production --confirm-ref=xifzjpbkpxislqrowswd
 *     IMPORT_PROD_ANON_KEY  (chave pública anon, para o envio de anexos)
 *     IMPORT_ADMIN_EMAIL / IMPORT_ADMIN_SENHA  (conta admin que envia os anexos)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { lerCsv } from './lib/csv.mjs';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarBanco, literalJson, ident, REF_PRODUCAO } from './importacao/banco.mjs';
import {
  ENTIDADES, TABELAS, PROTOCOLOS, PARES_OPERADOR, CAMPOS_SEM_DESTINO, converter, idBase44ParaUuid,
  uuidDerivado, normalizarNome, diaEmBrasilia, temApostrofoExportador,
} from './importacao/regras.mjs';
import { BUCKETS, PREFIXO, obterBytes, validar, criarEnvio } from './importacao/anexos.mjs';

dotenv.config({ path: '.env.local', quiet: true });
const arg = (n, d = null) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const tem = (n) => process.argv.includes(`--${n}`);

// ── Alvo ────────────────────────────────────────────────────────────────────
const PRODUCAO = tem('producao');
if (PRODUCAO) {
  if (!tem('allow-production') || arg('confirm-ref') !== REF_PRODUCAO) {
    console.error(`Recusado: produção exige --producao --allow-production --confirm-ref=${REF_PRODUCAO}`);
    process.exit(2);
  }
} else {
  enforceNonProductionGuard('importar-base44'); // local: aborta se o .env.local apontar para fora
}
const SO_VALIDAR = tem('so-validar');
const SEM_ANEXOS = tem('sem-anexos');
const DIR = arg('dir');
if (!DIR || !fs.existsSync(DIR)) { console.error('Informe --dir=<pasta do export>'); process.exit(2); }
const MODO = PRODUCAO ? 'producao' : 'local';
const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const SAIDA = path.resolve(arg('saida', path.join(os.homedir(), 'EnvasePro-importacao', `${carimbo}-${MODO}${SO_VALIDAR ? '-validacao' : ''}`)));
if (SAIDA.startsWith(path.resolve('.') + path.sep)) { console.error('A saída tem de ficar FORA do repositório (dados reais).'); process.exit(2); }
fs.mkdirSync(SAIDA, { recursive: true });
const N_AMOSTRA = Number(arg('amostra', '25'));

const DECISOES_PADRAO = {
  aliases_operador: {},              // { "Nome no histórico": "Nome no cadastro" }
  operadores_historicos: [],         // nomes a criar como operador INATIVO
  sala_operador_historico: null,     // sala dos operadores históricos criados (Bio | Industrial | Ambas)
  operador_sem_sala: 'quarentena',   // ou Bio | Industrial | Ambas
  checkout_concluido_sem_operador: 'quarentena', // ou importar_como_pendente
  checklist_sap_inexistente: 'quarentena',       // ou anular_referencia
  produto_inexistente: 'quarentena',             // ou criar_produto_do_registro
  apostrofo_exportador: 'manter',                // ou remover
  foto_inacessivel: 'manter_url_original',       // ou anular
  aliases_codigo_produto: {},                    // { "código no histórico": "código no cadastro" } (indicado pelo dono)
  normalizar_codigo_produto: false,
  todos_operadores_ativos: false,                // true: todo operador entra ativo (inclusive os históricos)              // true: " ivp0736" → "IVP0736" quando o normalizado existe
};
const DECISOES = { ...DECISOES_PADRAO, ...(arg('decisoes') ? JSON.parse(fs.readFileSync(arg('decisoes'), 'utf8')) : {}) };
{
  const ok = (v, ops) => ops.includes(v);
  const problemas = [
    !ok(DECISOES.operador_sem_sala, ['quarentena', 'Bio', 'Industrial', 'Ambas']) && 'operador_sem_sala',
    !ok(DECISOES.checkout_concluido_sem_operador, ['quarentena', 'importar_como_pendente']) && 'checkout_concluido_sem_operador',
    !ok(DECISOES.checklist_sap_inexistente, ['quarentena', 'anular_referencia']) && 'checklist_sap_inexistente',
    !ok(DECISOES.produto_inexistente, ['quarentena', 'criar_produto_do_registro']) && 'produto_inexistente',
    !ok(DECISOES.apostrofo_exportador, ['manter', 'remover']) && 'apostrofo_exportador',
    !ok(DECISOES.foto_inacessivel, ['manter_url_original', 'anular']) && 'foto_inacessivel',
    typeof DECISOES.normalizar_codigo_produto !== 'boolean' && 'normalizar_codigo_produto',
    typeof DECISOES.todos_operadores_ativos !== 'boolean' && 'todos_operadores_ativos',
    DECISOES.operadores_historicos.length && !ok(DECISOES.sala_operador_historico, ['Bio', 'Industrial', 'Ambas']) && 'sala_operador_historico (obrigatória quando há operadores_historicos)',
  ].filter(Boolean);
  if (problemas.length) { console.error(`Decisões inválidas: ${problemas.join(', ')}`); process.exit(2); }
}

const banco = criarBanco({ producao: PRODUCAO });
const t0 = Date.now();
const log = (...a) => console.log(...a);
log('='.repeat(78));
log(`IMPORTAÇÃO BASE44 → ${PRODUCAO ? `PRODUÇÃO (${REF_PRODUCAO})` : 'SUPABASE LOCAL'}${SO_VALIDAR ? ' — SÓ VALIDAÇÃO (não grava)' : ''}`);
log(`export: ${path.resolve(DIR)}\nsaída : ${SAIDA}`);
log('='.repeat(78));

// ── 1. Export ───────────────────────────────────────────────────────────────
const exportado = {};
for (const [ent] of ENTIDADES) {
  const f = path.join(DIR, `${ent}_export.csv`);
  exportado[ent] = fs.existsSync(f) ? lerCsv(f) : { cabecalho: [], linhas: [], faltando: true };
}

// Padrões ("default") declarados nos esquemas das entidades da Base44.
const PADROES_B44 = {};
for (const [ent] of ENTIDADES) {
  const f = path.join('base44', 'entities', `${ent}.jsonc`);
  if (!fs.existsSync(f)) continue;
  const props = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '')).properties || {};
  PADROES_B44[ent] = Object.fromEntries(Object.entries(props).filter(([, v]) => 'default' in v).map(([k, v]) => [k, v.default]));
}

// ── 2. Esquema do banco (lido do próprio alvo) ──────────────────────────────
const lista = TABELAS.map((t) => `'${t}'`).join(',');
const colunasRows = banco.sql(`select c.table_name t, c.column_name c, c.data_type tipo, c.udt_name udt, c.is_nullable = 'YES' nulo,
  c.column_default is not null tem_padrao, c.is_generated = 'ALWAYS' gerada,
  (select coalesce(json_agg(e.enumlabel order by e.enumsortorder), '[]') from pg_type ty join pg_enum e on e.enumtypid = ty.oid where ty.typname = c.udt_name) dominio
  from information_schema.columns c where c.table_schema = 'public' and c.table_name in (${lista}) order by c.table_name, c.ordinal_position`);
const COLS = {};
for (const r of colunasRows) {
  (COLS[r.t] ||= {})[r.c] = { tipo: r.tipo, udt: r.udt, nulo: r.nulo, temPadrao: r.tem_padrao, gerada: r.gerada, dominio: r.dominio };
}
const FKS = banco.sql(`select cl.relname t, a.attname c, cf.relname rt, af.attname rc from pg_constraint k
  join pg_class cl on cl.oid = k.conrelid join pg_class cf on cf.oid = k.confrelid
  join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
  join pg_attribute af on af.attrelid = k.confrelid and af.attnum = k.confkey[1]
  where k.contype = 'f' and k.connamespace = 'public'::regnamespace and cl.relname in (${lista})`);
const UNICOS = banco.sql(`select cl.relname t, a.attname c from pg_constraint k join pg_class cl on cl.oid = k.conrelid
  join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
  where k.contype = 'u' and array_length(k.conkey, 1) = 1 and cl.relname in (${lista})`);
const CHECKS = banco.sql(`select cl.relname t, k.conname n, pg_get_constraintdef(k.oid) d from pg_constraint k
  join pg_class cl on cl.oid = k.conrelid where k.contype = 'c' and cl.relname in (${lista})`);

// ── 3. Transformação e validação, tabela a tabela, na ordem das FKs ─────────
const aceitos = {};          // tabela → [registro]
const chaves = {};           // "tabela.coluna" → Set de valores aceitos (para as FKs)
const quarentena = [];       // { tabela, entidade, id_original, regra, campo, valor }
const avisos = [];           // tratamentos aplicados por decisão + observações
const criados = {};          // tabela → n registros criados pela importação
const camposIgnorados = {};
const origemPorId = new Map(); // uuid → linha original (para a amostra e o checklist)
const apostrofos = { encontrados: 0 };
const operadorPorNome = new Map();

const pararLinha = (tabela, ent, idOrig, regra, campo, valor) => quarentena.push({ tabela, entidade: ent, id_original: idOrig, regra, campo: campo ?? '', valor: valor == null ? '' : String(valor).slice(0, 200) });
const registrarChaves = (t, rec) => { for (const c of Object.keys(COLS[t])) { if (rec[c] != null) ((chaves[`${t}.${c}`] ||= new Set())).add(String(rec[c])); } };

function resolverOperador(nome) {
  if (!nome) return null;
  const alvo = DECISOES.aliases_operador[nome] ?? DECISOES.aliases_operador[String(nome).trim()] ?? nome;
  return operadorPorNome.get(normalizarNome(alvo)) ?? null;
}

function criarOperadorHistorico(nome, criadoEm) {
  const id = uuidDerivado(`operador:${normalizarNome(nome)}`);
  const rec = { id, nome: String(nome).trim(), matricula: null, sala: DECISOES.sala_operador_historico, ativo: DECISOES.todos_operadores_ativos, foto_url: null, created_at: criadoEm, updated_at: criadoEm };
  aceitos.operators.push(rec);
  registrarChaves('operators', rec);
  operadorPorNome.set(normalizarNome(nome), id);
  criados.operators = (criados.operators || 0) + 1;
  avisos.push({ tabela: 'operators', id_original: '', tratamento: `operador histórico criado (${DECISOES.todos_operadores_ativos ? 'ativo' : 'inativo'})`, detalhe: rec.nome });
  return id;
}

for (const [ent, tabela] of ENTIDADES) {
  const cols = COLS[tabela];
  if (!cols) throw new Error(`tabela ${tabela} não existe no alvo`);
  const { cabecalho, linhas } = exportado[ent];
  camposIgnorados[tabela] = cabecalho.filter((h) => !CAMPOS_SEM_DESTINO.has(h) && !['created_date', 'updated_date'].includes(h) && !cols[h]);
  const candidatos = [];

  for (const linha of linhas) {
    const idOrig = linha.id;
    const rec = {};
    const erros = [];
    for (const h of cabecalho) {
      if (CAMPOS_SEM_DESTINO.has(h) || camposIgnorados[tabela].includes(h)) continue;
      const destino = h === 'created_date' ? 'created_at' : h === 'updated_date' ? 'updated_at' : h;
      const col = cols[destino];
      let bruto = linha[h];
      // Vazio em campo que o esquema da Base44 declara com "default": a Base44
      // mostrava esse padrão para o registro. Aplicado e relatado, nunca em silêncio.
      if (bruto === '' && PADROES_B44[ent]?.[h] !== undefined) {
        bruto = String(PADROES_B44[ent][h]);
        avisos.push({ tabela, id_original: idOrig, tratamento: `${h} vazio → padrão declarado na Base44 (${bruto})`, detalhe: '' });
      }
      if (col.tipo === 'text' && temApostrofoExportador(bruto)) {
        apostrofos.encontrados += 1;
        if (DECISOES.apostrofo_exportador === 'remover') bruto = bruto.slice(1);
      }
      const r = converter(bruto, { tipo: col.tipo === 'USER-DEFINED' || col.tipo === 'ARRAY' ? col.tipo : col.tipo, dominio: col.dominio });
      if (r.erro) erros.push([`${r.erro}`, destino, bruto]); else rec[destino] = r.valor;
    }
    if (!rec.id) erros.push(['id ausente ou inválido', 'id', idOrig]);

    // Tratamentos específicos (cada um só por decisão explícita; senão, quarentena).
    if (tabela === 'operators' && DECISOES.todos_operadores_ativos && rec.ativo === false) {
      rec.ativo = true;
      avisos.push({ tabela, id_original: idOrig, tratamento: 'inativo na Base44 → ativo (decisão do dono)', detalhe: rec.nome });
    }
    if (tabela === 'operators' && rec.sala == null && !erros.some((e) => e[1] === 'sala')) {
      if (['Bio', 'Industrial', 'Ambas'].includes(DECISOES.operador_sem_sala)) {
        rec.sala = DECISOES.operador_sem_sala;
        avisos.push({ tabela, id_original: idOrig, tratamento: `sala vazia → ${rec.sala}`, detalhe: rec.nome });
      }
    }
    if (tabela === 'checkout_itens' && rec.status && rec.status !== 'Pendente' && !rec.operador
        && DECISOES.checkout_concluido_sem_operador === 'importar_como_pendente') {
      avisos.push({ tabela, id_original: idOrig, tratamento: `status ${rec.status} sem operador → Pendente`, detalhe: rec.numero_pedido });
      rec.status = 'Pendente';
    }
    for (const [cNome, cId] of PARES_OPERADOR[tabela] || []) {
      if (!cols[cId] || rec[cId] != null) continue; // o export já trouxe o id
      const nome = rec[cNome];
      if (!nome) { rec[cId] = null; continue; }
      let id = resolverOperador(nome);
      if (!id && DECISOES.operadores_historicos.map(normalizarNome).includes(normalizarNome(nome))) id = criarOperadorHistorico(nome, rec.created_at);
      if (id && DECISOES.aliases_operador[nome]) avisos.push({ tabela, id_original: idOrig, tratamento: `operador "${nome}" → "${DECISOES.aliases_operador[nome]}"`, detalhe: cNome });
      rec[cId] = id;
      if (!id) {
        if (!cols[cId].nulo) erros.push(['operador sem cadastro (nome não encontrado)', cId, nome]);
        else avisos.push({ tabela, id_original: idOrig, tratamento: 'operador sem cadastro: id fica vazio, nome mantido', detalhe: `${cNome}=${nome}` });
      }
    }
    if (tabela === 'checklist_recebimentos' && rec.sap_pedido_id && !chaves['sap_pedidos.id']?.has(rec.sap_pedido_id)
        && DECISOES.checklist_sap_inexistente === 'anular_referencia') {
      avisos.push({ tabela, id_original: idOrig, tratamento: 'pedido SAP fora do export: referência anulada (número do pedido mantido)', detalhe: linha.sap_pedido_id });
      rec.sap_pedido_id = null;
    }
    for (const cProd of { envase_records: ['codigo_produto'], empilha_linhas: ['codigo_produto'], recebimento_itens: ['produto_codigo'] }[tabela] || []) {
      const v = rec[cProd];
      if (!v || chaves['products.codigo']?.has(v)) continue;
      const alvo = DECISOES.aliases_codigo_produto[v];
      if (alvo && chaves['products.codigo']?.has(alvo)) {
        avisos.push({ tabela, id_original: idOrig, tratamento: 'código de produto trocado pelo indicado pelo dono', detalhe: `${v} → ${alvo}` });
        rec[cProd] = alvo; continue;
      }
      if (!DECISOES.normalizar_codigo_produto) continue;
      const n = v.trim().toUpperCase();
      if (n !== v && chaves['products.codigo']?.has(n)) {
        avisos.push({ tabela, id_original: idOrig, tratamento: 'código de produto normalizado (espaços/maiúsculas)', detalhe: `${JSON.stringify(v)} → ${n}` });
        rec[cProd] = n;
      }
    }
    if (tabela === 'checklist_recebimentos') rec.criado_por_id = null; // criado_por_nome é a CONTA, não operador
    if (tabela === 'nota_fiscal_arquivos' && rec.data_arquivo == null && rec.created_at) {
      rec.data_arquivo = diaEmBrasilia(rec.created_at); // retenção legal conta da data ORIGINAL, não da importação
    }
    if (tabela === 'envase_records' && rec.codigo_produto && !chaves['products.codigo']?.has(rec.codigo_produto)
        && DECISOES.produto_inexistente === 'criar_produto_do_registro' && rec.descricao_produto && rec.consistencia) {
      const novo = { id: uuidDerivado(`produto:${rec.codigo_produto}`), codigo: rec.codigo_produto, nome: rec.descricao_produto, consistencia: rec.consistencia,
        unidade_medida: null, categoria: null, nsf_3h: false, nsf_h1: false, halal: false, kosher: false, created_at: rec.created_at, updated_at: rec.created_at };
      aceitos.products.push(novo); registrarChaves('products', novo); criados.products = (criados.products || 0) + 1;
      avisos.push({ tabela: 'products', id_original: '', tratamento: 'produto criado a partir do envase (não estava no cadastro)', detalhe: `${novo.codigo} ${novo.nome}` });
    }

    // Obrigatórios.
    for (const [c, col] of Object.entries(cols)) {
      if (col.gerada || col.nulo || c === 'id' || PROTOCOLOS[tabela]?.coluna === c) continue;
      const presente = Object.prototype.hasOwnProperty.call(rec, c);
      if ((presente && rec[c] == null) || (!presente && !col.temPadrao)) {
        if (!erros.some((e) => e[1] === c)) erros.push(['campo obrigatório vazio', c, '']);
      }
    }
    if (erros.length) { for (const [regra, campo, valor] of erros) pararLinha(tabela, ent, idOrig, regra, campo, valor); continue; }
    origemPorId.set(rec.id, linha);
    candidatos.push(rec);
  }

  // Únicos: fica o registro mais recente (updated_at); os outros vão para a quarentena.
  let restantes = candidatos;
  for (const { c } of UNICOS.filter((u) => u.t === tabela && u.c !== PROTOCOLOS[tabela]?.coluna)) {
    const grupos = new Map();
    for (const r of restantes) if (r[c] != null) { const k = String(r[c]); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(r); }
    const fora = new Set();
    for (const [k, g] of grupos) {
      if (g.length < 2) continue;
      g.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)) || String(b.created_at).localeCompare(String(a.created_at)));
      const campos = Object.keys(g[0]).filter((x) => !['id', 'created_at', 'updated_at'].includes(x));
      for (const r of g.slice(1)) {
        const igual = campos.every((x) => JSON.stringify(r[x]) === JSON.stringify(g[0][x]));
        fora.add(r);
        pararLinha(tabela, ent, origemPorId.get(r.id)?.id, `duplicata de ${c}${igual ? ' (cópia idêntica)' : ' (com diferenças)'}: mantido o registro mais recente ${origemPorId.get(g[0].id)?.id}`, c, k);
      }
    }
    restantes = restantes.filter((r) => !fora.has(r));
  }

  // Chaves estrangeiras contra o que já foi ACEITO nas tabelas-pai.
  const fksTabela = FKS.filter((f) => f.t === tabela && TABELAS.includes(f.rt));
  restantes = restantes.filter((r) => {
    for (const f of fksTabela) {
      if (r[f.c] == null) continue;
      if (!chaves[`${f.rt}.${f.rc}`]?.has(String(r[f.c]))) {
        const regra = f.rt === 'sap_pedidos' && tabela === 'checklist_recebimentos' ? 'pedido SAP inexistente no export'
          : f.rt === 'products' ? 'produto inexistente no cadastro' : `referência a ${f.rt} inexistente (ou em quarentena)`;
        pararLinha(tabela, ent, origemPorId.get(r.id)?.id, regra, f.c, origemPorId.get(r.id)?.[f.c] ?? r[f.c]);
        return false;
      }
    }
    return true;
  });

  // CHECKs do banco, avaliados PELO PRÓPRIO BANCO (mesma expressão), sem gravar.
  const checks = CHECKS.filter((k) => k.t === tabela);
  if (checks.length && restantes.length) {
    const ruins = new Map();
    // Lotes por TAMANHO (~900 KB), e o lote vai UMA vez (CTE), não uma vez por regra:
    // a API de gerenciamento recusa corpo acima de ~2,5–4 MB (413, medido em 22/10/2026).
    const lotes = [];
    let atual = []; let tam = 0;
    for (const r of restantes) {
      atual.push(r); tam += JSON.stringify(r).length;
      if (tam > 900_000) { lotes.push(atual); atual = []; tam = 0; }
    }
    if (atual.length) lotes.push(atual);
    for (const loteRegs of lotes) {
      const lote = literalJson(loteRegs);
      const consulta = `with dados as (select * from json_populate_recordset(null::public.${ident(tabela)}, ${lote}))\n`
        + checks.map((k) => `select ${tabela}.id::text id, '${k.n}' regra from dados as ${tabela} where not (${k.d.replace(/^CHECK\s*/, '').replace(/\s+NOT VALID$/, '')})`).join('\nunion all\n');
      for (const r of banco.sql(consulta)) { if (!ruins.has(r.id)) ruins.set(r.id, []); ruins.get(r.id).push(r.regra); }
    }
    const def = Object.fromEntries(checks.map((k) => [k.n, k.d]));
    restantes = restantes.filter((r) => {
      if (!ruins.has(r.id)) return true;
      for (const n of ruins.get(r.id)) pararLinha(tabela, ent, origemPorId.get(r.id)?.id, `regra do banco ${n}: ${def[n]}`, '', '');
      return false;
    });
  }

  aceitos[tabela] = [...(aceitos[tabela] || []), ...restantes];
  for (const r of restantes) registrarChaves(tabela, r);
  if (tabela === 'operators') for (const r of aceitos.operators) operadorPorNome.set(normalizarNome(r.nome), r.id);
  if (tabela === 'operators') {
    const vistos = new Map();
    for (const r of aceitos.operators) { const k = normalizarNome(r.nome); vistos.set(k, (vistos.get(k) || 0) + 1); }
    for (const [k, n] of vistos) if (n > 1) throw new Error(`nome de operador ambíguo no cadastro: "${k}" aparece ${n} vezes — resolução por nome impossível`);
  }
}

// ── 4. Anexos (fotos e NF): baixa e valida ANTES de numerar os protocolos ──────────────────────────────────────────────────
const relAnexos = [];
let envio = null;
const anexosPendentes = [
  ...(aceitos.operators || []).filter((r) => r.foto_url && !r.foto_url.startsWith(`${PREFIXO}/`)).map((r) => ({ r, campo: 'foto_url', bucket: 'fotos-operadores', tabela: 'operators' })),
  ...(aceitos.nota_fiscal_arquivos || []).filter((r) => r.arquivo_url).map((r) => ({ r, campo: 'arquivo_url', bucket: 'notas-fiscais', tabela: 'nota_fiscal_arquivos' })),
];
if (!SEM_ANEXOS && !SO_VALIDAR && anexosPendentes.length) {
  const url = PRODUCAO ? (process.env.IMPORT_PROD_URL || `https://${REF_PRODUCAO}.supabase.co`) : process.env.VITE_SUPABASE_URL;
  const anonKey = PRODUCAO ? process.env.IMPORT_PROD_ANON_KEY : process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.IMPORT_ADMIN_EMAIL || (PRODUCAO ? null : process.env.TEST_ADMIN_EMAIL);
  const senha = process.env.IMPORT_ADMIN_SENHA || (PRODUCAO ? null : process.env.TEST_ADMIN_PASSWORD);
  if (!url || !anonKey || !email || !senha) throw new Error('anexos: faltam IMPORT_PROD_ANON_KEY / IMPORT_ADMIN_EMAIL / IMPORT_ADMIN_SENHA');
  envio = await criarEnvio({ url, anonKey, email, senha });
}
for (const a of anexosPendentes) {
  const origem = a.r[a.campo];
  const idOrig = origemPorId.get(a.r.id)?.id;
  if (SEM_ANEXOS || SO_VALIDAR) { relAnexos.push({ tabela: a.tabela, id_original: idOrig, origem, resultado: SO_VALIDAR ? 'não verificado (só validação)' : 'ignorado (--sem-anexos)' }); continue; }
  const b = await obterBytes(origem, arg('anexos'));
  const v = b.erro ? b : validar(b.bytes, a.bucket);
  if (v.erro) {
    relAnexos.push({ tabela: a.tabela, id_original: idOrig, origem, resultado: `PROBLEMA: ${v.erro}` });
    if (a.tabela === 'operators' && DECISOES.foto_inacessivel === 'anular') a.r.foto_url = null;
    // NF sem o documento engana quem consulta: a linha vai para a quarentena.
    if (a.tabela === 'nota_fiscal_arquivos') { pararLinha(a.tabela, 'NotaFiscalArquivo', idOrig, `anexo: ${v.erro}`, 'arquivo_url', origem); a.r._fora = true; }
    continue;
  }
  const caminho = `${PREFIXO}/${a.r.id}.${v.tipo.ext}`;
  a.bytes = b.bytes; a.caminho = caminho; a.mime = v.tipo.mime;
  if (a.tabela === 'nota_fiscal_arquivos' && !a.r.arquivo_nome) a.r.arquivo_nome = path.basename(String(origem).split('?')[0]).slice(0, 200);
  relAnexos.push({ tabela: a.tabela, id_original: idOrig, origem, resultado: `ok ${v.tipo.mime} ${(b.bytes.length / 1024).toFixed(0)} KB → ${a.bucket}/${caminho}` });
}

if (aceitos.nota_fiscal_arquivos) aceitos.nota_fiscal_arquivos = aceitos.nota_fiscal_arquivos.filter((r) => !r._fora);

// ── 5. Protocolos (ordem cronológica de criação, ano de criação em Brasília) ─
const maxProtocolo = {};
for (const [tabela, p] of Object.entries(PROTOCOLOS)) {
  const regs = [...(aceitos[tabela] || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
  let n = 0;
  for (const r of regs) {
    if (r[p.coluna]) { n = Math.max(n, Number(String(r[p.coluna]).split('-').pop()) || 0); continue; } // veio no export: preserva
    n += 1;
    r[p.coluna] = `${p.prefixo}-${diaEmBrasilia(r.created_at).slice(0, 4)}-${String(n).padStart(6, '0')}`;
  }
  maxProtocolo[tabela] = n;
}

// ── 6. Gravação ─────────────────────────────────────────────────────────────
const tempos = {};
if (!SO_VALIDAR) {
  // Storage: o que não for da importação ficaria órfão quando a tabela for limpa.
  const fora = banco.sql(`select bucket_id, name from storage.objects where bucket_id in ('fotos-operadores','notas-fiscais') and name not like '${PREFIXO}/%'`);
  if (fora.length && !tem('aceitar-orfaos')) {
    throw new Error(`há ${fora.length} arquivo(s) no Storage que NÃO vieram da importação (ex.: ${fora[0].bucket_id}/${fora[0].name}). A limpeza das tabelas os deixaria órfãos. Revise e rode com --aceitar-orfaos se for intencional.`);
  }
  let t = Date.now();
  // Um bloco DO = um comando = uma transação (a CLI não aceita vários comandos por chamada).
  banco.sql(`do $limpa$ begin
truncate table ${TABELAS.map((x) => `public.${ident(x)}`).join(', ')} restart identity;
${Object.values(PROTOCOLOS).map((p) => `perform setval('public.${p.sequence}', 1, false);`).join('\n')}
end $limpa$;`);
  if (envio) for (const bucket of Object.keys(BUCKETS)) { const velhos = await envio.listar(bucket, PREFIXO); if (velhos.length) await envio.apagar(bucket, velhos); }
  tempos.limpeza_s = (Date.now() - t) / 1000;

  t = Date.now();
  for (const a of anexosPendentes.filter((x) => x.caminho)) {
    await envio.enviar(a.bucket, a.caminho, a.bytes, a.mime);
    a.r[a.campo] = a.caminho; // o banco guarda o CAMINHO
  }
  tempos.anexos_s = (Date.now() - t) / 1000;

  t = Date.now();
  for (const tabela of TABELAS) {
    const regs = aceitos[tabela] || [];
    if (!regs.length) continue;
    const colunas = Object.keys(COLS[tabela]).filter((c) => !COLS[tabela][c].gerada && regs.some((r) => Object.prototype.hasOwnProperty.call(r, c)));
    for (const r of regs) for (const c of colunas) {
      if (Object.prototype.hasOwnProperty.call(r, c)) continue;
      if (COLS[tabela][c].nulo) r[c] = null; // coluna opcional que só parte dos registros trouxe
      else throw new Error(`${tabela}: registro sem a coluna obrigatória ${c}`);
    }
    const lista = colunas.map(ident).join(', ');
    let lote = [];
    let tamanho = 0;
    const gravar = () => {
      if (!lote.length) return;
      // service_role só nesta transação: é a exceção prevista em protect_status_completo
      // para registros históricos já assinados ("Completo").
      const dados = literalJson(lote);
      if (dados.includes('$grava$')) throw new Error('etiqueta $grava$ presente nos dados');
      banco.sql(`do $grava$ begin
perform set_config('request.jwt.claim.role', 'service_role', true);
insert into public.${ident(tabela)} (${lista}) select ${lista} from json_populate_recordset(null::public.${ident(tabela)}, ${dados});
end $grava$;`);
      lote = []; tamanho = 0;
    };
    for (const r of regs) {
      const o = Object.fromEntries(colunas.map((c) => [c, r[c]]));
      lote.push(o); tamanho += JSON.stringify(o).length;
      if (tamanho > 900_000) gravar();
    }
    gravar();
  }
  tempos.insercao_s = (Date.now() - t) / 1000;

  // Sequences: o próximo protocolo novo é o maior importado + 1.
  for (const [tabela, p] of Object.entries(PROTOCOLOS)) {
    banco.sql(maxProtocolo[tabela] > 0 ? `select setval('public.${p.sequence}', ${maxProtocolo[tabela]}, true)` : `select setval('public.${p.sequence}', 1, false)`);
  }
  if (envio) await envio.sair();
}

// ── 7. Verificação ──────────────────────────────────────────────────────────
const verif = { contagens: [], somas: [], amostra: [], orfas: [], duplicatas: [], checklist: [], sequences: [] };
const qIds = new Map();
for (const q of quarentena) { const k = `${q.tabela}`; if (!qIds.has(k)) qIds.set(k, new Set()); qIds.get(k).add(q.id_original); }
const noBanco = SO_VALIDAR ? {} : Object.fromEntries(banco.sql(TABELAS.map((t) => `select '${t}' t, count(*)::int n from public.${ident(t)}`).join(' union all ')).map((r) => [r.t, r.n]));
for (const [ent, tabela] of ENTIDADES) {
  const exp = exportado[ent].linhas.length;
  const q = qIds.get(tabela)?.size || 0;
  const esperado = (aceitos[tabela] || []).length;
  verif.contagens.push({ entidade: ent, tabela, exportado: exp, quarentena: q, criados_pela_importacao: criados[tabela] || 0, esperado, no_banco: SO_VALIDAR ? null : noBanco[tabela], confere: SO_VALIDAR ? null : esperado === noBanco[tabela] && exp - q + (criados[tabela] || 0) === esperado });
}

if (!SO_VALIDAR) {
  // Somas de controle: o que deveria entrar × o que está no banco.
  const soma = (regs, f) => regs.reduce((s, r) => s + (Number(r[f]) || 0), 0);
  const porMes = (regs, f) => { const m = {}; for (const r of regs) if (r[f]) { const k = String(r[f]).slice(0, 7); m[k] = (m[k] || 0) + 1; } return m; };
  const [envBanco] = banco.sql(`select coalesce(sum(quantidade_produzida),0)::float q, coalesce(sum(quantidade_embalagens),0)::float e from public.envase_records`);
  verif.somas.push({ controle: 'envase: soma da quantidade produzida', esperado: Math.round(soma(aceitos.envase_records, 'quantidade_produzida') * 1000) / 1000, banco: Math.round(envBanco.q * 1000) / 1000 });
  verif.somas.push({ controle: 'envase: soma da quantidade de embalagens', esperado: soma(aceitos.envase_records, 'quantidade_embalagens'), banco: envBanco.e });
  for (const [tabela, campo, rotulo] of [['envase_records', 'data', 'envases por mês'], ['checkout_itens', 'data_entrega', 'itens de check-out por mês de entrega'], ['checkout_programacoes', 'data_programada', 'programações de check-out por mês']]) {
    const esp = porMes(aceitos[tabela], campo);
    const ban = Object.fromEntries(banco.sql(`select to_char(${campo}, 'YYYY-MM') k, count(*)::int n from public.${tabela} where ${campo} is not null group by 1`).map((r) => [r.k, r.n]));
    const meses = [...new Set([...Object.keys(esp), ...Object.keys(ban)])].sort();
    const dif = meses.filter((m) => (esp[m] || 0) !== (ban[m] || 0));
    verif.somas.push({ controle: `${rotulo} (${meses.length} meses)`, esperado: Object.values(esp).reduce((a, b) => a + b, 0), banco: Object.values(ban).reduce((a, b) => a + b, 0), meses_divergentes: dif.map((m) => `${m}: ${esp[m] || 0}×${ban[m] || 0}`) });
  }

  // Amostra aleatória comparada campo a campo.
  const igual = (a, b, col) => {
    if (a == null || b == null) return a == null && b == null;
    if (col.tipo === 'timestamp with time zone') return new Date(a).getTime() === new Date(b).getTime();
    if (['numeric', 'integer', 'smallint', 'bigint', 'double precision', 'real'].includes(col.tipo)) return Number(a) === Number(b);
    if (col.tipo === 'time without time zone') return String(a).slice(0, 8) === String(b).slice(0, 8);
    // jsonb guarda as chaves em outra ordem: compara a forma canônica (chaves ordenadas).
    const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([p], [q]) => p.localeCompare(q))) : v));
    if (typeof a === 'object' || typeof b === 'object') return canon(a) === canon(b);
    return String(a) === String(b);
  };
  for (const tabela of TABELAS) {
    const regs = aceitos[tabela] || [];
    if (!regs.length) continue;
    const amostra = [...regs].sort(() => Math.random() - 0.5).slice(0, N_AMOSTRA);
    const doBanco = new Map(banco.sql(`select row_to_json(x) j from public.${ident(tabela)} x where id in (${amostra.map((r) => `'${r.id}'`).join(',')})`).map((r) => [r.j.id, r.j]));
    let campos = 0; const dif = [];
    const recalculados = tabela === 'checklist_recebimentos' ? ['total_sim', 'total_nao', 'soma_sim', 'soma_nao', 'nota_final'] : [];
    for (const r of amostra) {
      const b = doBanco.get(r.id);
      if (!b) { dif.push(`${r.id}: não está no banco`); continue; }
      for (const [c, v] of Object.entries(r)) {
        if (recalculados.includes(c) || COLS[tabela][c]?.gerada) continue;
        campos += 1;
        if (!igual(v, b[c], COLS[tabela][c])) dif.push(`${origemPorId.get(r.id)?.id ?? r.id}.${c}: esperado ${JSON.stringify(v)} × banco ${JSON.stringify(b[c])}`);
      }
    }
    verif.amostra.push({ tabela, registros: amostra.length, campos_comparados: campos, divergencias: dif });
  }

  // FKs órfãs (todas as FKs do esquema entre as tabelas importadas).
  for (const f of FKS) {
    const [r] = banco.sql(`select count(*)::int n from public.${ident(f.t)} c where c.${ident(f.c)} is not null and not exists (select 1 from public.${ident(f.rt)} p where p.${ident(f.rc)} = c.${ident(f.c)})`);
    verif.orfas.push({ fk: `${f.t}.${f.c} → ${f.rt}.${f.rc}`, orfas: r.n });
  }
  // Duplicatas: ids, protocolos e únicos.
  for (const tabela of TABELAS) {
    const cols = ['id', PROTOCOLOS[tabela]?.coluna, ...UNICOS.filter((u) => u.t === tabela).map((u) => u.c)].filter(Boolean);
    for (const c of [...new Set(cols)]) {
      const [r] = banco.sql(`select (count(${ident(c)}) - count(distinct ${ident(c)}))::int n from public.${ident(tabela)}`);
      verif.duplicatas.push({ coluna: `${tabela}.${c}`, duplicatas: r.n });
    }
  }
  // Checklist: nota recalculada pelo gatilho × nota original da Base44.
  for (const r of banco.sql(`select id::text, numero_checklist, total_sim, total_nao, nota_final from public.checklist_recebimentos order by numero_checklist`)) {
    const o = origemPorId.get(r.id);
    if (o && (Number(o.nota_final) !== r.nota_final || Number(o.total_sim) !== r.total_sim || Number(o.total_nao) !== r.total_nao)) {
      verif.checklist.push({ id_original: o.id, protocolo: r.numero_checklist, base44: `nota ${o.nota_final} (${o.total_sim} sim, ${o.total_nao} não)`, recalculado: `nota ${r.nota_final} (${r.total_sim} sim, ${r.total_nao} não)` });
    }
  }
  // Sequences: o próximo número gerado pelo banco é max+1 e não colide.
  for (const [tabela, p] of Object.entries(PROTOCOLOS)) {
    let r;
    if (PRODUCAO) {
      // Em produção, só leitura: o próximo valor sai do estado da sequence, sem consumir número.
      const [e] = banco.sql(`select last_value::bigint v, is_called c from public.${p.sequence}`);
      const prox = e.c ? Number(e.v) + 1 : Number(e.v);
      r = { proximo: `${p.prefixo}-AAAA-${String(prox).padStart(6, '0')} (calculado)` };
    } else {
      [r] = banco.sql(`select public.gerar_protocolo('${p.prefixo}', 'public.${p.sequence}') proximo`);
    }
    const num = Number(r.proximo.split(' ')[0].split('-').pop());
    const [col] = banco.sql(`select count(*)::int n from public.${ident(tabela)} where ${ident(p.coluna)} like '%-${String(num).padStart(6, '0')}'`);
    // devolve a sequence ao ponto certo (no local, o teste consumiu um número)
    if (!PRODUCAO) banco.sql(maxProtocolo[tabela] > 0 ? `select setval('public.${p.sequence}', ${maxProtocolo[tabela]}, true)` : `select setval('public.${p.sequence}', 1, false)`);
    verif.sequences.push({ tabela, maior_importado: maxProtocolo[tabela], proximo_gerado: r.proximo, esperado_numero: maxProtocolo[tabela] + 1, colide: col.n > 0, ok: num === maxProtocolo[tabela] + 1 && col.n === 0 });
  }
}

// ── 8. Relatórios ───────────────────────────────────────────────────────────
const csvLinha = (vals) => vals.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
fs.writeFileSync(path.join(SAIDA, 'quarentena.csv'), '﻿' + [csvLinha(['tabela', 'entidade', 'id_original', 'regra', 'campo', 'valor']), ...quarentena.map((q) => csvLinha([q.tabela, q.entidade, q.id_original, q.regra, q.campo, q.valor]))].join('\r\n'));
fs.writeFileSync(path.join(SAIDA, 'tratamentos-aplicados.csv'), '﻿' + [csvLinha(['tabela', 'id_original', 'tratamento', 'detalhe']), ...avisos.map((a) => csvLinha([a.tabela, a.id_original, a.tratamento, a.detalhe]))].join('\r\n'));
fs.writeFileSync(path.join(SAIDA, 'anexos.csv'), '﻿' + [csvLinha(['tabela', 'id_original', 'origem', 'resultado']), ...relAnexos.map((a) => csvLinha([a.tabela, a.id_original, a.origem, a.resultado]))].join('\r\n'));
const resumoQuarentena = {};
for (const q of quarentena) { const k = `${q.tabela} | ${q.regra.replace(/: mantido o registro mais recente .*/, '')}`; resumoQuarentena[k] = (resumoQuarentena[k] || 0) + 1; }
const resumoAvisos = {};
for (const a of avisos) { const k = `${a.tabela} | ${a.tratamento}`; resumoAvisos[k] = (resumoAvisos[k] || 0) + 1; }
const duracao = (Date.now() - t0) / 1000;
const relatorio = { modo: MODO, so_validar: SO_VALIDAR, export: path.resolve(DIR), quando: new Date().toISOString(), duracao_s: duracao, tempos, chamadas_ao_banco: banco.chamadas,
  decisoes: DECISOES, campos_sem_destino: [...CAMPOS_SEM_DESTINO], campos_ignorados: camposIgnorados, apostrofos_do_exportador: apostrofos.encontrados,
  resumo_quarentena: resumoQuarentena, resumo_tratamentos: resumoAvisos, anexos: relAnexos, verificacao: verif };
fs.writeFileSync(path.join(SAIDA, 'relatorio.json'), JSON.stringify(relatorio, null, 1));

// Resumo em linguagem simples.
const L = [];
L.push(`IMPORTAÇÃO ${SO_VALIDAR ? '(SÓ VALIDAÇÃO — nada gravado)' : ''} — ${MODO.toUpperCase()} — ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
L.push(`Duração: ${duracao.toFixed(0)} s · chamadas ao banco: ${banco.chamadas} · repetições por falta de conexão: ${banco.repeticoes}`);
L.push('\nCONTAGENS (exportado → quarentena → criados → esperado → no banco):');
for (const c of verif.contagens) if (c.exportado || c.esperado || c.no_banco) L.push(`  ${c.confere === false ? 'DIVERGE' : c.confere ? 'ok     ' : '       '} ${c.tabela.padEnd(26)} ${String(c.exportado).padStart(6)} → ${String(c.quarentena).padStart(5)} → ${String(c.criados_pela_importacao).padStart(3)} → ${String(c.esperado).padStart(6)} → ${c.no_banco ?? '—'}`);
const vazias = verif.contagens.filter((c) => !c.exportado).map((c) => c.entidade);
if (vazias.length) L.push(`  (vazias no export: ${vazias.join(', ')})`);
L.push('\nQUARENTENA por regra:');
for (const [k, n] of Object.entries(resumoQuarentena).sort((a, b) => b[1] - a[1])) L.push(`  ${String(n).padStart(5)}  ${k}`);
if (!quarentena.length) L.push('  nenhuma linha');
L.push('\nTRATAMENTOS APLICADOS POR DECISÃO:');
for (const [k, n] of Object.entries(resumoAvisos).sort((a, b) => b[1] - a[1])) L.push(`  ${String(n).padStart(5)}  ${k}`);
if (!avisos.length) L.push('  nenhum');
L.push(`\nApóstrofos do exportador ('-0:-30): ${apostrofos.encontrados} (${DECISOES.apostrofo_exportador})`);
L.push(`ANEXOS: ${relAnexos.length} — ${relAnexos.filter((a) => a.resultado.startsWith('ok')).length} ok, ${relAnexos.filter((a) => a.resultado.startsWith('PROBLEMA')).length} com problema`);
for (const a of relAnexos.filter((x) => !x.resultado.startsWith('ok'))) L.push(`  ${a.tabela} ${a.id_original}: ${a.resultado}`);
if (!SO_VALIDAR) {
  L.push('\nSOMAS DE CONTROLE:');
  for (const s of verif.somas) L.push(`  ${s.esperado === s.banco && !s.meses_divergentes?.length ? 'ok     ' : 'DIVERGE'} ${s.controle}: esperado ${s.esperado} × banco ${s.banco}${s.meses_divergentes?.length ? ` — ${s.meses_divergentes.join('; ')}` : ''}`);
  L.push(`\nAMOSTRA campo a campo (${N_AMOSTRA} por tabela):`);
  for (const a of verif.amostra) L.push(`  ${a.divergencias.length ? 'DIVERGE' : 'ok     '} ${a.tabela.padEnd(26)} ${a.registros} registros, ${a.campos_comparados} campos${a.divergencias.length ? ` — ${a.divergencias.slice(0, 3).join(' | ')}` : ''}`);
  const orf = verif.orfas.filter((o) => o.orfas);
  L.push(`\nFKs ÓRFÃS: ${orf.length ? orf.map((o) => `${o.fk}=${o.orfas}`).join(', ') : `0 em ${verif.orfas.length} chaves estrangeiras`}`);
  const dup = verif.duplicatas.filter((d) => d.duplicatas);
  L.push(`DUPLICATAS: ${dup.length ? dup.map((d) => `${d.coluna}=${d.duplicatas}`).join(', ') : `0 em ${verif.duplicatas.length} colunas (ids, protocolos, únicos)`}`);
  L.push(`\nCHECKLIST — nota recalculada pelo banco × nota da Base44: ${verif.checklist.length} divergência(s)`);
  for (const c of verif.checklist.slice(0, 20)) L.push(`  ${c.protocolo} (${c.id_original}): Base44 ${c.base44} → banco ${c.recalculado}`);
  L.push('\nSEQUENCES DE PROTOCOLO (próximo registro novo):');
  for (const s of verif.sequences) L.push(`  ${s.ok ? 'ok     ' : 'ERRO   '} ${s.tabela.padEnd(26)} maior importado ${s.maior_importado} → próximo ${s.proximo_gerado}${s.colide ? ' COLIDE' : ''}`);
}
fs.writeFileSync(path.join(SAIDA, 'resumo.txt'), L.join('\n'));
log(L.join('\n'));
log(`\nArquivos: ${SAIDA}`);
const falhou = !SO_VALIDAR && (verif.contagens.some((c) => c.confere === false) || verif.somas.some((s) => s.esperado !== s.banco || s.meses_divergentes?.length)
  || verif.amostra.some((a) => a.divergencias.length) || verif.orfas.some((o) => o.orfas) || verif.duplicatas.some((d) => d.duplicatas) || verif.sequences.some((s) => !s.ok));
log(falhou ? '\nVERIFICAÇÃO: FALHOU (ver acima)' : SO_VALIDAR ? '\nVALIDAÇÃO CONCLUÍDA (nada gravado)' : '\nVERIFICAÇÃO: TUDO CONFERE');
process.exit(falhou ? 1 : 0);
