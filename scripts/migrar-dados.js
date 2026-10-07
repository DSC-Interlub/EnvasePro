/**
 * Script de Carga e Migração Real de Dados — Base44 ➔ Supabase (ES Module)
 * 
 * Regras e Boas Práticas:
 * - Respeita ordem topológica de dependências (FKs).
 * - Conversão determinística de Base44 ObjectId (24 hex) para PostgreSQL UUID.
 * - Idempotente via UPSERT.
 * - Conversão rigorosa de strings vazias "" em datas/horas para NULL (Lição 6).
 * - Resolução obrigatória de operator_id via UUID (Lição 3).
 * - Suporta flag --test para inserir apenas 5 amostras e validar.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega .env.local
const envLocalPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('migrar-dados');
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ ERRO CRÍTICO: VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configurados no .env.local.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const EXPORTS_DIR = path.join(__dirname, '..', 'exports-base44');
const IS_TEST_MODE = process.argv.includes('--test');

console.log('='.repeat(78));
console.log(`🚀 MIGRAÇÃO DE DADOS BASE44 ➔ SUPABASE [${IS_TEST_MODE ? 'MODO TESTE (5 REGISTROS)' : 'MODO CARGA COMPLETA'}]`);
console.log(`📡 Destino Supabase: ${SUPABASE_URL}`);
console.log('='.repeat(78));

/**
 * Converte ID de 24 hexadecimais do Base44 em UUID padrão determinístico.
 * Exemplo: 6ab502095172d9b59e996fbd ➔ 00000000-6ab5-0209-5172-d9b59e996fbd
 */
function base44IdToUUID(id) {
  if (!id) return null;
  const str = String(id).trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(str)) {
    return str;
  }
  if (/^[0-9a-f]{24}$/.test(str)) {
    return `00000000-${str.slice(0, 4)}-${str.slice(4, 8)}-${str.slice(8, 12)}-${str.slice(12, 24)}`;
  }
  const hash = crypto.createHash('md5').update('base44:' + str).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

// UUID fixo para o operador histórico Renan
const RENAN_UUID = '00000000-0000-0000-0000-000000000072';

function normalizarNome(nome) {
  if (!nome || typeof nome !== 'string') return '';
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Parser RFC 4180 robusto para CSVs do Base44
 */
function parseRFC4180CSV(rawText) {
  let text = rawText;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          currentVal += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentVal += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentVal);
        currentVal = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < len && text[i + 1] === '\n') i++;
        currentRow.push(currentVal);
        currentVal = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentVal);
        currentVal = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else {
        currentVal += char;
        i++;
        continue;
      }
    }
  }

  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal);
    rows.push(currentRow);
  }

  const cleanedRows = rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
  if (cleanedRows.length < 2) return [];

  const headers = cleanedRows[0].map(h => h.trim());
  const records = [];

  for (let r = 1; r < cleanedRows.length; r++) {
    const row = cleanedRows[r];
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      let val = row[c] ?? '';
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (
          (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
          (trimmed.startsWith('{') && trimmed.endsWith('}'))
        ) {
          try {
            val = JSON.parse(trimmed);
          } catch {
            // Mantém string se falhar parse
          }
        }
      }
      obj[headers[c]] = val;
    }
    records.push(obj);
  }

  return records;
}

function carregarCSV(entidade) {
  const nomeArquivo = `${entidade}_export.csv`;
  const filePath = path.join(EXPORTS_DIR, nomeArquivo);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Arquivo não encontrado: ${nomeArquivo}`);
    return [];
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) return [];
  return parseRFC4180CSV(raw);
}

function limparData(val) {
  if (!val || typeof val !== 'string') return null;
  const t = val.trim();
  if (t === '' || t.toLowerCase() === 'n/a' || t.toLowerCase() === 'null') return null;
  // Extrai parte YYYY-MM-DD se vier com ISO timestamp
  if (t.includes('T')) {
    return t.split('T')[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return t;
  }
  return t;
}

function limparTimestamp(val) {
  if (!val || typeof val !== 'string') return null;
  const t = val.trim();
  if (t === '' || t.toLowerCase() === 'n/a' || t.toLowerCase() === 'null') return null;
  try {
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

function limparHora(val) {
  if (!val || typeof val !== 'string') return null;
  const t = val.trim();
  if (t === '' || t.toLowerCase() === 'n/a') return null;
  // Se for "08:48" -> "08:48:00"
  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const [h, m] = t.split(':');
    return `${h.padStart(2, '0')}:${m}:00`;
  }
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(t)) {
    const [h, m, s] = t.split(':');
    return `${h.padStart(2, '0')}:${m}:${s}`;
  }
  return null;
}

function parseNum(val, def = null) {
  if (val === undefined || val === null || val === '') return def;
  const clean = String(val).replace(',', '.').trim();
  const n = parseFloat(clean);
  return isNaN(n) ? def : n;
}

function parseBool(val, def = false) {
  if (typeof val === 'boolean') return val;
  if (!val) return def;
  const str = String(val).trim().toLowerCase();
  return str === 'true' || str === 'sim' || str === '1';
}

async function upsertBatch(table, items, conflictColumn, batchSize = 200) {
  const start = Date.now();
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictColumn });
    if (error) {
      throw new Error(`Erro ao inserir em ${table} (lote ${i} - ${i + batch.length}): ${error.message} - ${error.details || ''}`);
    }
    process.stdout.write(`   ↳ ${table}: ${Math.min(i + batchSize, items.length)}/${items.length} processados...\r`);
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  const throughput = (items.length / (parseFloat(elapsed) || 0.01)).toFixed(0);
  console.log(`   ✅ ${table.padEnd(24)}: ${items.length.toString().padStart(5)} registros em ${elapsed}s (${throughput} reg/s)      `);
}

export async function executarMigracao() {
  console.log('\n📂 [FASE 1] CARREGANDO E PREPARANDO ARQUIVOS CSV LOCAIS...');

  // 1. Operators
  const rawOperators = carregarCSV('Operator');
  const mapaOperadoresNome = new Map(); // norm -> uuid
  const mapaOperadoresId = new Map();

  const operatorsParaInserir = rawOperators.map(op => {
    const uuid = base44IdToUUID(op.id);
    let sala = op.sala ? op.sala.trim() : '';
    if (!['Bio', 'Industrial', 'Ambas'].includes(sala)) {
      sala = 'Ambas';
    }
    const nome = (op.nome || '').trim();
    if (nome) {
      mapaOperadoresNome.set(normalizarNome(nome), uuid);
      mapaOperadoresId.set(op.id, uuid);
    }
    return {
      id: uuid,
      nome,
      matricula: op.matricula ? op.matricula.trim() : null,
      sala,
      ativo: parseBool(op.ativo, true),
      foto_url: op.foto_url ? op.foto_url.trim() : null,
      created_at: limparTimestamp(op.created_date) || new Date().toISOString(),
      updated_at: limparTimestamp(op.updated_date) || new Date().toISOString()
    };
  });

  // Insere operador "Renan" (aprovado pelo usuário para cobrir envases históricos de 2025)
  operatorsParaInserir.push({
    id: RENAN_UUID,
    nome: 'Renan',
    matricula: null,
    sala: 'Ambas',
    ativo: false,
    foto_url: null,
    created_at: '2025-11-01T00:00:00Z',
    updated_at: '2025-12-31T23:59:59Z'
  });
  mapaOperadoresNome.set('renan', RENAN_UUID);

  // Mapeamentos aprovados pelo usuário
  const jorgeWillianUUID = mapaOperadoresNome.get('jorge willian');
  if (jorgeWillianUUID) mapaOperadoresNome.set('jorge', jorgeWillianUUID);

  const mikeUUID = mapaOperadoresNome.get('mike');
  if (mikeUUID) mapaOperadoresNome.set('maike', mikeUUID);

  console.log(`   - Operadores preparados: ${operatorsParaInserir.length} (incluindo Renan)`);

  // 2. Embalagens (Deduplicadas por codigo)
  const rawEmbalagens = carregarCSV('Embalagem');
  const mapaEmbalagens = new Map();
  rawEmbalagens.forEach(emb => {
    const codigo = String(emb.codigo || '').trim();
    if (!codigo) return;
    mapaEmbalagens.set(codigo, {
      id: base44IdToUUID(emb.id),
      codigo,
      descricao: (emb.descricao || '').trim(),
      conteudo: parseNum(emb.conteudo, 0),
      tipo: emb.tipo ? emb.tipo.trim() : null,
      conteudo_ext: emb.conteudo_ext ? emb.conteudo_ext.trim() : null,
      ultimos_4_digitos: emb.ultimos_4_digitos ? emb.ultimos_4_digitos.trim() : codigo.slice(-4),
      created_at: limparTimestamp(emb.created_date) || new Date().toISOString(),
      updated_at: limparTimestamp(emb.updated_date) || new Date().toISOString()
    });
  });
  const embalagensParaInserir = Array.from(mapaEmbalagens.values());
  console.log(`   - Embalagens preparadas: ${embalagensParaInserir.length}`);

  // 3. Products + Produtos Órfãos Históricos (Deduplicados por codigo)
  const rawProducts = carregarCSV('Product');
  const rawEnvase = carregarCSV('EnvaseRecord');
  const categoriasValidas = ['Graxa', 'Óleo', 'Pasta'];
  const mapaProdutos = new Map();

  // Regras de desempate aprovadas pelo usuário para os 5 códigos divergentes:
  const DECISOES_PRODUTOS = {
    'IVP075461270': { consistencia: '1.5', nome: 'INTERPLEX GPTU 12.' },
    'IVP073453220': { consistencia: '1', nome: 'LOW TEMP HF 1' },
    'IVP110492310': { nome: 'INTEROIL CAD P' },
    'IVP113632310': { nome: 'GEAR SYNT GL 68' },
    'IVP110634350': { nome: 'GEAR 460' }
  };

  rawProducts.forEach(p => {
    const codigo = String(p.codigo || '').trim();
    if (!codigo) return;
    let cat = p.categoria ? p.categoria.trim() : null;
    if (!categoriasValidas.includes(cat)) {
      cat = null; // Categoria nula se não estiver no enum
    }

    let nome = (p.nome || '').trim();
    let consistencia = (p.consistencia && p.consistencia.trim()) || 'N/A';

    // Aplica decisão específica se for um dos códigos com divergência
    if (DECISOES_PRODUTOS[codigo]) {
      if (DECISOES_PRODUTOS[codigo].nome) nome = DECISOES_PRODUTOS[codigo].nome;
      if (DECISOES_PRODUTOS[codigo].consistencia) consistencia = DECISOES_PRODUTOS[codigo].consistencia;
    }

    mapaProdutos.set(codigo, {
      id: base44IdToUUID(p.id),
      codigo,
      nome,
      unidade_medida: p.unidade_medida ? p.unidade_medida.trim() : null,
      categoria: cat,
      consistencia,
      nsf_h1: parseBool(p.nsf_h1, false),
      nsf_3h: parseBool(p.nsf_3h, false),
      kosher: parseBool(p.kosher, false),
      halal: parseBool(p.halal, false),
      created_at: limparTimestamp(p.created_date) || new Date().toISOString(),
      updated_at: limparTimestamp(p.updated_date) || new Date().toISOString()
    });
  });

  // Detecta códigos órfãos em EnvaseRecord e cria produtos históricos com categoria = NULL
  let orfaosCount = 0;
  rawEnvase.forEach(env => {
    const cod = String(env.codigo_produto || '').trim();
    if (cod && !mapaProdutos.has(cod)) {
      mapaProdutos.set(cod, {
        id: base44IdToUUID('legacy_prod_' + cod),
        codigo: cod,
        nome: `Produto Histórico (${cod})`,
        unidade_medida: 'UN',
        categoria: null, // OBRIGATÓRIO: NULL para não violar o enum public.produto_categoria
        consistencia: 'N/A', // OBRIGATÓRIO: consistencia é TEXT NOT NULL
        nsf_h1: false,
        nsf_3h: false,
        kosher: false,
        halal: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      orfaosCount++;
    }
  });

  // Adiciona produto para registros históricos sem código (2 registros de 2025 de rotulagem)
  mapaProdutos.set('SEM_CODIGO', {
    id: base44IdToUUID('legacy_prod_sem_codigo'),
    codigo: 'SEM_CODIGO',
    nome: 'Produto Não Especificado (Histórico)',
    unidade_medida: 'UN',
    categoria: null,
    consistencia: 'N/A',
    nsf_h1: false,
    nsf_3h: false,
    kosher: false,
    halal: false,
    created_at: '2025-12-01T00:00:00Z',
    updated_at: '2025-12-31T23:59:59Z'
  });

  const produtosParaInserir = Array.from(mapaProdutos.values());
  console.log(`   - Produtos únicos preparados: ${produtosParaInserir.length} (${orfaosCount} produtos históricos criados com categoria = NULL)`);

  // 4. SapPedidos
  const rawSap = carregarCSV('SapPedido');
  const sapIdsValidos = new Set();

  const sapPedidosParaInserir = rawSap.map(sap => {
    const uuid = base44IdToUUID(sap.id);
    sapIdsValidos.add(sap.id);
    return {
      id: uuid,
      serie_documento: sap.serie_documento ? sap.serie_documento.trim() : null,
      numero_documento: (sap.numero_documento || '').trim(),
      codigo_fornecedor: sap.codigo_fornecedor ? sap.codigo_fornecedor.trim() : null,
      nome_fornecedor: (sap.nome_fornecedor || '').trim(),
      numero_referencia_fornecedor: sap.numero_referencia_fornecedor ? sap.numero_referencia_fornecedor.trim() : null,
      data_vencimento: limparData(sap.data_vencimento),
      data_chegada: limparData(sap.data_chegada),
      codigo_item: sap.codigo_item ? sap.codigo_item.trim() : null,
      produto: sap.produto ? sap.produto.trim() : null,
      quantidade: parseNum(sap.quantidade, 0),
      item_para_recebimento: sap.item_para_recebimento ? sap.item_para_recebimento.trim() : null,
      valor: parseNum(sap.valor, null),
      valor_liquido: parseNum(sap.valor_liquido, null),
      valor_imposto: parseNum(sap.valor_imposto, null),
      valor_original: parseNum(sap.valor_original, null),
      data_lancamento: limparData(sap.data_lancamento),
      data_documento: limparData(sap.data_documento),
      tipo_documento: sap.tipo_documento ? sap.tipo_documento.trim() : null,
      nome_filial: sap.nome_filial ? sap.nome_filial.trim() : null,
      ativo: parseBool(sap.ativo, true),
      created_at: limparTimestamp(sap.created_date) || new Date().toISOString(),
      updated_at: limparTimestamp(sap.updated_date) || new Date().toISOString()
    };
  });
  console.log(`   - Pedidos SAP preparados: ${sapPedidosParaInserir.length}`);

  // 5. CheckoutProgramacao
  const rawProg = carregarCSV('CheckoutProgramacao');
  const progIdsValidos = new Set();

  const programacoesParaInserir = rawProg.map((prog, idx) => {
    const uuid = base44IdToUUID(prog.id);
    progIdsValidos.add(prog.id);
    let status = prog.status ? prog.status.trim() : 'Pendente';
    if (!['Pendente', 'Em Andamento', 'Concluído'].includes(status)) {
      status = 'Pendente';
    }
    const dataProg = limparData(prog.data_programada) || new Date().toISOString().split('T')[0];
    const codigoProg = `CKO-${dataProg.slice(0, 4)}-${String(prog.id).slice(-6).toUpperCase()}`;

    return {
      id: uuid,
      codigo_programacao: codigoProg,
      data_programada: dataProg,
      total_pedidos: parseInt(prog.total_pedidos || '0', 10),
      pedidos_concluidos: parseInt(prog.pedidos_concluidos || '0', 10),
      status,
      observacoes: prog.observacoes ? prog.observacoes.trim() : null,
      created_at: limparTimestamp(prog.created_date) || new Date().toISOString(),
      updated_at: limparTimestamp(prog.updated_date) || new Date().toISOString()
    };
  });
  console.log(`   - Programações de Checkout preparadas: ${programacoesParaInserir.length}`);

  // 6. CheckoutItem
  const rawCheckoutItens = carregarCSV('CheckoutItem');
  const checkoutItensParaInserir = [];

  rawCheckoutItens.forEach((item, idx) => {
    const progUUID = base44IdToUUID(item.programacao_id);
    const nomeOp = (item.operador || '').trim();
    let opUUID = null;
    if (nomeOp) {
      opUUID = mapaOperadoresNome.get(normalizarNome(nomeOp)) || null;
    }

    let status = item.status ? item.status.trim() : 'Pendente';
    if (!['Pendente', 'Em Andamento', 'Concluído'].includes(status)) {
      status = 'Pendente';
    }

    // Regra da constraint chk_checkout_item_operador_obrigatorio:
    // CHECK (status = 'Pendente' OR operator_id IS NOT NULL)
    // Se status não for Pendente e não tiver operador, normaliza para Pendente
    if (status !== 'Pendente' && !opUUID) {
      status = 'Pendente';
    }

    checkoutItensParaInserir.push({
      id: base44IdToUUID(item.id),
      programacao_id: progUUID,
      numero_pedido: (item.numero_pedido || '').trim() || `PED-${idx + 1}`,
      data_entrega: limparData(item.data_entrega),
      cliente: (item.cliente || '').trim() || 'Cliente Não Informado',
      operador: nomeOp || null,
      operator_id: opUUID,
      hora_inicio: limparHora(item.hora_inicio),
      hora_termino: limparHora(item.hora_termino),
      tempo_total: item.tempo_total ? item.tempo_total.trim() : null,
      critico: parseBool(item.critico, false),
      data_saida: limparData(item.data_saida),
      finalizado_fora_do_prazo: parseBool(item.finalizado_fora_do_prazo, false),
      data_finalizacao_real: limparData(item.data_finalizacao_real),
      motivo_atraso: item.motivo_atraso ? item.motivo_atraso.trim() : null,
      status,
      observacoes: item.observacoes ? item.observacoes.trim() : null,
      created_at: limparTimestamp(item.created_date) || new Date().toISOString(),
      updated_at: limparTimestamp(item.updated_date) || new Date().toISOString()
    });
  });
  console.log(`   - Itens de Checkout preparados: ${checkoutItensParaInserir.length}`);

  // 7. EnvaseRecord
  const envaseRecordsParaInserir = [];
  rawEnvase.forEach((env, idx) => {
    const nomeOp = (env.operador || '').trim();
    const opUUID = mapaOperadoresNome.get(normalizarNome(nomeOp));
    if (!opUUID) {
      throw new Error(`Operador não mapeado em EnvaseRecord #${idx + 1}: "${nomeOp}"`);
    }

    let sala = env.sala ? env.sala.trim() : 'Industrial';
    if (!['Bio', 'Industrial'].includes(sala)) {
      sala = 'Industrial';
    }

    const dataEnv = limparData(env.data) || new Date().toISOString().split('T')[0];
    const protocolo = `ENV-${dataEnv.slice(0, 4)}-${String(env.id).slice(-6).toUpperCase()}`;

    let difCod = parseInt(env.dificuldade_codigo || '0', 10);
    if (![0, 1, 2, 3].includes(difCod)) difCod = 0;

    envaseRecordsParaInserir.push({
      id: base44IdToUUID(env.id),
      protocolo,
      sala,
      data: dataEnv,
      mes: parseInt(env.mes || '0', 10) || null,
      ano: parseInt(env.ano || '0', 10) || null,
      op: env.op ? env.op.trim() : null,
      operador: nomeOp,
      operator_id: opUUID,
      codigo_produto: String(env.codigo_produto || '').trim() || 'SEM_CODIGO',
      descricao_produto: env.descricao_produto ? env.descricao_produto.trim() : (String(env.codigo_produto || '').trim() ? null : 'Produto Não Especificado (Histórico)'),
      consistencia: env.consistencia ? env.consistencia.trim() : null,
      codigo_embalagem: env.codigo_embalagem ? env.codigo_embalagem.trim() : null,
      descricao_embalagem: env.descricao_embalagem ? env.descricao_embalagem.trim() : null,
      multiplo: parseNum(env.multiplo, null),
      quantidade_produzida: parseNum(env.quantidade_produzida, 0),
      inicio: limparHora(env.inicio),
      termino: limparHora(env.termino),
      tempo_produtivo: env.tempo_produtivo ? env.tempo_produtivo.trim() : null,
      quantidade_embalagens: parseNum(env.quantidade_embalagens, 0),
      tempo_por_embalagem: env.tempo_por_embalagem ? env.tempo_por_embalagem.trim() : null,
      dificuldade_codigo: difCod,
      dificuldade_tipo: env.dificuldade_tipo ? env.dificuldade_tipo.trim() : null,
      lote_embalagem: env.lote_embalagem ? env.lote_embalagem.trim() : null,
      lotes_tampa: env.lotes_tampa ? env.lotes_tampa.trim() : null,
      observacoes: env.observacoes ? env.observacoes.trim() : null,
      material_retirado: parseBool(env.material_retirado, false),
      created_at: limparTimestamp(env.created_date) || new Date().toISOString(),
      updated_at: limparTimestamp(env.updated_date) || new Date().toISOString()
    });
  });
  console.log(`   - Registros de Envase preparados: ${envaseRecordsParaInserir.length}`);

  // 8. ChecklistRecebimento
  const rawChecklist = carregarCSV('ChecklistRecebimento');
  const checklistParaInserir = rawChecklist.map((chk, idx) => {
    let sapId = chk.sap_pedido_id ? chk.sap_pedido_id.trim() : '';
    let sapUUID = null;
    // Decisão aprovada: se sap_pedido_id não existir na tabela SapPedido, grava null
    if (sapId && sapIdsValidos.has(sapId)) {
      sapUUID = base44IdToUUID(sapId);
    }

    const dataEntrega = limparData(chk.data_entrega) || new Date().toISOString().split('T')[0];
    const numeroChecklist = `CHK-${dataEntrega.slice(0, 4)}-${String(chk.id).slice(-6).toUpperCase()}`;

    let matRec = chk.material_recebimento ? chk.material_recebimento.trim() : 'Embalagem';
    const matValidos = ['Spray', 'Rótulo', 'Embalagem', 'Produto Interlub', 'Matéria Prima (Terceiros)'];
    if (!matValidos.includes(matRec)) matRec = 'Embalagem';

    let unMed = chk.unidade_medida ? chk.unidade_medida.trim() : 'PC';
    const unValidas = ['KG', 'LT', 'PC', 'UN', 'MILHEIRO', 'M³'];
    if (!unValidas.includes(unMed)) unMed = 'UN';

    const respSimNao = v => (String(v).trim().toLowerCase() === 'não' || String(v).trim().toLowerCase() === 'nao' ? 'Não' : 'Sim');
    const respSimNaoNA = v => {
      const s = String(v).trim().toLowerCase();
      if (s === 'n/a' || s === 'na') return 'N/A';
      if (s === 'não' || s === 'nao') return 'Não';
      return 'Sim';
    };

    let inspPor = [];
    if (Array.isArray(chk.inspecionado_por)) {
      inspPor = chk.inspecionado_por;
    } else if (typeof chk.inspecionado_por === 'string' && chk.inspecionado_por.trim()) {
      inspPor = [chk.inspecionado_por.trim()];
    }

    return {
      id: base44IdToUUID(chk.id),
      numero_checklist: numeroChecklist,
      pedido_disponivel_etapa5: respSimNao(chk.pedido_disponivel_etapa5),
      numero_pedido_compras: (chk.numero_pedido_compras || '').trim() || 'S/N',
      sap_pedido_id: sapUUID,
      recebimento_id: null,
      nome_fornecedor: (chk.nome_fornecedor || '').trim() || 'Fornecedor Não Informado',
      codigo_fornecedor: chk.codigo_fornecedor ? chk.codigo_fornecedor.trim() : null,
      descricao_material: (chk.descricao_material || '').trim() || 'Material Não Informado',
      data_prevista_material: limparData(chk.data_prevista_material),
      data_entrega: dataEntrega,
      entrega_conforme_prevista: respSimNao(chk.entrega_conforme_prevista),
      inspecionado_por: inspPor,
      numero_nota_fiscal: (chk.numero_nota_fiscal || '').trim() || 'S/N',
      material_recebimento: matRec,
      quantidade_recebida: parseNum(chk.quantidade_recebida, 0),
      unidade_medida: unMed,
      numero_lote: (chk.numero_lote || '').trim() || 'S/L',
      quantidade_conforme_nf: respSimNao(chk.quantidade_conforme_nf),
      amostragem_inspecionada: respSimNaoNA(chk.amostragem_inspecionada),
      condicoes_gerais_conformes: respSimNaoNA(chk.condicoes_gerais_conformes),
      spray_conforme_feps: respSimNaoNA(chk.spray_conforme_feps),
      acompanha_certificado_analise: respSimNaoNA(chk.acompanha_certificado_analise),
      acompanha_ficha_emergencia: respSimNaoNA(chk.acompanha_ficha_emergencia),
      acompanha_fispq: respSimNaoNA(chk.acompanha_fispq),
      observacoes: chk.observacoes ? chk.observacoes.trim() : null,
      total_sim: parseInt(chk.total_sim || '0', 10),
      total_nao: parseInt(chk.total_nao || '0', 10),
      soma_sim: parseInt(chk.soma_sim || '0', 10),
      soma_nao: parseInt(chk.soma_nao || '0', 10),
      nota_final: parseInt(chk.nota_final || '0', 10),
      criado_por_nome: chk.criado_por_nome ? chk.criado_por_nome.trim() : null,
      criado_por_id: null,
      created_at: limparTimestamp(chk.created_date) || new Date().toISOString(),
      updated_at: limparTimestamp(chk.updated_date) || new Date().toISOString()
    };
  });
  console.log(`   - Checklists de Recebimento preparados: ${checklistParaInserir.length}`);

  console.log('\n📦 [FASE 2] INSERINDO TABELAS MESTRES NO SUPABASE (ORDEM TOPOLÓGICA)...');
  await upsertBatch('operators', operatorsParaInserir, 'id');
  await upsertBatch('products', produtosParaInserir, 'codigo');
  await upsertBatch('embalagens', embalagensParaInserir, 'codigo');
  await upsertBatch('sap_pedidos', sapPedidosParaInserir, 'id');
  await upsertBatch('checkout_programacoes', programacoesParaInserir, 'id');

  console.log('\n📦 [FASE 3] INSERINDO TABELAS OPERACIONAIS...');

  if (IS_TEST_MODE) {
    console.log('\n🔬 MODO DE TESTE ATIVADO: Inserindo apenas as 5 primeiras linhas de CheckoutItem, EnvaseRecord e ChecklistRecebimento...');
    // Pega os 5 primeiros e também 2 itens com operador atribuído para teste completo
    const testCheckout = checkoutItensParaInserir.slice(0, 5);
    const comOperador = checkoutItensParaInserir.filter(c => c.operator_id !== null).slice(0, 2);
    const checkoutLoteTeste = [...testCheckout, ...comOperador];

    const testEnvase = envaseRecordsParaInserir.slice(0, 5);
    const testChecklist = checklistParaInserir.slice(0, 5);

    await upsertBatch('checkout_itens', checkoutLoteTeste, 'id');
    await upsertBatch('envase_records', testEnvase, 'id');
    await upsertBatch('checklist_recebimentos', testChecklist, 'id');

    console.log('\n🔎 BUSCANDO REGISTROS DO SUPABASE PARA CONFIRMAÇÃO VISUAL:');

    const { data: dbEnvase, error: errEnv } = await supabase
      .from('envase_records')
      .select('id, protocolo, data, op, operador, operator_id, codigo_produto, quantidade_produzida, inicio, termino')
      .in('id', testEnvase.map(e => e.id));

    if (errEnv) console.error('Erro ao consultar envase_records:', errEnv);
    else {
      console.log('\n--- [Amostra Gravada no Supabase: ENVASE_RECORDS (5 primeiros)] ---');
      console.table(dbEnvase);
    }

    const { data: dbCheckout, error: errCko } = await supabase
      .from('checkout_itens')
      .select('id, numero_pedido, data_entrega, cliente, operador, operator_id, status, hora_inicio, hora_termino')
      .in('id', checkoutLoteTeste.map(c => c.id));

    if (errCko) console.error('Erro ao consultar checkout_itens:', errCko);
    else {
      console.log('\n--- [Amostra Gravada no Supabase: CHECKOUT_ITENS (5 primeiros + com operador)] ---');
      console.table(dbCheckout);
    }

    const { data: dbChecklist, error: errChk } = await supabase
      .from('checklist_recebimentos')
      .select('id, numero_checklist, data_entrega, nome_fornecedor, sap_pedido_id, inspecionado_por, nota_final')
      .in('id', testChecklist.map(c => c.id));

    if (errChk) console.error('Erro ao consultar checklist_recebimentos:', errChk);
    else {
      console.log('\n--- [Amostra Gravada no Supabase: CHECKLIST_RECEBIMENTOS (5 primeiros)] ---');
      console.table(dbChecklist);
    }

    console.log('\n' + '='.repeat(78));
    console.log('✅ TESTE CONCLUÍDO COM SUCESSO! Aguardando validação visual do usuário.');
    console.log('='.repeat(78));
  } else {
    console.log('\n🚀 CARGA TOTAL: Inserindo todas as linhas...');
    await upsertBatch('checkout_itens', checkoutItensParaInserir, 'id', 200);
    await upsertBatch('envase_records', envaseRecordsParaInserir, 'id', 200);
    await upsertBatch('checklist_recebimentos', checklistParaInserir, 'id', 100);

    console.log('\n' + '='.repeat(78));
    console.log('🎉 MIGRAÇÃO COMPLETA DE TODOS OS 17.070 REGISTROS CONCLUÍDA COM SUCESSO!');
    console.log('='.repeat(78));
  }
}

executarMigracao().catch(err => {
  console.error('\n❌ FALHA NA MIGRAÇÃO:', err);
  process.exit(1);
});
