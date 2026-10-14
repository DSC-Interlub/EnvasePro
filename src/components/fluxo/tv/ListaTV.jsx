import React from "react";
import CartaoVidro from "./CartaoVidro";

/**
 * Lista de linhas da TV, na gramática de vidro do protótipo.
 *
 * POR QUE ELA EXISTE
 *
 * Os três slides da TV tinham cada um a sua lista, com cartão de gradiente
 * (`from-red-900/90 to-red-800/90`), borda esquerda de 4px e texto de 10px.
 * A 4 metros, 10px não se lê — e o gradiente colorido por linha fazia a tela
 * parecer um semáforo.
 *
 * Aqui a linha é de vidro como o resto da TV, o texto principal tem 28px e o
 * estado vem de um ponto de cor **mais a palavra**. O `tom` pinta só a borda,
 * como o cartão de ocorrências do protótipo faz.
 *
 * SOBRE O BOTÃO NUMA TELA "SEM INTERAÇÃO"
 *
 * A direção diz que a TV não tem interação, e isso vale para navegação e
 * filtro. Mas a TV da sala Bio tem uma ação de verdade: marcar que o material
 * foi retirado da sala. É um operador que está ali, de pé, na frente da tela.
 * Tirar o botão para cumprir a regra tiraria função. Ele fica, com 48px de
 * alvo como qualquer outro.
 */
const PONTO = { ok: "bg-ok", atencao: "bg-atencao", erro: "bg-erro", neutro: "bg-texto-fraco" };

export default function ListaTV({ titulo, contagem, itens = [], vazio, carregando = false }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ gap: "clamp(10px, 1.1vw, 20px)" }}>
      {titulo && (
        <div className="flex flex-none items-baseline gap-3">
          <h2
            className="font-extrabold uppercase tracking-[0.04em] text-tinta"
            style={{ fontSize: "clamp(15px, 1.35vw, 26px)" }}
          >
            {titulo}
          </h2>
          {contagem != null && (
            <span className="num font-bold text-texto-fraco" style={{ fontSize: "clamp(13px, 1.1vw, 21px)" }}>
              {contagem}
            </span>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto" style={{ display: "grid", gap: "clamp(8px, .9vw, 16px)", alignContent: "start" }}>
        {carregando ? (
          <p className="font-bold text-texto-fraco" style={{ fontSize: "clamp(14px, 1.3vw, 24px)" }}>
            Carregando…
          </p>
        ) : itens.length === 0 ? (
          <p className="font-bold text-texto-fraco" style={{ fontSize: "clamp(14px, 1.3vw, 24px)" }}>
            {vazio || "Nada em andamento agora"}
          </p>
        ) : (
          itens.map((it) => (
            <CartaoVidro
              key={it.id}
              tom={it.tom === "erro" ? "erro" : "neutro"}
              raio={24}
              className="items-center"
              style={{ padding: "clamp(12px, 1.2vw, 22px)", gap: "clamp(10px, 1.1vw, 20px)" }}
            >
              <span
                aria-hidden="true"
                className={`flex-none rounded-full ${PONTO[it.tom] || PONTO.neutro}`}
                style={{ width: "clamp(10px, .83vw, 16px)", height: "clamp(10px, .83vw, 16px)" }}
              />

              {it.foto && (
                <img
                  src={it.foto}
                  alt=""
                  className="flex-none rounded-full object-cover"
                  style={{ width: "clamp(32px, 2.9vw, 56px)", height: "clamp(32px, 2.9vw, 56px)" }}
                />
              )}

              <div className="min-w-0 flex-1">
                <div
                  className="truncate font-extrabold text-tinta"
                  style={{ fontSize: "clamp(16px, 1.45vw, 28px)" }}
                >
                  {it.principal}
                </div>
                {it.secundario && (
                  <div
                    className="truncate font-semibold text-texto-fraco"
                    style={{ fontSize: "clamp(12px, 1.1vw, 21px)" }}
                  >
                    {it.secundario}
                  </div>
                )}
              </div>

              {it.etiquetas?.length > 0 && (
                <div className="hidden flex-none items-center gap-2 lg:flex">
                  {it.etiquetas.map((e) => (
                    <span
                      key={e}
                      className="rounded-full font-bold text-texto-fraco"
                      style={{
                        background: "rgb(255 255 255 / .08)",
                        padding: "clamp(3px,.3vw,6px) clamp(8px,.73vw,14px)",
                        fontSize: "clamp(11px, .94vw, 18px)",
                      }}
                    >
                      {e}
                    </span>
                  ))}
                </div>
              )}

              {it.acao && (
                <button
                  type="button"
                  onClick={it.acao.aoClicar}
                  className="press foco-fluxo flex-none rounded-token font-extrabold"
                  style={{
                    background: "rgb(var(--ok))",
                    // texto escuro sobre o verde: o token do fundo, nao um hex
                    color: "rgb(var(--fundo))",
                    padding: "clamp(10px,.94vw,18px) clamp(14px,1.35vw,26px)",
                    fontSize: "clamp(13px, 1.15vw, 22px)",
                    minHeight: 48,
                  }}
                >
                  {it.acao.rotulo}
                </button>
              )}

              {it.direita && (
                <div className="flex-none text-right">
                  <div
                    className="num font-extrabold text-tinta"
                    style={{ fontSize: "clamp(16px, 1.56vw, 30px)" }}
                  >
                    {it.direita}
                  </div>
                  {it.direitaLegenda && (
                    <div
                      className="font-semibold text-texto-fraco"
                      style={{ fontSize: "clamp(11px, .94vw, 18px)" }}
                    >
                      {it.direitaLegenda}
                    </div>
                  )}
                </div>
              )}
            </CartaoVidro>
          ))
        )}
      </div>
    </div>
  );
}
