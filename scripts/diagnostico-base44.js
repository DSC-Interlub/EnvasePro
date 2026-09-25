/**
 * Script de Diagnóstico e Validação Pré-Migração (ES Module)
 * Lê os arquivos exportados do Base44 em /exports-base44
 * Suporta *.json, *.csv e *_export.csv com parser RFC 4180
 * Analisa tipos, contagens, JSON aninhado, datas vazias ("" -> null)
 * e mapeamento de nomes de operadores para operator_id.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORTS_DIR = path.join(__dirname, '..', 'exports-base44');

const ENTIDADES = [
  'Product',
  'Embalagem',
  'Operator',
  'EnvaseRecord',
  'CheckoutProgramacao',
  'CheckoutItem',
  'EmpilhadeiraConfig',
  'EmpilhaProgramacao',
  'EmpilhaLinha',
  'EmpilhaOcorrencia',
  'EmpilhadeiraParada',
  'EmpilhadeiraManutencao',
  'LimpezaLocal',
  'LimpezaProgramacao',
  'RecebimentoFornecedor',
  'Recebimento',
  'RecebimentoItem',
  'RecebimentoParticipante',
  'RecebimentoOcorrencia',
  'SapPedido',
  'ChecklistRecebimento',
  'NotaFiscalArquivo',
  'User'
];

/**
 * Parser RFC 4180 completo para CSVs com aspas duplicadas,
 * quebras de linha em células e conversão automática de JSON aninhado.
 */
function parseRFC4180CSV(rawText) {
  let text = rawText;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

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
          // Aspas duplas escapadas: "" -> "
          currentVal += '"';
          i += 2;
          continue;
        } else {
          // Fim do campo cotado
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
        if (i + 1 < len && text[i + 1] === '\n') {
          i++;
        }
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
        // Parse de JSON se for array ou objeto
        if (
          (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
          (trimmed.startsWith('{') && trimmed.endsWith('}'))
        ) {
          try {
            val = JSON.parse(trimmed);
          } catch {
            // Mantém string se não for JSON válido
          }
        }
      }
      obj[headers[c]] = val;
    }
    records.push(obj);
  }

  return records;
}

function normalizarNome(nome) {
  if (!nome || typeof nome !== 'string') return '';
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function carregarArquivo(entidade) {
  // Procura na ordem: Entidade.json, Entidade_export.csv, Entidade.csv
  const candidatos = [
    `${entidade}.json`,
    `${entidade}_export.csv`,
    `${entidade}.csv`
  ];

  for (const arquivo of candidatos) {
    const filePath = path.join(EXPORTS_DIR, arquivo);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw.trim()) {
          return { records: [], arquivo, formato: 'VAZIO' };
        }
        if (arquivo.endsWith('.json')) {
          const parsed = JSON.parse(raw);
          const records = Array.isArray(parsed) ? parsed : (parsed.data || parsed.items || [parsed]);
          return { records, arquivo, formato: 'JSON' };
        } else {
          const records = parseRFC4180CSV(raw);
          return { records, arquivo, formato: 'CSV' };
        }
      } catch (err) {
        console.error(`❌ Erro ao ler ${arquivo}:`, err.message);
        return { records: null, arquivo, formato: 'ERRO' };
      }
    }
  }

  return { records: null, arquivo: null, formato: 'NÃO ENCONTRADO' };
}

export function runDiagnostico() {
  console.log('='.repeat(78));
  console.log('🔍 RELATÓRIO DE DIAGNÓSTICO PRÉ-MIGRAÇÃO — Base44 ➔ Supabase');
  console.log(`📁 Diretório de origem: ${EXPORTS_DIR}`);
  console.log('='.repeat(78));

  const dados = {};
  const resumo = [];

  // 1. Carregamento e contagens
  for (const ent of ENTIDADES) {
    const res = carregarArquivo(ent);
    if (res.records === null) {
      resumo.push({ Entidade: ent, Status: 'AUSENTE', Arquivo: '-', Registros: 0 });
    } else if (res.formato === 'VAZIO') {
      dados[ent] = [];
      resumo.push({ Entidade: ent, Status: 'ARQUIVO VAZIO (0 bytes / sem dados)', Arquivo: res.arquivo, Registros: 0 });
    } else {
      dados[ent] = res.records;
      resumo.push({ Entidade: ent, Status: 'OK', Arquivo: res.arquivo, Registros: res.records.length });
    }
  }

  console.log('\n📊 1. INVENTÁRIO E CONTAGEM POR ENTIDADE:');
  console.table(resumo);

  const totalRegistros = Object.values(dados).reduce((acc, arr) => acc + (arr ? arr.length : 0), 0);
  console.log(`📦 Total de registros encontrados nos arquivos: ${totalRegistros.toLocaleString('pt-BR')}`);

  // 2. Operadores cadastrados
  const mapaOperadores = new Map(); // norm -> { id, nome, sala, ativo }
  const listaOperadores = dados['Operator'] || [];
  
  listaOperadores.forEach(op => {
    if (op.nome) {
      const norm = normalizarNome(op.nome);
      mapaOperadores.set(norm, {
        id: op.id,
        nome: op.nome,
        sala: op.sala,
        ativo: op.ativo === 'true' || op.ativo === true
      });
    }
  });

  console.log(`\n👷 2. BASE DE OPERADORES CADASTRADOS (Tabela Operator — ${listaOperadores.length} registros):`);
  listaOperadores.forEach((op, idx) => {
    console.log(`   [${idx + 1}] ID: ${op.id} | Nome: "${op.nome}" | Sala: "${op.sala || 'N/A'}" | Ativo: ${op.ativo}`);
  });

  // 3. Resolução de Operadores em tabelas operacionais
  console.log('\n🔎 3. RESOLUÇÃO DE NOMES DE OPERADORES ➔ OPERATOR_ID (Lição 3):');
  
  const checagens = [
    { entidade: 'EnvaseRecord', campo: 'operador', isArray: false },
    { entidade: 'CheckoutItem', campo: 'operador', isArray: false },
    { entidade: 'ChecklistRecebimento', campo: 'inspecionado_por', isArray: true },
    { entidade: 'ChecklistRecebimento', campo: 'criado_por_nome', isArray: false },
    { entidade: 'EmpilhaLinha', campo: 'operador_empilhadeira', isArray: false },
    { entidade: 'EmpilhaLinha', campo: 'operador_ajudante', isArray: false },
    { entidade: 'EmpilhaOcorrencia', campo: 'registrado_por', isArray: false },
    { entidade: 'EmpilhadeiraParada', campo: 'registrado_por', isArray: false },
    { entidade: 'Recebimento', campo: 'coordenador_nome', isArray: false },
    { entidade: 'RecebimentoParticipante', campo: 'operator_nome', isArray: false },
    { entidade: 'LimpezaProgramacao', campo: 'criado_por', isArray: false },
    { entidade: 'NotaFiscalArquivo', campo: 'arquivado_por_nome', isArray: false }
  ];

  const divergenciasGerais = new Map(); // nome -> { qtd, entidades: Set }

  checagens.forEach(({ entidade, campo, isArray }) => {
    const lista = dados[entidade];
    if (!lista || lista.length === 0) return;

    let correspondidos = 0;
    let vazios = 0;
    const naoResolvidos = new Map(); // nome -> count

    lista.forEach(reg => {
      let valores = [];
      const rawVal = reg[campo];

      if (isArray) {
        if (Array.isArray(rawVal)) {
          valores = rawVal;
        } else if (typeof rawVal === 'string' && rawVal.trim()) {
          valores = [rawVal];
        }
      } else {
        if (rawVal !== undefined && rawVal !== null) {
          valores = [rawVal];
        }
      }

      if (valores.length === 0) {
        vazios++;
        return;
      }

      valores.forEach(v => {
        const strVal = String(v).trim();
        if (!strVal || strVal.toLowerCase() === 'nenhum' || strVal === '[]') {
          vazios++;
          return;
        }

        const norm = normalizarNome(strVal);
        if (mapaOperadores.has(norm)) {
          correspondidos++;
        } else {
          naoResolvidos.set(strVal, (naoResolvidos.get(strVal) || 0) + 1);
          if (!divergenciasGerais.has(strVal)) {
            divergenciasGerais.set(strVal, { qtd: 0, entidades: new Set() });
          }
          const div = divergenciasGerais.get(strVal);
          div.qtd++;
          div.entidades.add(`${entidade}.${campo}`);
        }
      });
    });

    console.log(`\n📌 ${entidade}.${campo}:`);
    console.log(`   ✅ Correspondências encontradas: ${correspondidos}`);
    console.log(`   ⚪ Valores vazios / não informados: ${vazios}`);
    if (naoResolvidos.size > 0) {
      console.log(`   ⚠️ NOMES DIVERGENTES (${naoResolvidos.size}):`);
      naoResolvidos.forEach((qtd, nome) => {
        // Tenta achar sugestão aproximada
        let sugestao = 'Nenhuma correspondência óbvia';
        for (const [normCad, cad] of mapaOperadores.entries()) {
          if (normCad.includes(normalizarNome(nome)) || normalizarNome(nome).includes(normCad)) {
            sugestao = `Sugerido: "${cad.nome}" (${cad.id})`;
            break;
          }
        }
        console.log(`      ❌ "${nome}": ${qtd} registro(s) ➔ ${sugestao}`);
      });
    } else {
      console.log(`   ✨ Todos os nomes preenchidos resolveram perfeitamente para um Operator cadastrado!`);
    }
  });

  // Resumo de divergências de operadores
  console.log('\n📋 RESUMO CONSOLIDADO DE NOMES NÃO MAPEADOS:');
  if (divergenciasGerais.size === 0) {
    console.log('   🎉 ZERO divergências! 100% dos nomes correspondem aos operadores cadastrados.');
  } else {
    divergenciasGerais.forEach((info, nome) => {
      console.log(`   - "${nome}": ${info.qtd}x nas colunas [${Array.from(info.entidades).join(', ')}]`);
    });
  }

  // 4. Análise de Campos de Data e String Vazia ("" -> null)
  console.log('\n📅 4. ANÁLISE DE STRINGS VAZIAS EM COLUNAS DE DATA/HORA (Lição 6 — "" ➔ null):');
  let totalStringsVaziasEmData = 0;

  for (const [entidade, lista] of Object.entries(dados)) {
    if (!lista || lista.length === 0) continue;
    const primeiraLinha = lista[0];
    const camposDataHora = Object.keys(primeiraLinha).filter(k => 
      k.includes('data') || 
      k.includes('vencimento') || 
      k.includes('datetime') || 
      k.includes('inicio') || 
      k.includes('termino') ||
      k.includes('hora') ||
      k.includes('created_date') ||
      k.includes('updated_date')
    );

    camposDataHora.forEach(campo => {
      const vazios = lista.filter(r => r[campo] === '').length;
      if (vazios > 0) {
        totalStringsVaziasEmData += vazios;
        console.log(`   ⚠️ ${entidade}.${campo}: ${vazios.toLocaleString('pt-BR')} registro(s) com "" (precisam de conversão para NULL).`);
      }
    });
  }

  console.log(`\n💡 Total de campos de data/hora com "" que serão convertidos para NULL: ${totalStringsVaziasEmData.toLocaleString('pt-BR')}`);

  // 5. Verificação de parsing de JSON aninhado
  console.log('\n🧬 5. VALIDAÇÃO DE CAMPOS JSON ANINHADOS PARSEADOS:');
  const checkJSON = [
    { entidade: 'ChecklistRecebimento', campo: 'inspecionado_por' },
    { entidade: 'LimpezaProgramacao', campo: 'responsaveis' },
    { entidade: 'LimpezaProgramacao', campo: 'assinaturas_responsaveis' }
  ];

  checkJSON.forEach(({ entidade, campo }) => {
    const lista = dados[entidade];
    if (lista && lista.length > 0) {
      const registrosComValor = lista.filter(r => r[campo] !== undefined && r[campo] !== '');
      if (registrosComValor.length > 0) {
        const amostra = registrosComValor[0][campo];
        console.log(`   ✅ ${entidade}.${campo}: parseado como ${Array.isArray(amostra) ? 'ARRAY' : typeof amostra}:`, JSON.stringify(amostra));
      } else {
        console.log(`   ⚪ ${entidade}.${campo}: todos os registros estão vazios.`);
      }
    } else {
      console.log(`   ⚪ ${entidade}: tabela vazia ou sem dados exportados.`);
    }
  });

  // 6. Auditoria de Integridade Referencial (Foreign Keys)
  console.log('\n🔗 6. AUDITORIA DE INTEGRIDADE REFERENCIAL (CHAVES ESTRANGEIRAS):');
  
  // 6.1 EnvaseRecord.codigo_produto -> Product.codigo
  if (dados['EnvaseRecord'] && dados['Product']) {
    const codigosProdutos = new Set(dados['Product'].map(p => String(p.codigo).trim()));
    const produtosOrfaos = new Map();
    dados['EnvaseRecord'].forEach(r => {
      const cod = String(r.codigo_produto || '').trim();
      if (cod && !codigosProdutos.has(cod)) {
        produtosOrfaos.set(cod, (produtosOrfaos.get(cod) || 0) + 1);
      }
    });
    if (produtosOrfaos.size === 0) {
      console.log('   ✅ EnvaseRecord.codigo_produto: 100% dos códigos existem em Product!');
    } else {
      console.log(`   ⚠️ EnvaseRecord.codigo_produto: ${produtosOrfaos.size} códigos de produto NÃO existem em Product:`);
      produtosOrfaos.forEach((count, cod) => console.log(`      ❌ Código "${cod}" (${count} registros)`));
    }
  }

  // 6.2 EnvaseRecord.codigo_embalagem -> Embalagem.codigo
  if (dados['EnvaseRecord'] && dados['Embalagem']) {
    const codigosEmbalagens = new Set(dados['Embalagem'].map(e => String(e.codigo).trim()));
    const embalagensOrfas = new Map();
    dados['EnvaseRecord'].forEach(r => {
      const cod = String(r.codigo_embalagem || '').trim();
      if (cod && !codigosEmbalagens.has(cod)) {
        embalagensOrfas.set(cod, (embalagensOrfas.get(cod) || 0) + 1);
      }
    });
    if (embalagensOrfas.size === 0) {
      console.log('   ✅ EnvaseRecord.codigo_embalagem: 100% dos códigos existem em Embalagem!');
    } else {
      console.log(`   ⚠️ EnvaseRecord.codigo_embalagem: ${embalagensOrfas.size} códigos de embalagem NÃO existem em Embalagem:`);
      embalagensOrfas.forEach((count, cod) => console.log(`      ❌ Código "${cod}" (${count} registros)`));
    }
  }

  // 6.3 CheckoutItem.programacao_id -> CheckoutProgramacao.id
  if (dados['CheckoutItem'] && dados['CheckoutProgramacao']) {
    const idsProgramacao = new Set(dados['CheckoutProgramacao'].map(p => String(p.id).trim()));
    const itensOrfaos = dados['CheckoutItem'].filter(it => !idsProgramacao.has(String(it.programacao_id).trim()));
    if (itensOrfaos.length === 0) {
      console.log('   ✅ CheckoutItem.programacao_id: 100% dos itens apontam para programações válidas!');
    } else {
      console.log(`   ⚠️ CheckoutItem.programacao_id: ${itensOrfaos.length} itens com programacao_id órfão!`);
    }
  }

  // 6.4 ChecklistRecebimento.sap_pedido_id -> SapPedido.id
  if (dados['ChecklistRecebimento'] && dados['SapPedido']) {
    const idsSap = new Set(dados['SapPedido'].map(s => String(s.id).trim()));
    const checklistOrfaos = dados['ChecklistRecebimento'].filter(chk => {
      const sapId = String(chk.sap_pedido_id || '').trim();
      return sapId && !idsSap.has(sapId);
    });
    if (checklistOrfaos.length === 0) {
      console.log('   ✅ ChecklistRecebimento.sap_pedido_id: 100% dos sap_pedido_id preenchidos existem em SapPedido!');
    } else {
      console.log(`   ⚠️ ChecklistRecebimento.sap_pedido_id: ${checklistOrfaos.length} checklists com sap_pedido_id não encontrado em SapPedido.`);
    }
  }

  // 7. Amostras reais de dados das tabelas com registros
  console.log('\n🔍 7. AMOSTRA DOS PRIMEIROS REGISTROS DAS TABELAS COM DADOS:');
  for (const [entidade, lista] of Object.entries(dados)) {
    if (lista && lista.length > 0) {
      console.log(`\n--- [Amostra: ${entidade} (Total: ${lista.length.toLocaleString('pt-BR')} registros)] ---`);
      const amostra = { ...lista[0] };
      // Limita campos longos para visualização
      Object.keys(amostra).forEach(k => {
        if (typeof amostra[k] === 'string' && amostra[k].length > 60) {
          amostra[k] = amostra[k].slice(0, 57) + '...';
        }
      });
      console.log(JSON.stringify(amostra, null, 2));
    }
  }

  console.log('\n' + '='.repeat(78));
  console.log('🏁 DIAGNÓSTICO CONCLUÍDO COM SUCESSO!');
  console.log('='.repeat(78));
}

runDiagnostico();
