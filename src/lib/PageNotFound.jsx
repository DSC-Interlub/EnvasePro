import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Compass, Home } from "lucide-react";

/**
 * Rota inexistente.
 *
 * Era a página da Base44: em inglês ("Page Not Found", "Go Home"), com uma nota
 * ao admin pedindo para "a IA implementar a página", e uma consulta ao banco
 * só para decidir se mostrava essa nota. Agora: português, padrão Fluxo, botão
 * de 48 px e nenhuma requisição.
 */
export default function PageNotFound() {
  const { pathname } = useLocation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo p-4">
      <div className="entra cartao-fluxo w-full max-w-[460px] p-8 text-center sm:p-10">
        <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-painel bg-marca-suave text-marca">
          <Compass className="h-7 w-7" />
        </span>
        <p className="text-sm font-extrabold uppercase tracking-wide text-texto-fraco">Erro 404</p>
        <h1 className="mt-1 text-[24px] font-extrabold leading-tight text-tinta">Página não encontrada</h1>
        <p className="mt-2 text-sm font-semibold text-texto-fraco [overflow-wrap:anywhere]">
          O endereço <span className="font-mono text-tinta-media">{pathname}</span> não existe neste sistema.
        </p>
        <Link
          to="/"
          className="press foco-fluxo mt-6 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-token bg-marca px-6 text-base font-bold text-white no-underline shadow-marca hover:bg-marca-forte"
        >
          <Home className="h-4 w-4" aria-hidden="true" /> Voltar ao início
        </Link>
      </div>
    </main>
  );
}
