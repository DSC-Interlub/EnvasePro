import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      obj[headers[c]] = row[c] ?? '';
    }
    records.push(obj);
  }

  return records;
}

const csvPath = fs.existsSync(path.join(__dirname, '..', 'exports-base44', 'Product_export.csv'))
  ? path.join(__dirname, '..', 'exports-base44', 'Product_export.csv')
  : path.join(__dirname, '..', 'exports-base44', 'Product.csv');
const rawText = fs.readFileSync(csvPath, 'utf8');
const records = parseRFC4180CSV(rawText);

console.log('='.repeat(70));
console.log('📦 AUDITORIA PROFUNDA DE PRODUTOS: CSV vs SCHEMA');
console.log('='.repeat(70));
console.log(`Total de linhas no CSV: ${records.length}`);

const byCodigo = new Map();
let emptyCodigo = 0;

for (const r of records) {
  const cod = (r.codigo || '').trim();
  if (!cod) {
    emptyCodigo++;
    continue;
  }
  if (!byCodigo.has(cod)) {
    byCodigo.set(cod, []);
  }
  byCodigo.get(cod).push(r);
}

console.log(`Linhas com código vazio: ${emptyCodigo}`);
console.log(`Códigos únicos: ${byCodigo.size}`);

let duplicateCodes = 0;
let totalDuplicateRows = 0;

let diffNomeCount = 0;
let diffCategoriaCount = 0;
let diffConsistenciaCount = 0;
let diffNsfH1Count = 0;
let diffNsf3hCount = 0;
let diffHalalCount = 0;
let diffKosherCount = 0;
let exactDuplicates = 0;

const casesWithDiffs = [];

for (const [cod, list] of byCodigo.entries()) {
  if (list.length > 1) {
    duplicateCodes++;
    totalDuplicateRows += list.length;

    const first = list[0];
    let hasDiffNome = false;
    let hasDiffCat = false;
    let hasDiffConsist = false;
    let hasDiffCert = false;
    let hasAnyDiff = false;

    for (let i = 1; i < list.length; i++) {
      const cur = list[i];
      if (cur.nome?.trim() !== first.nome?.trim()) { hasDiffNome = true; diffNomeCount++; }
      if (cur.categoria?.trim() !== first.categoria?.trim()) { hasDiffCat = true; diffCategoriaCount++; }
      if (cur.consistencia?.trim() !== first.consistencia?.trim()) { hasDiffConsist = true; diffConsistenciaCount++; }
      if (cur.nsf_h1 !== first.nsf_h1) { hasDiffCert = true; diffNsfH1Count++; }
      if (cur.nsf_3h !== first.nsf_3h) { hasDiffCert = true; diffNsf3hCount++; }
      if (cur.halal !== first.halal) { hasDiffCert = true; diffHalalCount++; }
      if (cur.kosher !== first.kosher) { hasDiffCert = true; diffKosherCount++; }
      if (hasDiffNome || hasDiffCat || hasDiffConsist || hasDiffCert) hasAnyDiff = true;
    }

    if (!hasAnyDiff) {
      exactDuplicates++;
    } else {
      casesWithDiffs.push({
        codigo: cod,
        qtdRegistros: list.length,
        hasDiffNome,
        hasDiffCat,
        hasDiffConsist,
        hasDiffCert,
        registros: list.map(item => ({
          id: item.id,
          nome: item.nome,
          categoria: item.categoria,
          consistencia: item.consistencia,
          nsf_h1: item.nsf_h1,
          nsf_3h: item.nsf_3h,
          halal: item.halal,
          kosher: item.kosher,
          created_date: item.created_date,
          updated_date: item.updated_date
        }))
      });
    }
  }
}

console.log(`\nCódigos duplicados: ${duplicateCodes}`);
console.log(`Total de linhas envolvidas em duplicidade: ${totalDuplicateRows}`);
console.log(`Duplicatas 100% idênticas (mesmo nome, cat, consistência, certs): ${exactDuplicates}`);
console.log(`Códigos com alguma divergência entre as duplicatas: ${casesWithDiffs.length}`);
console.log(` - Divergência em Nome: ${diffNomeCount}`);
console.log(` - Divergência em Categoria: ${diffCategoriaCount}`);
console.log(` - Divergência em Consistência: ${diffConsistenciaCount}`);
console.log(` - Divergência em NSF H1: ${diffNsfH1Count}`);
console.log(` - Divergência em NSF 3H: ${diffNsf3hCount}`);
console.log(` - Divergência em Halal: ${diffHalalCount}`);
console.log(` - Divergência em Kosher: ${diffKosherCount}`);

// Salva relatório detalhado em JSON para inspeção completa
fs.writeFileSync(
  path.join(__dirname, '..', 'scratch', 'analise_produtos_duplicados.json'),
  JSON.stringify({
    totalLinhas: records.length,
    codigosUnicos: byCodigo.size,
    duplicateCodes,
    exactDuplicates,
    divergenciasTotal: casesWithDiffs.length,
    casos: casesWithDiffs
  }, null, 2)
);

console.log('\nRelatório completo salvo em scratch/analise_produtos_duplicados.json');

// Exibe os primeiros 5 casos divergentes
console.log('\n--- AMOSTRA DE CASOS DIVERGENTES (PRIMEIROS 5) ---');
for (let i = 0; i < Math.min(5, casesWithDiffs.length); i++) {
  const c = casesWithDiffs[i];
  console.log(`\n[Código ${c.codigo}] (${c.qtdRegistros} ocorrências):`);
  console.log(`  Divergências: Nome=${c.hasDiffNome}, Categoria=${c.hasDiffCat}, Consistência=${c.hasDiffConsist}, Certificações=${c.hasDiffCert}`);
  c.registros.forEach((r, idx) => {
    console.log(`  #${idx + 1} ID: ${r.id} | Nome: "${r.nome}" | Cat: "${r.categoria}" | Consist: "${r.consistencia}" | H1:${r.nsf_h1} 3H:${r.nsf_3h} Hal:${r.halal} Kos:${r.kosher} | Criado: ${r.created_date} | Atualizado: ${r.updated_date}`);
  });
}
