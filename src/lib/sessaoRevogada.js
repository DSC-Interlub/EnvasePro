/**
 * Sessão encerrada pelo administrador — o detector central.
 *
 * Quem decide é o BANCO: a função checar_sessao() (pre-request do PostgREST)
 * recusa com HTTP 401 e "sessao_revogada" o JWT de uma conta resetada,
 * desativada, excluída ou com as sessões encerradas. O Auth, por sua vez,
 * recusa renovar o token dessa conta. Este módulo reconhece essas respostas em
 * QUALQUER chamada (ele embrulha o fetch do cliente Supabase) e dispara um
 * evento único; o AuthContext sai localmente e mostra a mensagem.
 *
 * `senha_temporaria` (HTTP 403) NÃO é revogação: é a conta no meio da troca
 * obrigatória de senha, e a tela dela já está aberta.
 */
export const EVENTO_SESSAO_REVOGADA = 'envase_sessao_revogada';
export const MENSAGEM_SESSAO_REVOGADA = 'Sua sessão foi encerrada pelo administrador.';

let suspensa = 0;
let avisada = false;

/**
 * Enquanto a própria pessoa troca a senha, o servidor revoga TODAS as sessões
 * dela (inclusive a desta aba) e devolve uma nova. Nesse intervalo, um 401 de
 * uma chamada em voo é esperado e não deve deslogar.
 */
export async function semAvisarDuranteTroca(fn) {
  suspensa += 1;
  try { return await fn(); } finally { suspensa -= 1; }
}

/** Chamado pelo AuthContext ao entrar de novo, para o próximo aviso valer. */
export function rearmarAviso() { avisada = false; }

function avisar() {
  if (suspensa > 0 || avisada || typeof window === 'undefined') return;
  avisada = true;
  window.dispatchEvent(new CustomEvent(EVENTO_SESSAO_REVOGADA));
}

const AUTH_RECUSOU = /refresh token not found|invalid refresh token|user is banned|user_banned|user not found|user_not_found|session_not_found/i;

/** O fetch do cliente Supabase, olhando as respostas que significam "revogada". */
export function fetchComDeteccao(fetchOriginal = (...a) => globalThis.fetch(...a)) {
  return async (entrada, init) => {
    const resposta = await fetchOriginal(entrada, init);
    try {
      const url = typeof entrada === 'string' ? entrada : entrada?.url || '';
      if (resposta.status === 401 && url.includes('/rest/v1/')) {
        const corpo = await resposta.clone().text();
        if (corpo.includes('sessao_revogada')) avisar();
      } else if ((resposta.status === 400 || resposta.status === 401 || resposta.status === 403)
        && /\/auth\/v1\/(token\?grant_type=refresh_token|user)/.test(url)) {
        const corpo = await resposta.clone().text();
        if (AUTH_RECUSOU.test(corpo)) avisar();
      }
    } catch { /* detectar nunca pode quebrar a chamada */ }
    return resposta;
  };
}
