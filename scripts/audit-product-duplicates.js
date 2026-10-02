import fs from 'fs';
import Papa from 'papaparse';

const csvPath = 'c:/envase/exports-base44/Product_export.csv';
if (!fs.existsSync(csvPath)) {
  console.error('Arquivo não encontrado:', csvPath);
  process.exit(1);
}

const csvContent = fs.readFileSync(csvPath, 'utf8');
const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
console.log('Total de linhas em Product_export.csv:', parsed.data.length);
if (parsed.data.length > 0) {
  console.log('Colunas:', Object.keys(parsed.data[0]));
}

// Mapear por codigo
const codeMap = new Map();
for (const row of parsed.data) {
  const code = (row.codigo || row.code || row.CODIGO || '').trim();
  if (!code) continue;
  if (!codeMap.has(code)) codeMap.set(code, []);
  codeMap.get(code).push(row);
}

console.log('Total de códigos únicos:', codeMap.size);

const duplicates = [];
for (const [code, rows] of codeMap.entries()) {
  if (rows.length > 1) {
    duplicates.push({ code, rows });
  }
}

console.log('Total de códigos com duplicatas:', duplicates.length);

// Detalhar todos os códigos duplicados e verificar divergências de campos
console.log('\n--- DETALHAMENTO DE DIVERGÊNCIAS ENTRE DUPLICATAS ---');

const fieldsToCheck = ['nome', 'descricao', 'consistencia', 'categoria', 'nsf_h1', 'nsf_3h', 'halal', 'kosher'];

let totalWithDifferences = 0;
const diffList = [];

for (const { code, rows } of duplicates) {
  const differences = [];
  const first = rows[0];
  for (let i = 1; i < rows.length; i++) {
    const current = rows[i];
    for (const f of fieldsToCheck) {
      const v1 = (first[f] ?? '').toString().trim();
      const v2 = (current[f] ?? '').toString().trim();
      if (v1 !== v2) {
        differences.push({
          field: f,
          row1_id: first.id,
          row1_val: v1,
          row2_id: current.id,
          row2_val: v2
        });
      }
    }
  }

  if (differences.length > 0) {
    totalWithDifferences++;
    diffList.push({ code, count: rows.length, differences, rows });
    console.log(`\nCódigo: ${code} (${rows.length} ocorrências) - DIVERGÊNCIAS:`);
    differences.forEach(d => {
      console.log(`  Campo '${d.field}': [${d.row1_id}]="${d.row1_val}" vs [${d.row2_id}]="${d.row2_val}"`);
    });
  }
}

console.log(`\nTotal de códigos duplicados com diferenças em campos relevantes: ${totalWithDifferences} de ${duplicates.length}`);

// Procurar especificamente os códigos citados pelo usuário
console.log('\n--- VERIFICAÇÃO ESPECÍFICA DOS CÓDIGOS CITADOS PELO USUÁRIO ---');
for (const target of ['IVP075461270', 'IVP073453220', 'GRA011700200', 'GRA013600000']) {
  const rows = codeMap.get(target);
  if (!rows) {
    console.log(`[${target}]: NÃO EXISTE no CSV Product_export.csv!`);
  } else {
    console.log(`[${target}]: ${rows.length} ocorrência(s) encontrada(s):`);
    rows.forEach((r, idx) => {
      console.log(`   #${idx + 1}: id=${r.id}, nome="${r.nome || r.descricao}", consistencia="${r.consistencia}", cat="${r.categoria}", nsf_h1=${r.nsf_h1}, nsf_3h=${r.nsf_3h}, halal=${r.halal}, kosher=${r.kosher}, updated_date=${r.updated_date}`);
    });
  }
}
