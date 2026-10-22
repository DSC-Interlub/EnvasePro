// Acesso ao banco para a importação: SEMPRE pela CLI do Supabase.
//
//   local    → `supabase db query`          (banco do `supabase start`)
//   produção → `supabase db query --linked` (login da CLI; NUNCA a service key)
//
// O mesmo caminho nos dois modos: o ensaio local exercita exatamente o SQL que
// vai para produção. A única diferença é o transporte (em produção a CLI fala
// com a API de gerenciamento do Supabase).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const REF_PRODUCAO = 'xifzjpbkpxislqrowswd';

export function criarBanco({ producao }) {
  if (producao) {
    const ref = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
    if (ref !== REF_PRODUCAO) throw new Error(`o projeto vinculado é ${ref}, não ${REF_PRODUCAO}`);
  }
  let chamadas = 0;
  let repeticoes = 0;
  // Repete SÓ quando a conexão nem abriu ("failed to connect"): o comando não
  // chegou ao banco, então repetir não duplica nada. Qualquer outro erro
  // (inclusive tempo esgotado DURANTE a execução) para a carga.
  const SEM_CONEXAO = /failed to connect|could not connect|connection refused|ECONNREFUSED/i;
  function sql(texto) {
    for (let tentativa = 1; ; tentativa += 1) {
      try { return sqlUmaVez(texto); } catch (e) {
        if (tentativa >= 4 || !SEM_CONEXAO.test(e.message)) throw e;
        repeticoes += 1;
        const espera = [0, 2000, 5000, 10000][tentativa];
        console.log(`  (sem conexão com o banco; nova tentativa ${tentativa + 1}/4 em ${espera / 1000} s)`);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, espera);
      }
    }
  }
  function sqlUmaVez(texto) {
    chamadas += 1;
    const tmp = path.join(os.tmpdir(), `importacao-${process.pid}-${Date.now()}-${chamadas}.sql`);
    fs.writeFileSync(tmp, texto);
    try {
      const args = ['supabase', 'db', 'query', '-o', 'json', '-f', tmp];
      if (producao) args.splice(3, 0, '--linked');
      const out = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args,
        { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024 });
      const ini = out.indexOf('{');
      return ini < 0 ? [] : (JSON.parse(out.slice(ini)).rows ?? []);
    } catch (e) {
      const msg = String(e.stderr || e.stdout || e.message).replace(/Initialising login role\.\.\.\s*/g, '').trim();
      throw new Error(msg.slice(0, 2000));
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  return { sql, get chamadas() { return chamadas; }, get repeticoes() { return repeticoes; } };
}

// Literal SQL seguro para JSON: dollar-quote com etiqueta que não aparece no texto.
export function literalJson(valor) {
  const texto = JSON.stringify(valor);
  let tag = 'imp';
  while (texto.includes(`$${tag}$`)) tag += 'x';
  return `$${tag}$${texto}$${tag}$`;
}

export const ident = (nome) => `"${String(nome).replace(/"/g, '""')}"`;
