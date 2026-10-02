import fs from 'fs';

const rawText = fs.readFileSync('exports-base44/EnvaseRecord_export.csv', 'utf8');

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

const records = parseRFC4180CSV(rawText);
console.log('Total records parsed:', records.length);
const withoutCod = records.filter(r => !r.codigo_produto || r.codigo_produto.trim() === '');
console.log('Records without codigo_produto:', withoutCod.length);
console.log('All without codigo_produto:', JSON.stringify(withoutCod, null, 2));
