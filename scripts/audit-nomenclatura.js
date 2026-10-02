import fs from 'fs';
import path from 'path';

function findFiles(dir, exts = ['.jsx', '.js']) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findFiles(fullPath, exts));
    } else if (exts.includes(path.extname(fullPath))) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = findFiles('src');
console.log(`Total source files: ${files.length}`);

const createdByMatches = [];
const createdDateMatches = [];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, lineNo) => {
    if (line.includes('created_by')) {
      createdByMatches.push({ file, line: lineNo + 1, text: line.trim() });
    }
    if (line.includes('created_date')) {
      createdDateMatches.push({ file, line: lineNo + 1, text: line.trim() });
    }
  });
});

console.log('\n--- OCORRÊNCIAS DE created_by ---');
console.log(`Total: ${createdByMatches.length}`);
createdByMatches.forEach(m => console.log(`${m.file}:${m.line} -> ${m.text}`));

console.log('\n--- RESUMO DE created_date ---');
console.log(`Total: ${createdDateMatches.length} ocorrências em ${new Set(createdDateMatches.map(m => m.file)).size} arquivos:`);
createdDateMatches.forEach(m => console.log(`- ${m.file}:${m.line} -> ${m.text}`));
