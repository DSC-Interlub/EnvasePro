import React from "react";
import { useAuth } from "@/lib/AuthContext";
import FormularioLogin from "./FormularioLogin";

/**
 * Login no meio da sessão — quando o token expira e a renovação falha.
 *
 * Usa o MESMO formulário da tela de login. Fica por cima do que a pessoa
 * estava fazendo, para ela entrar de novo e continuar de onde parou (o que
 * estava digitado na tela de baixo não se perde).
 *
 * Quando não há sessão nenhuma, quem aparece é a `TelaLogin`, não este modal.
 */
export default function LoginModal() {
  const { loginModalAberto, isAuthenticated, authError } = useAuth();

  if (!loginModalAberto || !isAuthenticated) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-login-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/50 p-4 backdrop-blur-sm"
    >
      <div className="entra cartao-fluxo w-full max-w-[420px] p-8">
        <h2 id="titulo-login-modal" className="text-xl font-extrabold text-tinta">
          Entre de novo para continuar
        </h2>
        <p className="mb-6 mt-1 text-sm font-semibold text-texto-fraco">
          Sua sessão expirou. O que estava na tela continua aqui.
        </p>
        <FormularioLogin aviso={authError && !/invalid login/i.test(authError) ? authError : null} />
      </div>
    </div>
  );
}
