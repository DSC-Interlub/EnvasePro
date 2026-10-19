import React, { useState } from "react";
import CartaoVidro from "./CartaoVidro";
import { u } from "./unidade";

/**
 * Uma operação em andamento: QUEM está fazendo O QUE, onde e há quanto tempo.
 *
 * É a informação que a fábrica realmente lê na TV. Na reconstrução do módulo 1
 * ela tinha virado uma faixa espremida embaixo dos números, com uma linha de
 * texto por operação — e perdeu campos no caminho. Este cartão devolve o que a
 * TV antiga mostrava em cada linha (ver o inventário no PR):
 *
 *  - FOTO e NOME do operador, grande — era o maior texto da linha antiga;
 *  - O QUE está fazendo (envasando, em check-out, movimentando), e com quem;
 *  - o produto, ou o pedido e o cliente;
 *  - OP, sala, rua/torre, depósito, quantidade — o que cada módulo tinha;
 *  - certificações do produto COM o logo, como a TV antiga;
 *  - TEMPO DECORRIDO e "desde HH:MM" — tinha sumido na reconstrução;
 *  - o alerta (crítico, entrega atrasada, pronto para retirar).
 *
 * Os tamanhos são em `u` (ver `unidade.js`), dimensionados para caber quatro
 * cartões por página em 1080p sem cortar nada; `escala` aumenta tudo quando há
 * só um cartão na página.
 */
const COR_TOM = {
  erro: "rgb(var(--erro))",
  atencao: "rgb(var(--atencao))",
  ok: "rgb(var(--ok))",
  neutro: "rgb(var(--texto-fraco))",
};
const FUNDO_TOM = {
  erro: "rgb(var(--erro) / .2)",
  atencao: "rgb(var(--atencao) / .2)",
  ok: "rgb(var(--ok) / .2)",
  neutro: "rgb(255 255 255 / .08)",
};

function Foto({ src, nome, lado }) {
  const [falhou, setFalhou] = useState(false);
  const inicial = (nome || "?").trim().charAt(0).toUpperCase();
  const base = { width: lado, height: lado, borderRadius: "999px" };

  // A foto vem de URL assinada que expira em 24h e a TV fica dias aberta: sem
  // o recuo para a inicial, a falha deixava um buraco redondo no cartão.
  if (src && !falhou) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFalhou(true)}
        className="flex-none object-cover"
        style={{ ...base, border: "2px solid rgb(var(--marca) / .6)" }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center font-extrabold text-marca"
      style={{ ...base, background: "rgb(var(--marca) / .18)", fontSize: `calc(${lado} * .42)` }}
    >
      {inicial}
    </span>
  );
}

/** Corpo do texto principal pelo comprimento: nome de produto chega a 120
 *  caracteres, e cortar com reticências esconderia justamente a parte que
 *  distingue um produto do outro. */
function corpoPrincipal(texto, escala) {
  const n = String(texto || "").length;
  const k = n <= 60 ? 1.1 : n <= 95 ? 0.98 : 0.88;
  return u(k * escala);
}

export default function CartaoOperacao({
  tom = "neutro", foto, operador, verbo, principal, detalhe,
  etiquetas = [], certificacoes = [], tempo, desde, alerta, acao,
  escala = 1, atraso = 0,
}) {
  const s = escala;
  return (
    <CartaoVidro
      data-tv-bloco=""
      tom={tom === "erro" ? "erro" : tom === "atencao" ? "atencao" : "neutro"}
      atraso={atraso}
      raio={1.6}
      className="flex-col"
      style={{ padding: u(1.15 * s), gap: u(0.45 * s) }}
    >
      {/* QUEM, O QUE, HÁ QUANTO TEMPO */}
      <div className="flex min-w-0 flex-none items-start" style={{ gap: u(0.9 * s) }}>
        <Foto src={foto} nome={operador} lado={u(4 * s)} />

        <div className="min-w-0 flex-1" style={{ overflowWrap: "anywhere" }}>
          <div className="font-extrabold leading-[1.1] text-tinta" style={{ fontSize: u(1.55 * s) }}>
            {operador || "Sem operador"}
          </div>
          {verbo && (
            <div className="font-bold leading-[1.2] text-texto-fraco" style={{ fontSize: u(1 * s) }}>
              {verbo}
            </div>
          )}
        </div>

        {tempo && (
          <div className="flex-none text-right">
            <div
              className="num font-extrabold leading-none"
              style={{ fontSize: u(2.2 * s), color: tom === "erro" ? COR_TOM.erro : "rgb(var(--marca))" }}
            >
              {tempo}
            </div>
            {desde && (
              <div className="font-semibold leading-[1.3] text-texto-fraco" style={{ fontSize: u(0.85 * s) }}>
                desde {desde}
              </div>
            )}
          </div>
        )}
      </div>

      {/* O QUÊ: produto, ou pedido e cliente */}
      {principal && (
        <div
          className="flex-none font-bold leading-[1.18] text-tinta"
          style={{ fontSize: corpoPrincipal(principal, s), overflowWrap: "anywhere" }}
        >
          {principal}
        </div>
      )}

      {detalhe && (
        <div
          className="flex-none font-semibold leading-[1.2] text-tinta-media"
          style={{ fontSize: u(0.95 * s), overflowWrap: "anywhere" }}
        >
          {detalhe}
        </div>
      )}

      {/* OP, sala, certificações, alerta, ação */}
      {(etiquetas.length > 0 || certificacoes.length > 0 || alerta || acao) && (
        <div
          className="mt-auto flex min-w-0 flex-none flex-wrap items-center"
          style={{ gap: u(0.45 * s) }}
        >
          {etiquetas.map((e) => (
            <span
              key={e.texto}
              className="num rounded-full font-extrabold leading-[1.15]"
              style={{
                background: e.tom === "ok" ? "rgb(var(--ok) / .18)" : "rgb(255 255 255 / .08)",
                color: e.tom === "ok" ? COR_TOM.ok : "rgb(var(--tinta-media))",
                padding: `${u(0.25 * s)} ${u(0.7 * s)}`,
                fontSize: u(0.85 * s),
              }}
            >
              {e.texto}
            </span>
          ))}

          {certificacoes.map((c) => (
            <span
              key={c.nome}
              className="inline-flex items-center rounded-full bg-white font-extrabold leading-none text-[rgb(var(--fundo))]"
              style={{ gap: u(0.3 * s), padding: `${u(0.15 * s)} ${u(0.6 * s)} ${u(0.15 * s)} ${u(0.2 * s)}`, fontSize: u(0.8 * s) }}
            >
              {c.logo && (
                <img src={c.logo} alt="" className="object-contain" style={{ width: u(1.35 * s), height: u(1.35 * s) }} />
              )}
              {c.nome}
            </span>
          ))}

          {alerta && (
            <span
              className="rounded-full font-extrabold leading-[1.15]"
              style={{
                background: FUNDO_TOM[alerta.tom] || FUNDO_TOM.atencao,
                color: COR_TOM[alerta.tom] || COR_TOM.atencao,
                padding: `${u(0.25 * s)} ${u(0.7 * s)}`,
                fontSize: u(0.85 * s),
              }}
            >
              {alerta.texto}
            </span>
          )}

          {acao && (
            <button
              type="button"
              onClick={acao.aoClicar}
              className="press foco-fluxo ml-auto rounded-full font-extrabold leading-[1.1]"
              style={{
                background: "rgb(var(--ok))",
                color: "rgb(var(--fundo))",
                padding: `${u(0.45 * s)} ${u(1 * s)}`,
                fontSize: u(0.9 * s),
              }}
            >
              {acao.rotulo}
            </button>
          )}
        </div>
      )}
    </CartaoVidro>
  );
}
