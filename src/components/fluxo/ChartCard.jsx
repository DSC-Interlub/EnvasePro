import React from "react";
import SectionCard from "./SectionCard";
import EmptyState from "./EmptyState";
import { BarChart3 } from "lucide-react";

/**
 * Moldura de gráfico, e a paleta que todos os gráficos usam.
 *
 * POR QUE A PALETA VEM DAQUI
 *
 * Os gráficos do sistema usavam cores escritas à mão (`#64748b` no eixo,
 * `#3b82f6` nas barras), que não mudam com o token e ficam erradas no tema
 * escuro da TV. `CORES_GRAFICO` lê as variáveis CSS em tempo de render, então
 * o gráfico acompanha o tema.
 *
 * `EIXO` e `GRADE` também: a grade do padrão do Recharts é uma malha cinza
 * que compete com os dados. Aqui só a linha horizontal fica, e fraca.
 */

/** Lê um token CSS. Chamado no render: no tema escuro devolve o valor escuro. */
function token(nome, alfa) {
  if (typeof window === "undefined") return "#000";
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  if (!v) return "#000";
  return alfa == null ? `rgb(${v})` : `rgb(${v} / ${alfa})`;
}

/** A sequência para séries múltiplas. Marca primeiro, estados depois. */
export const CORES_GRAFICO = () => [
  token("--marca"), token("--ok"), token("--atencao"),
  token("--erro"), token("--marca-forte"), token("--texto-fraco"),
];

export const EIXO = () => ({
  stroke: token("--texto-apagado"),
  fontSize: 13,
  fontWeight: 700,
  tickLine: false,
  axisLine: false,
});

export const GRADE = () => ({
  stroke: token("--borda"),
  strokeDasharray: "0",
  vertical: false,
});

/** Tooltip: cartão da direção, não a caixa branca com borda do padrão. */
export const TOOLTIP = () => ({
  contentStyle: {
    background: token("--cartao"),
    border: "none",
    borderRadius: "var(--raio)",
    boxShadow: "var(--sombra-cartao-alta)",
    padding: "10px 14px",
    fontWeight: 700,
    fontSize: 13,
    color: token("--tinta"),
  },
  labelStyle: { color: token("--texto-fraco"), fontWeight: 700, marginBottom: 4 },
  cursor: { fill: token("--marca", 0.06) },
});

/** Barras com o topo arredondado, como no protótipo. */
export const RAIO_BARRA = [10, 10, 4, 4];

export default function ChartCard({
  titulo, legenda, acoes, altura = 260, vazio = false, carregando = false,
  textoVazio = "Sem dados no período", children, atraso = 0, className = "",
}) {
  return (
    <SectionCard titulo={titulo} legenda={legenda} acoes={acoes} atraso={atraso} className={className}>
      {carregando || vazio ? (
        <EmptyState
          carregando={carregando}
          icone={BarChart3}
          titulo={textoVazio}
          legenda={carregando ? undefined : "Ajuste o filtro de período ou aguarde novos lançamentos."}
        />
      ) : (
        <div style={{ height: altura }} className="min-w-0">{children}</div>
      )}
    </SectionCard>
  );
}
