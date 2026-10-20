/**
 * scripts/test-sessao-revogada.mjs — encerramento IMEDIATO de sessão, com JWT REAL (banco LOCAL).
 *
 * O buraco que isto fecha: resetar a senha, desativar ou excluir apagava as
 * sessões, mas o JWT já emitido continuava valendo até vencer (~1 h). Agora o
 * banco (checar_sessao, pre-request do PostgREST) recusa na PRÓXIMA requisição.
 *
 * Para cada ação do admin — resetar senha, desativar, excluir, encerrar
 * sessões — com uma conta de verdade:
 *   - antes: o token lê (200) e a escrita chega ao banco (é recusada pela
 *     validação da tabela, não pela sessão);
 *   - depois: o MESMO token é recusado com 401 "sessao_revogada" na leitura E
 *     na escrita, e o refresh token não renova;
 *   - um token NOVO (reativar e entrar de novo / entrar de novo) funciona;
 * E ainda: senha temporária não lê dado (403 senha_temporaria) até a troca;
 * operador, TV, admin e anon não conseguem mexer em sessoes_validas_desde;
 * anon segue passando (sem usuário, nada a checar) e a função não diz nada
 * sobre outras contas.
 *
 * Uso: node scripts/test-sessao-revogada.mjs   (precisa do `vite` em 5173)
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-sessao-revogada');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(APP)) { console.error(`Recusado: APP_BASE_URL não é local (${APP})`); process.exit(2); }
const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const o = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, o);
const novoCliente = () => createClient(URL, ANON, o);

let falhas = 0;
const ok = (c, m, extra = '') => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}${extra ? ` -> ${extra}` : ''}`); if (!c) falhas += 1; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const MARCA = `teste-sr-${Date.now()}`;
const criados = [];

async function entrar(email, senha) {
  const c = novoCliente();
  const { data, error } = await c.auth.signInWithPassword({ email, password: senha });
  return { c, sessao: data?.session ?? null, erro: error };
}
async function rest(token, caminho, init = {}) {
  const r = await fetch(`${URL}/rest/v1/${caminho}`, {
    ...init, headers: { apikey: ANON, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const corpo = await r.text();
  return { status: r.status, corpo };
}
const ler = (t) => rest(t, 'operators?select=id&limit=1');
// Escrita que o operador PODE tentar (RLS de INSERT aberto a authenticated) e
// que o banco recusa pela validação (campos obrigatórios) — o que importa é
// QUEM recusa: com sessão válida, a tabela (400); revogada, a sessão (401).
const escrever = (t) => rest(t, 'empilha_ocorrencias', { method: 'POST', body: '{}' });
async function api(token, acao, dados = {}) {
  const r = await fetch(`${APP}/api/admin-usuarios`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...dados, acao }),
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
}
async function contaNova(nome) {
  const email = `${MARCA}-${nome}@exemplo.local`;
  const senha = `Conta#${nome}-${Date.now()}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: senha, email_confirm: true, app_metadata: { trocar_senha: false } });
  if (error) throw new Error(`criar ${nome}: ${error.message}`);
  criados.push(data.user.id);
  return { id: data.user.id, email, senha };
}

console.log('='.repeat(78));
console.log(`SESSÃO REVOGADA NA HORA — JWT real | ${URL}`);
console.log('='.repeat(78));

try {
  // Admin descartável (o limite de 30 ações/10 min contaria execuções anteriores).
  const ator = await contaNova('ator');
  await svc.from('user_profiles').update({ role: 'admin' }).eq('id', ator.id);
  const A = (await entrar(ator.email, ator.senha)).sessao.access_token;

  for (const acao of ['resetar_senha', 'desativar', 'excluir', 'encerrar_sessoes']) {
    console.log(`\n${acao}`);
    const conta = await contaNova(acao);
    const s = await entrar(conta.email, conta.senha);
    const T = s.sessao.access_token;
    ok((await ler(T)).status === 200, 'antes: o token lê');
    const e0 = await escrever(T);
    ok(e0.status !== 401 && !e0.corpo.includes('sessao_revogada'), 'antes: a escrita chega à tabela (recusada só pela validação)', String(e0.status));

    const dados = acao === 'excluir' ? { id: conta.id, confirmacao: conta.email } : { id: conta.id };
    const r = await api(A, acao, dados);
    ok(r.status === 200, `admin: ${acao} 200`, String(r.status));

    const l1 = await ler(T);
    ok(l1.status === 401 && l1.corpo.includes('sessao_revogada'), 'depois: o MESMO token é recusado na leitura (sessao_revogada)', `${l1.status} ${l1.corpo.slice(0, 60)}`);
    const e1 = await escrever(T);
    ok(e1.status === 401 && e1.corpo.includes('sessao_revogada'), 'depois: e na escrita', String(e1.status));
    const rpc1 = await rest(T, 'rpc/checar_sessao', { method: 'POST', body: '{}' });
    ok(rpc1.status === 401, 'o bate-ponto (rpc/checar_sessao) também recusa', String(rpc1.status));
    const ren = await s.c.auth.refreshSession({ refresh_token: s.sessao.refresh_token });
    ok(Boolean(ren.error), 'o refresh token antigo não renova', ren.error?.message);

    await esperar(1200); // a revogação vale até o início do segundo seguinte
    if (acao === 'desativar') {
      ok((await api(A, 'reativar', { id: conta.id })).status === 200, 'reativar: 200');
      const n = await entrar(conta.email, conta.senha);
      ok(n.sessao && (await ler(n.sessao.access_token)).status === 200, 'depois de reativar, um token NOVO funciona');
    } else if (acao === 'encerrar_sessoes') {
      const n = await entrar(conta.email, conta.senha);
      ok(n.sessao && (await ler(n.sessao.access_token)).status === 200, 'entrando de novo (mesma senha), o token NOVO funciona');
    } else if (acao === 'resetar_senha') {
      ok(!(await entrar(conta.email, conta.senha)).sessao, 'a senha antiga não entra');
      const n = await entrar(conta.email, r.corpo.senha_temporaria);
      const l = await ler(n.sessao.access_token);
      ok(l.status === 403 && l.corpo.includes('senha_temporaria'), 'com a senha TEMPORÁRIA, não lê dado nenhum (403 senha_temporaria)', `${l.status}`);
      const w = await escrever(n.sessao.access_token);
      ok(w.status === 403, 'nem escreve', String(w.status));
      const NOVA = `Escolhida#${Date.now()}`;
      const t = await api(n.sessao.access_token, 'trocar_minha_senha', { senha_atual: r.corpo.senha_temporaria, senha_nova: NOVA });
      ok(t.status === 200 && (await ler(t.corpo.sessao?.access_token)).status === 200, 'depois de trocar a senha, a sessão nova lê');
    } else if (acao === 'excluir') {
      ok(!(await entrar(conta.email, conta.senha)).sessao, 'conta excluída não entra');
    }
  }

  console.log('\nsessoes_validas_desde só muda pelo servidor');
  const alvo = await contaNova('alvo');
  const sAlvo = await entrar(alvo.email, alvo.senha);
  const antes = (await svc.from('user_profiles').select('sessoes_validas_desde').eq('id', alvo.id).single()).data.sessoes_validas_desde;
  const corpo = JSON.stringify({ sessoes_validas_desde: '2000-01-01T00:00:00Z' });
  const proprio = await rest(sAlvo.sessao.access_token, `user_profiles?id=eq.${alvo.id}`, { method: 'PATCH', body: corpo, headers: { Prefer: 'return=representation' } });
  ok(proprio.status >= 400 || proprio.corpo === '[]', 'o próprio usuário (operador) não muda', `${proprio.status} ${proprio.corpo.slice(0, 60)}`);
  for (const [nome, email, senha] of [['operador', process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD], ['TV', process.env.TEST_TV_EMAIL, process.env.TEST_TV_PASSWORD]]) {
    const s = await entrar(email, senha);
    const r = await rest(s.sessao.access_token, `user_profiles?id=eq.${alvo.id}`, { method: 'PATCH', body: corpo, headers: { Prefer: 'return=representation' } });
    ok(r.status >= 400 || r.corpo === '[]', `${nome} não muda o de outra conta`, `${r.status} ${r.corpo.slice(0, 60)}`);
  }
  const adm = await rest(A, `user_profiles?id=eq.${alvo.id}`, { method: 'PATCH', body: corpo, headers: { Prefer: 'return=representation' } });
  ok(adm.status >= 400 && /servidor/.test(adm.corpo), 'nem o admin muda direto pelo navegador (só o servidor)', `${adm.status} ${adm.corpo.slice(0, 80)}`);
  const anon = await rest(null, `user_profiles?id=eq.${alvo.id}`, { method: 'PATCH', body: corpo });
  ok(anon.status >= 400, 'anon não muda', String(anon.status));
  const depois = (await svc.from('user_profiles').select('sessoes_validas_desde').eq('id', alvo.id).single()).data.sessoes_validas_desde;
  ok(depois === antes, 'o valor continua o mesmo', `${antes} -> ${depois}`);
  ok((await ler(sAlvo.sessao.access_token)).status === 200, 'e a sessão da conta segue válida (nada foi revogado por tabela)');

  console.log('\nanon e vazamento');
  const anonRpc = await rest(null, 'rpc/checar_sessao', { method: 'POST', body: '{}' });
  ok(anonRpc.status === 204 && anonRpc.corpo === '', 'anon: checar_sessao passa e não devolve nada', String(anonRpc.status));
  const comArg = await rest(sAlvo.sessao.access_token, 'rpc/checar_sessao', { method: 'POST', body: JSON.stringify({ p_usuario: ator.id }) });
  ok(comArg.status >= 400 && !comArg.corpo.includes(ator.id), 'não aceita perguntar sobre OUTRA conta (a função não tem parâmetro)', String(comArg.status));
  const valido = await rest(sAlvo.sessao.access_token, 'rpc/checar_sessao', { method: 'POST', body: '{}' });
  ok(valido.status === 204 && valido.corpo === '', 'conta válida: 204, sem corpo', String(valido.status));
} catch (e) {
  ok(false, `a suíte parou: ${String(e.message || e).slice(0, 200)}`);
} finally {
  for (const id of criados) await svc.auth.admin.deleteUser(id).catch(() => {});
}

console.log('\n' + (falhas ? `${falhas} FALHA(S)` : 'TUDO OK'));
process.exitCode = falhas ? 1 : 0;
