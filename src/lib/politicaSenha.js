/**
 * Política de senha — a MESMA do Auth (supabase/config.toml):
 * mínimo 12 caracteres, com minúscula, maiúscula, número e símbolo.
 *
 * Usada pela tela (lista de requisitos ao vivo) e pela função serverless
 * api/admin-usuarios.js (que recusa antes de chegar ao Auth). Um arquivo só,
 * para as duas não divergirem.
 */
export const REGRAS_SENHA = [
  { id: 'tamanho', texto: 'Pelo menos 12 caracteres', ok: (s) => s.length >= 12 },
  { id: 'minuscula', texto: 'Uma letra minúscula', ok: (s) => /[a-z]/.test(s) },
  { id: 'maiuscula', texto: 'Uma letra maiúscula', ok: (s) => /[A-Z]/.test(s) },
  { id: 'numero', texto: 'Um número', ok: (s) => /[0-9]/.test(s) },
  { id: 'simbolo', texto: 'Um símbolo (por exemplo ! @ # $ %)', ok: (s) => /[^A-Za-z0-9]/.test(s) },
];

export const SENHA_MAXIMO = 72;

/** Devolve a primeira regra que falta, em texto, ou null se a senha serve. */
export function problemaDaSenha(senha) {
  if (typeof senha !== 'string') return 'Informe a senha nova.';
  if (senha.length > SENHA_MAXIMO) return `A senha pode ter no máximo ${SENHA_MAXIMO} caracteres.`;
  const falta = REGRAS_SENHA.find((r) => !r.ok(senha));
  return falta ? `A senha precisa de: ${falta.texto.toLowerCase()}.` : null;
}
