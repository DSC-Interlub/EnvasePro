/**
 * scripts/test-admin-usuarios.mjs — gestão de usuários com JWT REAL, no banco LOCAL.
 *
 * Chama /api/admin-usuarios pelo servidor de desenvolvimento (que roda o MESMO
 * arquivo da Vercel), com tokens de verdade emitidos pelo Auth local:
 *   - anon, operador e TV são recusados; a recusa fica na auditoria;
 *   - admin cria (senha temporária na política, e-mail confirmado, troca
 *     obrigatória), edita, reseta (senha velha morre, sessões caem), desativa
 *     (login recusado, sessões caem), reativa e exclui (com confirmação);
 *   - ninguém exclui/desativa/reseta/rebaixa a si mesmo;
 *   - o último admin não sai, nem com dois admins se excluindo AO MESMO TEMPO;
 *   - trocar a própria senha: senha atual errada, senha fraca, e o caminho certo;
 *   - auditoria: registra, não guarda senha, e é imutável (nem a service_role
 *     altera ou apaga).
 *
 * Uso: node scripts/test-admin-usuarios.mjs   (precisa do `vite` em 5173)
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-admin-usuarios');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(APP)) { console.error(`Recusado: APP_BASE_URL não é local (${APP})`); process.exit(2); }
const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const novoCliente = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

let falhas = 0;
const ok = (c, m, extra = '') => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}${extra ? ` -> ${extra}` : ''}`); if (!c) falhas += 1; };

async function entrar(email, senha) {
  const c = novoCliente();
  const { data, error } = await c.auth.signInWithPassword({ email, password: senha });
  return { c, sessao: data?.session ?? null, erro: error };
}
async function api(token, acao, dados = {}) {
  const r = await fetch(`${APP}/api/admin-usuarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ ...dados, acao }),
  });
  let corpo = {};
  try { corpo = await r.json(); } catch { /* sem corpo */ }
  return { status: r.status, corpo, cache: r.headers.get('cache-control') };
}
const MARCA = `teste-gu-${Date.now()}`;
const emailDe = (n) => `${MARCA}-${n}@exemplo.local`;
const criados = [];

console.log('='.repeat(78));
console.log(`GESTÃO DE USUÁRIOS — JWT real | ${APP}`);
console.log('='.repeat(78));

try {
  // O AUTOR das ações é um admin descartável, novo a cada execução: o limite
  // de 30 escritas por admin a cada 10 min contaria as execuções anteriores
  // se fosse sempre a mesma conta. A conta admin de teste fica de reserva.
  const testeAdmin = await entrar(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
  const SENHA_ATOR = `Ator#Teste-${Date.now()}`;
  const { data: atorCriado, error: eAtor } = await svc.auth.admin.createUser({ email: emailDe('ator'), password: SENHA_ATOR, email_confirm: true });
  if (eAtor) throw new Error(`não criei o admin descartável: ${eAtor.message}`);
  criados.push(atorCriado.user.id);
  const { error: eAtorPapel } = await svc.from('user_profiles').update({ role: 'admin' }).eq('id', atorCriado.user.id);
  if (eAtorPapel) throw new Error(`não promovi o admin descartável: ${eAtorPapel.message}`);
  const admin = await entrar(emailDe('ator'), SENHA_ATOR);
  const oper = await entrar(process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD);
  const tv = await entrar(process.env.TEST_TV_EMAIL, process.env.TEST_TV_PASSWORD);
  if (!testeAdmin.sessao || !admin.sessao || !oper.sessao || !tv.sessao) throw new Error('contas de teste locais não logaram (rode supabase db reset)');
  const A = admin.sessao.access_token;
  const meuId = admin.sessao.user.id;

  console.log('\n1. Quem não é admin não entra');
  const semToken = await api(null, 'listar');
  ok(semToken.status === 401, 'sem login: 401', String(semToken.status));
  ok(semToken.cache === 'no-store', 'resposta com Cache-Control: no-store', semToken.cache);
  ok((await api('eyJ.falso.token', 'listar')).status === 401, 'token inventado: 401');
  for (const [nome, s] of [['operador', oper.sessao], ['TV', tv.sessao]]) {
    for (const acao of ['listar', 'criar', 'excluir', 'auditoria']) {
      const r = await api(s.access_token, acao, { id: meuId, nome: 'x', email: 'x@x.com', papel: 'admin' });
      ok(r.status === 403, `${nome} pede "${acao}": 403`, String(r.status));
    }
  }
  const acaoEstranha = await api(A, 'apagar_tudo');
  ok(acaoEstranha.status === 400, 'ação fora da lista fechada: 400');
  const { count: negados } = await svc.from('auditoria_usuarios').select('id', { count: 'exact', head: true })
    .eq('acao', 'negado').eq('ator_id', oper.sessao.user.id);
  ok(negados >= 4, 'as recusas do operador ficaram na auditoria', `${negados}`);

  console.log('\n2. Admin cria');
  const c1 = await api(A, 'criar', { nome: 'Fulano Teste', email: emailDe('op'), papel: 'operator', uso_tv: true });
  ok(c1.status === 200 && c1.corpo.senha_temporaria, 'cria operador e devolve a senha temporária', String(c1.status));
  const senha1 = c1.corpo.senha_temporaria || '';
  criados.push(c1.corpo.usuario?.id);
  ok(senha1.length === 20 && /[a-z]/.test(senha1) && /[A-Z]/.test(senha1) && /\d/.test(senha1) && /[^A-Za-z0-9]/.test(senha1),
    'senha temporária: 20 caracteres, minúscula, maiúscula, número e símbolo');
  const { data: u1 } = await svc.auth.admin.getUserById(c1.corpo.usuario.id);
  ok(Boolean(u1.user.email_confirmed_at), 'e-mail já confirmado');
  ok(u1.user.app_metadata?.trocar_senha === true, 'nasce com "trocar senha no primeiro acesso"');
  ok(u1.user.app_metadata?.uso_tv === true, 'rótulo "uso em TV" guardado (app_metadata, que o usuário não edita)');
  const { data: p1 } = await svc.from('user_profiles').select('role, full_name').eq('id', c1.corpo.usuario.id).single();
  ok(p1.role === 'operator' && p1.full_name === 'Fulano Teste', 'perfil operador com o nome', JSON.stringify(p1));
  const login1 = await entrar(emailDe('op'), senha1);
  ok(Boolean(login1.sessao), 'a conta nova entra com a senha temporária');

  const c2 = await api(A, 'criar', { nome: 'Admin Dois', email: emailDe('adm'), papel: 'admin' });
  criados.push(c2.corpo.usuario?.id);
  const { data: p2 } = await svc.from('user_profiles').select('role').eq('id', c2.corpo.usuario?.id).single();
  ok(c2.status === 200 && p2?.role === 'admin', 'cria administrador (perfil admin gravado pela service_role)');
  ok((await api(A, 'criar', { nome: 'Dup', email: emailDe('op').toUpperCase(), papel: 'operator' })).status === 409, 'e-mail repetido (mesmo em maiúsculas): 409');
  ok((await api(A, 'criar', { nome: 'X', email: 'nao-e-email', papel: 'operator' })).status === 400, 'e-mail inválido: 400');
  ok((await api(A, 'criar', { nome: 'X', email: emailDe('x'), papel: 'dono' })).status === 400, 'papel fora da lista: 400');
  ok((await api(A, 'criar', { nome: '', email: emailDe('y'), papel: 'operator' })).status === 400, 'sem nome: 400');
  const grande = await api(A, 'criar', { nome: 'x'.repeat(5000), email: emailDe('z'), papel: 'operator' });
  ok(grande.status === 400, 'corpo grande demais: 400');

  console.log('\n3. Admin edita');
  const e1 = await api(A, 'editar', { id: c1.corpo.usuario.id, nome: 'Fulano Editado', papel: 'operator', uso_tv: false });
  const { data: pe } = await svc.from('user_profiles').select('full_name').eq('id', c1.corpo.usuario.id).single();
  const { data: ue } = await svc.auth.admin.getUserById(c1.corpo.usuario.id);
  ok(e1.status === 200 && pe.full_name === 'Fulano Editado' && ue.user.app_metadata?.uso_tv === false, 'nome e rótulo de TV mudam');
  ok(ue.user.app_metadata?.trocar_senha === true, 'editar não apaga o "trocar senha"');

  console.log('\n4. Admin reseta a senha');
  const r1 = await api(A, 'resetar_senha', { id: c1.corpo.usuario.id });
  ok(r1.status === 200 && r1.corpo.senha_temporaria && r1.corpo.senha_temporaria !== senha1, 'devolve uma senha temporária nova');
  ok(!(await entrar(emailDe('op'), senha1)).sessao, 'a senha antiga não entra mais');
  const renovar = await login1.c.auth.refreshSession({ refresh_token: login1.sessao.refresh_token });
  ok(Boolean(renovar.error), 'a sessão aberta antes do reset não renova (sessões derrubadas)', renovar.error?.message);
  const login2 = await entrar(emailDe('op'), r1.corpo.senha_temporaria);
  ok(Boolean(login2.sessao), 'a senha nova entra');

  console.log('\n5. Trocar a própria senha');
  const T = login2.sessao.access_token;
  ok((await api(T, 'trocar_minha_senha', { senha_atual: 'errada', senha_nova: 'Nova#Senha2026x' })).status === 400, 'senha atual errada: 400');
  const fraca = await api(T, 'trocar_minha_senha', { senha_atual: r1.corpo.senha_temporaria, senha_nova: 'curta' });
  ok(fraca.status === 400 && /12/.test(fraca.corpo.erro || ''), 'senha fraca: 400 com a regra', fraca.corpo.erro);
  const semSimbolo = await api(T, 'trocar_minha_senha', { senha_atual: r1.corpo.senha_temporaria, senha_nova: 'SemSimbolo2026abc' });
  ok(semSimbolo.status === 400, 'sem símbolo: 400', semSimbolo.corpo.erro);
  const NOVA = `Minha#Senha-${Date.now()}`;
  const troca = await api(T, 'trocar_minha_senha', { senha_atual: r1.corpo.senha_temporaria, senha_nova: NOVA });
  ok(troca.status === 200 && Boolean(troca.corpo.sessao?.access_token), 'troca com a senha atual certa: 200, com sessão nova', String(troca.status));
  ok(!JSON.stringify(troca.corpo).includes(NOVA), 'a resposta não devolve a senha');
  const { data: ut } = await svc.auth.admin.getUserById(c1.corpo.usuario.id);
  ok(ut.user.app_metadata?.trocar_senha === false, 'o "trocar senha" saiu depois da troca');
  ok(Boolean((await entrar(emailDe('op'), NOVA)).sessao), 'entra com a senha que ELE escolheu');
  ok((await api(T, 'listar')).status === 401, 'o token de antes da troca não vale mais (as outras sessões caem)');
  const T2 = troca.corpo.sessao.access_token;
  const lerCom = async (tok) => (await fetch(`${URL}/rest/v1/operators?select=id&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${tok}` } })).status;
  ok(await lerCom(T) === 401, 'no banco também: o token de antes da troca é recusado');
  ok(await lerCom(T2) === 200, 'a sessão nova devolvida a quem trocou funciona (ele continua logado)');
  const statusTentativas = [];
  for (let i = 0; i < 6; i += 1) {
    statusTentativas.push((await api(T2, 'trocar_minha_senha', { senha_atual: `errada-${i}`, senha_nova: `Outra#Senha-${i}-2026` })).status);
  }
  ok(statusTentativas.at(-1) === 429, 'senha atual errada várias vezes seguidas: limite de tentativas (429)', statusTentativas.join(','));
  ok((await api(oper.sessao.access_token, 'trocar_minha_senha', { senha_atual: 'x', senha_nova: 'y' })).status === 400,
    'operador pode chamar a troca da PRÓPRIA senha (e é recusado só pela senha)');

  console.log('\n6. Desativar e reativar');
  const login3 = await entrar(emailDe('op'), NOVA);
  const d1 = await api(A, 'desativar', { id: c1.corpo.usuario.id });
  ok(d1.status === 200, 'desativa: 200');
  const tentativa = await entrar(emailDe('op'), NOVA);
  ok(!tentativa.sessao && /banned/i.test(tentativa.erro?.message || ''), 'login recusado (conta desativada)', tentativa.erro?.message);
  const renov3 = await login3.c.auth.refreshSession({ refresh_token: login3.sessao.refresh_token });
  ok(Boolean(renov3.error), 'sessão aberta não renova mais', renov3.error?.message);
  const comTokenAntigo = await api(login3.sessao.access_token, 'trocar_minha_senha', { senha_atual: NOVA, senha_nova: `${NOVA}2` });
  ok(comTokenAntigo.status === 403 || comTokenAntigo.status === 401, 'JWT ainda não vencido da conta desativada é recusado pela função', String(comTokenAntigo.status));
  const lista = await api(A, 'listar');
  ok(lista.corpo.usuarios?.find((u) => u.id === c1.corpo.usuario.id)?.ativo === false, 'a lista mostra a conta como desativada');
  ok((await api(A, 'reativar', { id: c1.corpo.usuario.id })).status === 200 && Boolean((await entrar(emailDe('op'), NOVA)).sessao),
    'reativa: entra de novo com a mesma senha');

  console.log('\n7. Ninguém mexe em si mesmo');
  ok((await api(A, 'excluir', { id: meuId, confirmacao: emailDe('ator') })).status === 403, 'excluir a si mesmo: 403');
  ok((await api(A, 'desativar', { id: meuId })).status === 403, 'desativar a si mesmo: 403');
  ok((await api(A, 'resetar_senha', { id: meuId })).status === 403, 'resetar a própria senha por aqui: 403');
  ok((await api(A, 'editar', { id: meuId, nome: 'Eu', papel: 'operator' })).status === 403, 'rebaixar a si mesmo: 403');
  const { data: euAinda } = await svc.from('user_profiles').select('role').eq('id', meuId).single();
  ok(euAinda.role === 'admin', 'continuo admin');

  console.log('\n8. Excluir');
  const errada = await api(A, 'excluir', { id: c1.corpo.usuario.id, confirmacao: 'outro@email.com' });
  ok(errada.status === 400, 'confirmação digitada errada: 400');
  const ex = await api(A, 'excluir', { id: c1.corpo.usuario.id, confirmacao: emailDe('op') });
  const { data: some } = await svc.auth.admin.getUserById(c1.corpo.usuario.id);
  const { count: perfil } = await svc.from('user_profiles').select('id', { count: 'exact', head: true }).eq('id', c1.corpo.usuario.id);
  ok(ex.status === 200 && !some?.user && perfil === 0, 'excluída: some do Auth e do perfil');
  ok((await api(A, 'editar', { id: c1.corpo.usuario.id, nome: 'x', papel: 'operator' })).status === 404, 'conta excluída: 404');

  console.log('\n9. Último administrador');
  // A corrida acontece entre DUAS contas descartáveis (adm2 e adm3). Para que
  // elas sejam as únicas admins, a conta de teste é rebaixada pela service_role
  // durante o passo e volta a admin no fim, aconteça o que acontecer. (A
  // primeira versão pôs a conta de teste na corrida e ela foi a excluída: a
  // trava funcionou, o teste é que estava errado.)
  const c3 = await api(A, 'criar', { nome: 'Admin Tres', email: emailDe('adm3'), papel: 'admin' });
  criados.push(c3.corpo.usuario?.id);
  const adm2 = await entrar(emailDe('adm'), c2.corpo.senha_temporaria);
  const adm3 = await entrar(emailDe('adm3'), c3.corpo.senha_temporaria);
  if (!adm2.sessao || !adm3.sessao) throw new Error('as duas contas admin descartáveis não logaram');
  const foraDaCorrida = [meuId, testeAdmin.sessao.user.id];
  const { error: eRebaixa } = await svc.from('user_profiles').update({ role: 'operator' }).in('id', foraDaCorrida);
  if (eRebaixa) throw new Error(`não consegui tirar o admin de teste da corrida: ${eRebaixa.message}`);
  try {
    // Os dois pedem, AO MESMO TEMPO, a exclusão um do outro. Sem a trava no
    // banco, as duas conferências veriam "há outro admin" e não sobraria nenhum.
    const [x1, x2] = await Promise.all([
      api(adm2.sessao.access_token, 'excluir', { id: c3.corpo.usuario.id, confirmacao: emailDe('adm3') }),
      api(adm3.sessao.access_token, 'excluir', { id: c2.corpo.usuario.id, confirmacao: emailDe('adm') }),
    ]);
    const { count: admins } = await svc.from('user_profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
    ok(admins === 1, 'dois admins se excluindo ao mesmo tempo: sobra exatamente um', `status ${x1.status}/${x2.status}, admins ${admins}`);
    ok([x1.status, x2.status].filter((s) => s === 200).length === 1, 'um pedido passa e o outro é recusado', `${x1.status}/${x2.status}`);
    const { data: ultimo } = await svc.from('user_profiles').select('id').eq('role', 'admin').single();
    const { error: eUltimo } = await svc.from('user_profiles').update({ role: 'operator' }).eq('id', ultimo.id);
    ok(Boolean(eUltimo) && /administrador/i.test(eUltimo.message), 'no banco, rebaixar o último admin é recusado (até para a service_role)', eUltimo?.message);
    const sobra = ultimo.id === c2.corpo.usuario.id ? adm2 : adm3;
    const proprio = await api(sobra.sessao.access_token, 'desativar', { id: ultimo.id });
    ok(proprio.status === 403, 'o último admin não desativa a si mesmo', String(proprio.status));
  } finally {
    const { error: eVolta } = await svc.from('user_profiles').update({ role: 'admin' }).in('id', foraDaCorrida);
    if (eVolta) console.error('ATENÇÃO: a conta admin de teste não voltou a admin:', eVolta.message);
  }
  const { data: voltaram } = await svc.from('user_profiles').select('role').in('id', foraDaCorrida);
  ok(voltaram?.length === 2 && voltaram.every((v) => v.role === 'admin'), 'as duas contas tiradas da corrida voltaram a admin');

  console.log('\n10. Auditoria');
  const aud = await api(A, 'auditoria');
  ok(aud.status === 200 && aud.corpo.registros?.some((r) => r.acao === 'criar' && r.alvo_email === emailDe('op')), 'admin lê o histórico, com a criação');
  const texto = JSON.stringify(aud.corpo.registros);
  ok(!texto.includes(senha1) && !texto.includes(NOVA) && !texto.includes(r1.corpo.senha_temporaria), 'nenhuma senha aparece no histórico');
  ok(aud.corpo.registros.some((r) => r.acao === 'excluir' && r.alvo_email === emailDe('op')), 'a exclusão ficou registrada com o e-mail de quem saiu');
  const { data: algum } = await svc.from('auditoria_usuarios').select('id').limit(1).single();
  const { error: eUpd } = await svc.from('auditoria_usuarios').update({ acao: 'editar' }).eq('id', algum.id);
  const { error: eDel } = await svc.from('auditoria_usuarios').delete().eq('id', algum.id);
  ok(Boolean(eUpd) && Boolean(eDel), 'nem a service_role altera ou apaga um registro', `${eUpd?.code}/${eDel?.code}`);
  const { error: eSegredo } = await svc.from('auditoria_usuarios').insert({ ator_id: meuId, ator_email: 'x', acao: 'editar', detalhes: { senha: 'x' } });
  ok(Boolean(eSegredo), 'o banco recusa registro com chave "senha"', eSegredo?.code);
  const opLe = await oper.c.from('auditoria_usuarios').select('id');
  ok(!opLe.error && opLe.data.length === 0, 'operador não enxerga o histórico (RLS)');
  const opEscreve = await oper.c.from('auditoria_usuarios').insert({ ator_id: meuId, ator_email: 'x', acao: 'criar' });
  ok(Boolean(opEscreve.error), 'operador não escreve no histórico', opEscreve.error?.code);
  const admEscreve = await admin.c.from('auditoria_usuarios').insert({ ator_id: meuId, ator_email: 'x', acao: 'criar' });
  ok(Boolean(admEscreve.error), 'nem o admin escreve direto (só o servidor, que tira o autor do JWT)', admEscreve.error?.code);
  const anonLe = await novoCliente().from('auditoria_usuarios').select('id');
  ok(Boolean(anonLe.error) || anonLe.data.length === 0, 'anon não lê', anonLe.error?.code);
  const rpc = await oper.c.rpc('encerrar_sessoes', { p_usuario: meuId });
  ok(Boolean(rpc.error), 'operador não executa encerrar_sessoes', rpc.error?.code);
  const rpcAdm = await admin.c.rpc('encerrar_sessoes', { p_usuario: oper.sessao.user.id });
  ok(Boolean(rpcAdm.error), 'nem o admin executa encerrar_sessoes direto (só o servidor)', rpcAdm.error?.code);
} catch (e) {
  ok(false, `a suíte parou: ${String(e.message || e).slice(0, 200)}`);
} finally {
  for (const id of criados.filter(Boolean)) await svc.auth.admin.deleteUser(id).catch(() => {});
}

console.log('\n' + (falhas ? `${falhas} FALHA(S)` : 'TUDO OK'));
process.exitCode = falhas ? 1 : 0;
