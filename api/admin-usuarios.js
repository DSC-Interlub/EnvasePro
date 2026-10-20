/**
 * Vercel Serverless Function — admin-usuarios
 *
 * Gestão de contas pelo sistema: listar, criar, editar, resetar senha,
 * desativar, reativar, excluir, ler a trilha de auditoria — e "trocar minha
 * senha", a única ação aberta a qualquer conta logada.
 *
 * SEGURANÇA, na ordem em que acontece:
 *  1. só POST, corpo pequeno, lista FECHADA de ações;
 *  2. Bearer obrigatório; o JWT é conferido no Auth (getUser), não decodificado
 *     aqui. Conta desativada (banida) é recusada mesmo com JWT ainda válido;
 *  3. o papel vem de user_profiles, lido no banco — não do JWT nem do corpo;
 *  4. todas as ações, exceto trocar a própria senha, exigem admin ATIVO;
 *  5. limite de tentativas por conta, contado na trilha de auditoria (que é
 *     persistente — um Map em memória não vale em serverless);
 *  6. proteções: o último admin ativo não é excluído, desativado nem
 *     rebaixado; ninguém exclui, desativa, reseta ou rebaixa a si mesmo;
 *  7. a service_role só existe aqui, no servidor (variável da Vercel). Nunca no
 *     bundle, nunca no repositório, nunca em log;
 *  8. respostas com Cache-Control: no-store. A senha temporária só sai na
 *     resposta de criar/resetar, uma vez, e nunca vai para log nem auditoria.
 *
 * Sem a variável SUPABASE_SERVICE_ROLE_KEY, responde 503 com mensagem clara;
 * o resto do site não depende desta função.
 */

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { problemaDaSenha } from '../src/lib/politicaSenha.js';

export { problemaDaSenha };

const URL_SUPABASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const CHAVE_SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHAVE_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const ACOES_ADMIN = new Set(['listar', 'auditoria', 'criar', 'editar', 'resetar_senha', 'desativar', 'reativar', 'excluir']);
const ACOES_PROPRIAS = new Set(['trocar_minha_senha']);
const PAPEIS = new Set(['admin', 'operator']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CORPO_MAXIMO = 4096;
const JANELA_MS = 10 * 60 * 1000;
const LIMITE_ADMIN = 30; // ações de escrita por admin a cada 10 min
const LIMITE_TROCA = 5; // tentativas de trocar a própria senha a cada 10 min
const PARA_SEMPRE = '876000h'; // ~100 anos: "desativado" no Auth é um banimento sem prazo

export class ErroHttp extends Error {
  constructor(status, mensagem, codigo) { super(mensagem); this.status = status; this.codigo = codigo; }
}

/** Senha temporária: 20 caracteres de crypto, com minúscula, maiúscula, número e símbolo. */
export function gerarSenhaTemporaria(tamanho = 20) {
  const grupos = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%&*-_=+?'];
  const todos = grupos.join('');
  const escolher = (s) => s[crypto.randomInt(s.length)];
  const chars = grupos.map(escolher);
  while (chars.length < tamanho) chars.push(escolher(todos));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const banido = (u) => Boolean(u?.banned_until && new Date(u.banned_until) > new Date());

function texto(v, nome, max) {
  if (typeof v !== 'string') throw new ErroHttp(400, `${nome} é obrigatório.`);
  const t = v.trim();
  if (!t) throw new ErroHttp(400, `${nome} é obrigatório.`);
  if (t.length > max) throw new ErroHttp(400, `${nome} pode ter no máximo ${max} caracteres.`);
  return t;
}
function idValido(v) {
  if (typeof v !== 'string' || !UUID.test(v)) throw new ErroHttp(400, 'Conta inválida.');
  return v;
}

async function todosOsUsuarios(adm) {
  const lista = [];
  for (let pagina = 1; pagina < 50; pagina += 1) {
    const { data, error } = await adm.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (error) throw error;
    lista.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return lista;
}

async function perfis(adm) {
  const { data, error } = await adm.from('user_profiles').select('id, email, full_name, role');
  if (error) throw error;
  return new Map(data.map((p) => [p.id, p]));
}

async function adminsAtivos(adm) {
  const [usuarios, mapa] = await Promise.all([todosOsUsuarios(adm), perfis(adm)]);
  return usuarios.filter((u) => mapa.get(u.id)?.role === 'admin' && !banido(u)).map((u) => u.id);
}

async function registrar(adm, ator, acao, alvo, detalhes = {}) {
  const { error } = await adm.from('auditoria_usuarios').insert({
    ator_id: ator.id, ator_email: ator.email, acao,
    alvo_id: alvo?.id ?? null, alvo_email: alvo?.email ?? null, detalhes,
  });
  // A ação já aconteceu; falhar a resposta por causa do registro confundiria
  // quem chamou. Fica no log do servidor, sem dado pessoal além do código.
  if (error) console.error('[admin-usuarios] auditoria não gravou:', error.code);
}

/**
 * Limite de tentativas, contado na trilha de auditoria (persistente).
 * `acoes`: ações que contam; `negadosDe`: se dado, só os "negado" daquela
 * tentativa contam (para que recusas de OUTRAS ações não bloqueiem a troca da
 * própria senha).
 */
async function conferirLimite(adm, ator, acoes, limite, negadosDe = null) {
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const contar = async (lista, filtro) => {
    let q = adm.from('auditoria_usuarios').select('id', { count: 'exact', head: true })
      .eq('ator_id', ator.id).in('acao', lista).gte('criado_em', desde);
    if (filtro) q = q.contains('detalhes', filtro);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  };
  const total = negadosDe
    ? await contar(acoes.filter((a) => a !== 'negado'), null) + await contar(['negado'], { tentou: negadosDe })
    : await contar(acoes, null);
  if (total >= limite) throw new ErroHttp(429, 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.');
}

async function buscarAlvo(adm, id) {
  const { data, error } = await adm.auth.admin.getUserById(id);
  if (error || !data?.user) throw new ErroHttp(404, 'Conta não encontrada.');
  return data.user;
}

const ESCRITAS = ['criar', 'editar', 'resetar_senha', 'desativar', 'reativar', 'excluir', 'negado'];

/** Toda a regra, separada do HTTP para ser testável. */
export async function executar({ adm, anon, token, corpo }) {
  const acao = corpo?.acao;
  if (!ACOES_ADMIN.has(acao) && !ACOES_PROPRIAS.has(acao)) throw new ErroHttp(400, 'Ação desconhecida.');

  if (!token) throw new ErroHttp(401, 'Faça login de novo.');
  const { data: quem, error: erroQuem } = await adm.auth.getUser(token);
  if (erroQuem || !quem?.user) throw new ErroHttp(401, 'Sessão inválida. Faça login de novo.');
  const ator = quem.user;
  if (banido(ator)) throw new ErroHttp(403, 'Esta conta está desativada.');

  // ── trocar a própria senha: qualquer conta ativa ──────────────────────────
  if (acao === 'trocar_minha_senha') {
    await conferirLimite(adm, ator, ['trocar_propria_senha', 'negado'], LIMITE_TROCA, 'trocar_minha_senha');
    const { senha_atual: atual, senha_nova: nova } = corpo;
    const problema = problemaDaSenha(nova);
    if (problema) throw new ErroHttp(400, problema);
    if (typeof atual !== 'string' || !atual) throw new ErroHttp(400, 'Informe a senha atual.');
    if (atual === nova) throw new ErroHttp(400, 'A senha nova tem de ser diferente da atual.');
    const { data: conferida, error: erroSenha } = await anon.auth.signInWithPassword({ email: ator.email, password: atual });
    if (erroSenha || !conferida?.session) {
      await registrar(adm, ator, 'negado', ator, { tentou: 'trocar_minha_senha', motivo: 'senha_atual_errada' });
      throw new ErroHttp(400, 'A senha atual não confere.');
    }
    // A conferência abriu uma sessão; ela é fechada na hora (só ela).
    await adm.auth.admin.signOut(conferida.session.access_token, 'local').catch(() => {});
    const { error } = await adm.auth.admin.updateUserById(ator.id, {
      password: nova, app_metadata: { ...(ator.app_metadata || {}), trocar_senha: false },
    });
    if (error) throw new ErroHttp(400, error.message?.includes('weak') ? 'Senha fraca demais.' : 'Não foi possível trocar a senha.');
    await registrar(adm, ator, 'trocar_propria_senha', ator);
    return { ok: true };
  }

  // ── daqui para baixo: só admin ativo ──────────────────────────────────────
  const { data: perfil } = await adm.from('user_profiles').select('role').eq('id', ator.id).maybeSingle();
  if (perfil?.role !== 'admin') {
    await conferirLimite(adm, ator, ['negado'], LIMITE_ADMIN);
    await registrar(adm, ator, 'negado', null, { tentou: acao, motivo: 'nao_admin' });
    throw new ErroHttp(403, 'Só administradores gerenciam usuários.');
  }

  if (acao === 'listar') {
    const [usuarios, mapa] = await Promise.all([todosOsUsuarios(adm), perfis(adm)]);
    return {
      usuarios: usuarios.map((u) => ({
        id: u.id,
        email: u.email,
        nome: mapa.get(u.id)?.full_name || u.user_metadata?.full_name || '',
        papel: mapa.get(u.id)?.role || 'operator',
        uso_tv: Boolean(u.app_metadata?.uso_tv),
        ativo: !banido(u),
        trocar_senha: Boolean(u.app_metadata?.trocar_senha),
        ultimo_acesso: u.last_sign_in_at || null,
        criado_em: u.created_at,
      })).sort((a, b) => a.email.localeCompare(b.email)),
    };
  }

  if (acao === 'auditoria') {
    const { data, error } = await adm.from('auditoria_usuarios')
      .select('id, criado_em, ator_email, acao, alvo_email, detalhes')
      .order('criado_em', { ascending: false }).limit(100);
    if (error) throw error;
    return { registros: data };
  }

  await conferirLimite(adm, ator, ESCRITAS, LIMITE_ADMIN);

  if (acao === 'criar') {
    const nome = texto(corpo.nome, 'Nome', 100);
    const email = texto(corpo.email, 'E-mail', 254).toLowerCase();
    if (!EMAIL.test(email)) throw new ErroHttp(400, 'E-mail inválido.');
    const papel = corpo.papel;
    if (!PAPEIS.has(papel)) throw new ErroHttp(400, 'Papel inválido.');
    const usoTv = papel === 'operator' && corpo.uso_tv === true;
    const senha = gerarSenhaTemporaria();
    const { data, error } = await adm.auth.admin.createUser({
      email, password: senha, email_confirm: true,
      user_metadata: { full_name: nome },
      app_metadata: { trocar_senha: true, uso_tv: usoTv },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message || '')) throw new ErroHttp(409, 'Já existe uma conta com este e-mail.');
      throw new ErroHttp(400, 'Não foi possível criar a conta.');
    }
    const novo = data.user;
    // O gatilho handle_new_user cria o perfil SEMPRE como operador. Virar
    // admin é uma atualização da service_role, que a trava de papel aceita.
    const { error: erroPerfil } = await adm.from('user_profiles')
      .update({ role: papel, full_name: nome }).eq('id', novo.id);
    if (erroPerfil) {
      await adm.auth.admin.deleteUser(novo.id).catch(() => {});
      throw new ErroHttp(500, 'Não foi possível gravar o perfil; a conta não foi criada.');
    }
    await registrar(adm, ator, 'criar', novo, { papel, uso_tv: usoTv });
    return { usuario: { id: novo.id, email: novo.email }, senha_temporaria: senha };
  }

  const alvo = await buscarAlvo(adm, idValido(corpo.id));
  const proprio = alvo.id === ator.id;
  const { data: perfilAlvo } = await adm.from('user_profiles').select('role, full_name').eq('id', alvo.id).maybeSingle();
  const alvoEhAdminAtivo = perfilAlvo?.role === 'admin' && !banido(alvo);
  const ultimoAdmin = async () => alvoEhAdminAtivo && (await adminsAtivos(adm)).length <= 1;

  if (acao === 'editar') {
    const nome = texto(corpo.nome, 'Nome', 100);
    const papel = corpo.papel;
    if (!PAPEIS.has(papel)) throw new ErroHttp(400, 'Papel inválido.');
    const rebaixa = perfilAlvo?.role === 'admin' && papel !== 'admin';
    if (rebaixa && proprio) throw new ErroHttp(403, 'Você não pode tirar o seu próprio papel de administrador.');
    if (rebaixa && await ultimoAdmin()) throw new ErroHttp(403, 'Este é o último administrador ativo; ele não pode deixar de ser administrador.');
    const usoTv = papel === 'operator' && corpo.uso_tv === true;
    const { error: e1 } = await adm.from('user_profiles').update({ full_name: nome, role: papel }).eq('id', alvo.id);
    if (e1) throw new ErroHttp(400, 'Não foi possível salvar.');
    const { error: e2 } = await adm.auth.admin.updateUserById(alvo.id, {
      user_metadata: { ...(alvo.user_metadata || {}), full_name: nome },
      app_metadata: { ...(alvo.app_metadata || {}), uso_tv: usoTv },
    });
    if (e2) throw new ErroHttp(400, 'Não foi possível salvar.');
    await registrar(adm, ator, 'editar', alvo, { papel_antes: perfilAlvo?.role ?? null, papel, uso_tv: usoTv });
    return { ok: true };
  }

  if (acao === 'resetar_senha') {
    if (proprio) throw new ErroHttp(403, 'Para a sua própria senha, use "Alterar minha senha".');
    const senha = gerarSenhaTemporaria();
    const { error } = await adm.auth.admin.updateUserById(alvo.id, {
      password: senha, app_metadata: { ...(alvo.app_metadata || {}), trocar_senha: true },
    });
    if (error) throw new ErroHttp(400, 'Não foi possível resetar a senha.');
    const { data: sessoes } = await adm.rpc('encerrar_sessoes', { p_usuario: alvo.id });
    await registrar(adm, ator, 'resetar_senha', alvo, { sessoes_encerradas: sessoes ?? 0 });
    return { senha_temporaria: senha };
  }

  if (acao === 'desativar') {
    if (proprio) throw new ErroHttp(403, 'Você não pode desativar a sua própria conta.');
    if (await ultimoAdmin()) throw new ErroHttp(403, 'Este é o último administrador ativo; ele não pode ser desativado.');
    const { error } = await adm.auth.admin.updateUserById(alvo.id, { ban_duration: PARA_SEMPRE });
    if (error) throw new ErroHttp(400, 'Não foi possível desativar.');
    const { data: sessoes } = await adm.rpc('encerrar_sessoes', { p_usuario: alvo.id });
    await registrar(adm, ator, 'desativar', alvo, { sessoes_encerradas: sessoes ?? 0 });
    return { ok: true };
  }

  if (acao === 'reativar') {
    const { error } = await adm.auth.admin.updateUserById(alvo.id, { ban_duration: 'none' });
    if (error) throw new ErroHttp(400, 'Não foi possível reativar.');
    await registrar(adm, ator, 'reativar', alvo);
    return { ok: true };
  }

  if (acao === 'excluir') {
    if (proprio) throw new ErroHttp(403, 'Você não pode excluir a sua própria conta.');
    if (typeof corpo.confirmacao !== 'string' || corpo.confirmacao.trim().toLowerCase() !== String(alvo.email).toLowerCase()) {
      throw new ErroHttp(400, 'Para excluir, digite o e-mail da conta exatamente.');
    }
    if (await ultimoAdmin()) throw new ErroHttp(403, 'Este é o último administrador ativo; ele não pode ser excluído.');
    const { error } = await adm.auth.admin.deleteUser(alvo.id);
    if (error) throw new ErroHttp(400, 'Não foi possível excluir.');
    await registrar(adm, ator, 'excluir', alvo, { papel: perfilAlvo?.role ?? null });
    return { ok: true };
  }

  throw new ErroHttp(400, 'Ação desconhecida.');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Use POST.' });
  }
  if (!URL_SUPABASE || !CHAVE_SERVICO || !CHAVE_ANON) {
    return res.status(503).json({
      codigo: 'SEM_CONFIGURACAO',
      erro: 'A gestão de usuários ainda não está configurada no servidor: falta a variável SUPABASE_SERVICE_ROLE_KEY na Vercel. O resto do sistema funciona normalmente.',
    });
  }

  let corpo = req.body;
  if (typeof corpo === 'string') {
    try { corpo = JSON.parse(corpo); } catch { return res.status(400).json({ erro: 'Corpo inválido.' }); }
  }
  if (!corpo || typeof corpo !== 'object' || JSON.stringify(corpo).length > CORPO_MAXIMO) {
    return res.status(400).json({ erro: 'Corpo inválido.' });
  }

  const cabecalho = req.headers.authorization || req.headers.Authorization || '';
  const token = /^Bearer\s+(.+)$/i.exec(cabecalho)?.[1] || null;
  const opcoes = { auth: { autoRefreshToken: false, persistSession: false } };

  try {
    const resultado = await executar({
      adm: createClient(URL_SUPABASE, CHAVE_SERVICO, opcoes),
      anon: createClient(URL_SUPABASE, CHAVE_ANON, opcoes),
      token,
      corpo,
    });
    return res.status(200).json(resultado);
  } catch (e) {
    if (e instanceof ErroHttp) return res.status(e.status).json({ erro: e.message, codigo: e.codigo });
    // Só a ação e o código do erro: nada do corpo (que pode ter senha).
    console.error('[admin-usuarios] falha:', corpo?.acao, e?.code || e?.status || 'sem código');
    return res.status(500).json({ erro: 'Falha inesperada. Tente de novo.' });
  }
}
