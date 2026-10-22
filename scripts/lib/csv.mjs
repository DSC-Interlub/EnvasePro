// Leitor de CSV (RFC 4180) para os exports da Base44.
//
// Os exports trazem quebra de linha DENTRO de campos entre aspas (observações),
// então contar linhas do arquivo erra a contagem de registros. Este leitor
// trata aspas, aspas duplicadas ("") e CR/LF dentro do campo, e remove o BOM.
// Arquivo vazio (0 bytes) devolve { cabecalho: [], linhas: [] }.
import fs from 'node:fs';

export function lerCsv(caminho) {
  let texto = fs.readFileSync(caminho, 'utf8');
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  const registros = [];
  let campo = '';
  let registro = [];
  let entreAspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (entreAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i += 1; } else entreAspas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') entreAspas = true;
    else if (c === ',') { registro.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i += 1;
      registro.push(campo); campo = '';
      if (!(registro.length === 1 && registro[0] === '')) registros.push(registro);
      registro = [];
    } else campo += c;
  }
  if (entreAspas) throw new Error(`${caminho}: aspas não fechadas no fim do arquivo`);
  if (campo !== '' || registro.length) { registro.push(campo); registros.push(registro); }
  if (!registros.length) return { cabecalho: [], linhas: [] };
  const [cabecalho, ...resto] = registros;
  const linhas = resto.map((r, n) => {
    if (r.length !== cabecalho.length) {
      throw new Error(`${caminho}: registro ${n + 2} tem ${r.length} campos, o cabeçalho tem ${cabecalho.length}`);
    }
    return Object.fromEntries(cabecalho.map((h, k) => [h, r[k]]));
  });
  return { cabecalho, linhas };
}
