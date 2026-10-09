/**
 * src/lib/sessaoRetry.js — repetir UMA vez quando a falha for de sessão.
 *
 * O caso que isto trata foi diagnosticado em 08/10/2026: um 401 intermitente
 * logo após o login, com o token **válido** (papel certo, uma hora até
 * expirar) e o PostgREST respondendo:
 *
 *   {"code":"PGRST303","message":"JWT issued at future"}
 *
 * Ou seja, o instante de emissão do token está à frente do relógio de quem o
 * valida. A causa provável é **desvio de relógio** entre o serviço que emite e
 * o que valida. **Não está provada**: no ambiente local os contêineres não
 * expõem utilitário de data para medir o desvio.
 *
 * Esta repetição existe porque resolve o sintoma qualquer que seja a causa —
 * inclusive sessão expirada por outro motivo.
 *
 * REGRAS, de propósito:
 *
 *  - repete **uma vez só**. Repetir em laço transformaria um problema de
 *    autenticação numa tempestade de requisições;
 *  - só repete em erro de **sessão**. Erro de permissão (42501, o RLS
 *    recusando) ou de dado (23505, chave duplicada) **não** é repetido:
 *    insistir não resolve e esconderia o problema real atrás de uma segunda
 *    tentativa que também vai falhar;
 *  - **renova a sessão antes** de repetir, que é o que corrige um token velho;
 *  - se nem a renovação funcionar, devolve o erro **original**, que é mais
 *    honesto do que mascará-lo com o erro da renovação.
 *
 * Vive fora do `base44Client` de propósito: sem dependência de alias, pode ser
 * testado direto pelo Node.
 */

/** Códigos do PostgREST que significam "problema com o token". */
const ERROS_DE_SESSAO = new Set([
  'PGRST301', // JWT expirado ou inválido
  'PGRST303', // JWT emitido no futuro (desvio de relógio)
]);

/** O erro é de sessão, e não de permissão ou de dado? */
export function ehErroDeSessao(erro) {
  if (!erro) return false;
  const codigo = String(erro.code ?? '');
  const status = Number(erro.status ?? erro.statusCode ?? 0);
  return status === 401 || codigo === '401' || ERROS_DE_SESSAO.has(codigo);
}

/**
 * @param {() => PromiseLike<{data: any, error: any}>} construir
 *        constrói E executa a consulta. Precisa ser uma função, não a consulta
 *        pronta: uma consulta já executada não pode ser executada de novo.
 * @param {() => Promise<any>} renovar  como renovar a sessão
 */
export async function executarComRenovacao(construir, renovar) {
  const primeira = await construir();
  if (!ehErroDeSessao(primeira?.error)) return primeira;

  try {
    await renovar();
  } catch {
    return primeira;
  }
  return construir();
}
