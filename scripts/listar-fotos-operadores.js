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
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentVal += '"'; i += 2; continue;
        } else {
          inQuotes = false; i++; continue;
        }
      } else { currentVal += char; i++; continue; }
    } else {
      if (char === '"') { inQuotes = true; i++; continue; }
      else if (char === ',') { currentRow.push(currentVal); currentVal = ''; i++; continue; }
      else if (char === '\r') {
        if (i + 1 < text.length && text[i + 1] === '\n') i++;
        currentRow.push(currentVal); currentVal = ''; rows.push(currentRow); currentRow = []; i++; continue;
      } else if (char === '\n') {
        currentRow.push(currentVal); currentVal = ''; rows.push(currentRow); currentRow = []; i++; continue;
      } else { currentVal += char; i++; continue; }
    }
  }
  if (currentVal || currentRow.length > 0) { currentRow.push(currentVal); rows.push(currentRow); }
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, idx) => obj[h] = row[idx] ?? '');
    return obj;
  });
}

const raw = fs.readFileSync(path.join(__dirname, '..', 'exports-base44', 'Operator_export.csv'), 'utf8');
const ops = parseRFC4180CSV(raw);

console.log('='.repeat(70));
console.log('📷 AUDITORIA DE FOTOS DE OPERADORES');
console.log('='.repeat(70));
console.log('Total de operadores no CSV:', ops.length);
const comFoto = ops.filter(o => (o.foto_url || '').trim() !== '');
console.log('Operadores com foto_url preenchida:', comFoto.length);

comFoto.forEach(o => {
  console.log(` - ID: ${o.id} | Nome: ${o.nome} | Foto: ${o.foto_url}`);
});
