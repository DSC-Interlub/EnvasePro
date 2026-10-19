import React from "react";
import { useAuth } from "@/lib/AuthContext";
import FormularioLogin from "./FormularioLogin";

/**
 * A tela de login — mostrada DIRETAMENTE quando não há sessão.
 *
 * Antes, quem chegava sem sessão via uma tela praticamente vazia com um botão
 * "Fazer Login no Sistema", que abria um modal com o formulário. Um clique a
 * mais, e numa TV recém-ligada a pessoa nem sabia onde estava o formulário.
 * Agora o formulário É a tela.
 *
 * Vale para todas as rotas, inclusive as da TV: a TV também exige sessão
 * desde a remoção do acesso anônimo.
 */
export default function TelaLogin() {
  const { authError } = useAuth();

  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo p-4">
      <div className="entra cartao-fluxo w-full max-w-[420px] p-8 sm:p-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <span
            aria-hidden="true"
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-painel bg-tinta
                       text-xl font-extrabold text-white"
          >
            EP
          </span>
          <h1 className="text-[26px] font-extrabold leading-tight text-tinta">EnvasePro</h1>
          <p className="mt-1 text-sm font-semibold text-texto-fraco">Operações Interlub</p>
        </div>

        {/* O aviso vem do contexto: "sessão encerrada por inatividade", por
            exemplo. Sem ele o admin caía na tela de login sem saber por quê. */}
        <FormularioLogin aviso={authError && !/invalid login/i.test(authError) ? authError : null} />
      </div>
    </main>
  );
}
