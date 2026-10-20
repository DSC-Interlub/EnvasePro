import React from "react";
import { Link } from "react-router-dom";
import { Factory, KeyRound, LogOut, RefreshCw, ShieldAlert, UserCheck } from "lucide-react";

/**
 * O menu lateral da direção "Fluxo".
 *
 * TRÊS FORMAS, UMA FONTE
 *
 * A mesma lista de itens se apresenta de três jeitos, e quem escolhe é o
 * `modo` — não um `hidden md:block`, que renderiza as três e esconde duas
 * (foi o erro que a V1 (f) cometeu e mediu: 50 produtos geravam 200 botões
 * em vez de 100).
 *
 *   'completo' — desktop: cartão flutuante de 248px, com rótulo de seção
 *   'rail'     — tablet: 80px, só ícone, com o rótulo no `title`
 *   'gaveta'   — celular: o 'completo' dentro de um painel que desliza
 *
 * O cartão é FLUTUANTE: fundo da página em volta, raio de 24, sombra. Não é
 * uma coluna encostada na borda. É o que o protótipo do painel mostra, e é o
 * que faz o menu parecer um objeto em cima da mesa em vez de uma moldura.
 */

/** Um item. `ativo` pinta de marca-suave; o resto fica em tinta-media. */
function Item({ item, ativo, contador, modo, aoNavegar }) {
  const soIcone = modo === "rail";
  const base =
    "press foco-fluxo flex items-center min-h-[48px] rounded-token font-semibold " +
    "text-[15px] no-underline outline-none";
  const cor = ativo
    ? "bg-marca-suave text-marca font-bold"
    : "text-tinta-media hover:bg-marca-suave hover:text-marca";

  return (
    <Link
      to={item.url}
      onClick={aoNavegar}
      aria-current={ativo ? "page" : undefined}
      title={soIcone ? item.title : undefined}
      className={`${base} ${cor} ${soIcone ? "justify-center w-full" : "justify-between px-3.5 gap-3"}`}
    >
      {soIcone ? (
        <span className="relative flex items-center justify-center">
          <item.icon className="w-6 h-6" aria-hidden="true" />
          <span className="sr-only">{item.title}</span>
          {contador > 0 && (
            <span
              className="absolute -top-1.5 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-marca
                         text-white text-[11px] font-extrabold flex items-center justify-center num"
              aria-label={`${contador} pendências`}
            >
              {contador > 99 ? "99+" : contador}
            </span>
          )}
        </span>
      ) : (
        <>
          <span className="flex items-center gap-3 min-w-0">
            <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            <span className="min-w-0 leading-tight [overflow-wrap:anywhere]">{item.title}</span>
          </span>
          {contador > 0 && (
            <span
              className="min-w-[24px] h-6 px-2 rounded-full bg-marca text-white text-xs
                         font-extrabold flex items-center justify-center flex-shrink-0 num"
              aria-label={`${contador} pendências`}
            >
              {contador > 99 ? "99+" : contador}
            </span>
          )}
        </>
      )}
    </Link>
  );
}

export default function MenuLateral({
  grupos, role, user, currentOperator, contadorDe, contadoresFalharam,
  modo = "completo", aoNavegar, aoTrocarOperador, aoSair, urlAtual,
}) {
  const soIcone = modo === "rail";

  return (
    <nav
      aria-label="Navegação principal"
      className={`cartao-fluxo flex flex-col overflow-y-auto ${
        soIcone ? "w-20 px-2 py-4 gap-1 rounded-painel" : "w-[248px] px-3.5 py-5 gap-0.5"
      }`}
    >
      {/* ---------------------------------------------------------- marca */}
      {soIcone ? (
        <div className="flex items-center justify-center pb-3">
          <span
            className="w-11 h-11 rounded-token bg-tinta text-white font-extrabold text-sm
                       flex items-center justify-center"
            title="EnvasePro — Operações Interlub"
          >
            EP
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-2.5 pb-5">
          <span className="w-11 h-11 rounded-token bg-tinta text-white flex items-center justify-center flex-shrink-0">
            <Factory className="w-5 h-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-extrabold text-lg leading-tight tracking-[-0.02em] text-tinta truncate">
              EnvasePro
            </span>
            <span className="block text-xs font-semibold text-texto-fraco flex items-center gap-1">
              {role === "admin" ? (
                <><ShieldAlert className="w-3 h-3 text-atencao" aria-hidden="true" /> Administrador</>
              ) : "Operador"}
            </span>
          </span>
        </div>
      )}

      {/* --------------------------------------------------------- itens */}
      <div className={`flex flex-col ${soIcone ? "gap-1.5" : "gap-0.5"} min-h-0`}>
        {grupos.map((grupo) => (
          <React.Fragment key={grupo.nome}>
            {soIcone ? (
              // No rail o rótulo de seção não cabe; um traço separa os grupos
              grupo !== grupos[0] && <hr className="border-borda my-1.5 mx-2" />
            ) : (
              <div className="text-xs font-bold text-texto-apagado px-3 pt-3 pb-1.5">
                {grupo.nome}
              </div>
            )}
            {grupo.itens.map((item) => (
              <Item
                key={item.title}
                item={item}
                ativo={urlAtual === item.url.toLowerCase()}
                contador={contadorDe(item)}
                modo={modo}
                aoNavegar={aoNavegar}
              />
            ))}
          </React.Fragment>
        ))}
      </div>

      {/* O aviso ocupa o lugar do antigo `catch {}`: se a contagem falhar, os
          contadores acima estão velhos, e quem olha precisa saber. */}
      {role === "admin" && contadoresFalharam && (
        soIcone ? (
          <p role="status" title="Contadores desatualizados: não consegui consultar as pendências"
             className="mx-auto mt-2 w-8 h-8 rounded-full bg-atencao-suave text-atencao-tinta
                        flex items-center justify-center text-sm font-extrabold">
            !<span className="sr-only">Contadores desatualizados</span>
          </p>
        ) : (
          <p role="status"
             className="mx-1 mt-2 rounded-token-sm bg-atencao-suave px-2.5 py-2
                        text-[11px] font-semibold text-atencao-tinta">
            Contadores desatualizados: não consegui consultar as pendências.
          </p>
        )
      )}

      <div className="flex-1 min-h-3" />

      {/* --------------------------------------------- operador do turno */}
      {role === "operator" && !soIcone && (
        <div className="rounded-token bg-fundo p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-texto-fraco uppercase flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-marca" aria-hidden="true" /> Operador do turno
            </span>
            <button
              type="button"
              onClick={aoTrocarOperador}
              className="press foco-fluxo min-h-[48px] px-2 rounded-token-sm text-[11px]
                         font-bold text-marca hover:bg-marca-suave flex items-center gap-1"
              title="Trocar operador ativo"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" /> Trocar
            </button>
          </div>
          <p className="text-sm font-bold leading-tight text-tinta [overflow-wrap:anywhere]">
            {currentOperator?.nome || "Nenhum selecionado"}
          </p>
          {currentOperator?.sala && (
            <p className="text-[11px] font-semibold text-texto-fraco">Sala: {currentOperator.sala}</p>
          )}
        </div>
      )}

      {/* ------------------------------------------------ conta e sair */}
      {soIcone ? (
        <div className="contents">
        <Link
          to="/AlterarSenha"
          onClick={aoNavegar}
          title="Alterar minha senha"
          className="press foco-fluxo mx-auto mb-1 w-12 h-12 rounded-token text-tinta-media
                     hover:bg-marca-suave hover:text-marca flex items-center justify-center"
        >
          <KeyRound className="w-5 h-5" aria-hidden="true" />
          <span className="sr-only">Alterar minha senha</span>
        </Link>
        <button
          type="button"
          onClick={aoSair}
          title={`Sair (${user?.email || "conectado"})`}
          className="press foco-fluxo mx-auto w-12 h-12 rounded-token text-erro
                     hover:bg-erro-suave flex items-center justify-center"
        >
          <LogOut className="w-5 h-5" aria-hidden="true" />
          <span className="sr-only">Sair</span>
        </button>
        </div>
      ) : (
        <div className="contents">
        <div className="mt-2 flex items-center gap-2.5 rounded-token bg-fundo p-2.5">
          <span className="w-9 h-9 rounded-full bg-marca-suave-2 text-marca font-extrabold
                           text-xs flex items-center justify-center flex-shrink-0">
            {(user?.email || "?").slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            {/* Quebra depois do "@" ("pcp-brasil@" / "interlub.com"), e no meio
                de palavra só se um pedaço sozinho não couber. Antes quebrava em
                qualquer letra ("interlu" / "b.com"); cortar com "…" escondia o
                e-mail, e a TV (/Painel) não aceita texto cortado. */}
            <span className="block text-[13px] font-bold leading-tight text-tinta [overflow-wrap:break-word]">
              {user?.email?.includes("@")
                ? <span>{user.email.split("@")[0]}@<wbr />{user.email.split("@").slice(1).join("@")}</span>
                : (user?.email || "Conectado")}
            </span>
            <span className="block text-[11px] font-semibold text-texto-fraco">
              {role === "admin" ? "Administrador" : "Operador"}
            </span>
          </span>
          <button
            type="button"
            onClick={aoSair}
            title="Sair do sistema"
            className="press foco-fluxo w-12 h-12 rounded-token-sm text-erro
                       hover:bg-erro-suave flex items-center justify-center flex-shrink-0"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span className="sr-only">Sair</span>
          </button>
        </div>
        <Link
          to="/AlterarSenha"
          onClick={aoNavegar}
          className="press foco-fluxo mt-1 flex min-h-[48px] items-center gap-2 rounded-token px-3
                     text-[13px] font-bold text-tinta-media no-underline hover:bg-marca-suave hover:text-marca"
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" /> Alterar minha senha
        </Link>
        </div>
      )}
    </nav>
  );
}
