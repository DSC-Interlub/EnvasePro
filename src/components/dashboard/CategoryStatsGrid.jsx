import React from "react";
import { Droplets, Layers, Circle, Boxes } from "lucide-react";
import { SectionCard } from "@/components/fluxo";

/**
 * Produção por categoria — Óleo, Graxa e Pasta, com a divisão Bio/Industrial.
 *
 * O que saiu: três paletas escritas à mão (`amber-100/amber-700/amber-500`,
 * `green-100/green-700/green-500`, mais a da marca), os emojis 🌿 e 🏭 como
 * rótulo, e `border border-opacity-30` — uma borda com opacidade mas sem cor,
 * que não desenhava nada.
 *
 * O que ficou: as mesmas três categorias, as mesmas contas, e a barra de
 * proporção. A diferença entre as categorias passou a ser o ÍCONE e o nome; a
 * cor agora é informação (Bio x Industrial), não decoração.
 *
 * A barra dupla mostra, dentro de cada categoria, quanto veio de cada sala —
 * antes isso eram dois números soltos embaixo e ninguém comparava.
 */

const CATEGORIAS = [
  { chave: "Óleo", rotulo: "Óleo", icone: Droplets },
  { chave: "Graxa", rotulo: "Graxa", icone: Layers },
  { chave: "Pasta", rotulo: "Pasta", icone: Circle },
];

export default function CategoryStatsGrid({ records, products }) {
  const categoriaDoProduto = {};
  for (const p of products) {
    if (p.codigo && p.categoria) categoriaDoProduto[p.codigo] = p.categoria;
  }

  const calcTotais = (sala) => {
    const filtrados = sala === "all" ? records : records.filter((r) => r.sala === sala);
    const totais = { "Óleo": 0, Graxa: 0, Pasta: 0 };
    for (const r of filtrados) {
      const cat = categoriaDoProduto[r.codigo_produto];
      if (cat && totais[cat] !== undefined) totais[cat] += r.quantidade_produzida || 0;
    }
    return totais;
  };

  const totalBio = calcTotais("Bio");
  const totalIndustrial = calcTotais("Industrial");
  const totalGeral = calcTotais("all");
  const maxTotal = Math.max(...Object.values(totalGeral), 1);

  return (
    <SectionCard titulo="Produção por categoria" icone={Boxes} atraso={0.1}>
      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        {CATEGORIAS.map(({ chave, rotulo, icone: Icone }) => {
          const bio = totalBio[chave];
          const industrial = totalIndustrial[chave];
          const total = bio + industrial;
          const pct = total === 0 ? 0 : Math.round((total / maxTotal) * 100);
          const pctBio = total === 0 ? 0 : (bio / total) * 100;

          return (
            <div key={chave} className="min-w-0 rounded-painel bg-fundo p-5">
              <div className="mb-3 flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-token
                             bg-cartao text-marca shadow-cartao"
                >
                  <Icone className="h-[18px] w-[18px]" />
                </span>
                <span className="text-base font-extrabold text-tinta">{rotulo}</span>
              </div>

              <p className="num text-[38px] font-extrabold leading-none text-tinta">
                {total.toLocaleString("pt-BR")}
              </p>
              <p className="mb-3 mt-1 text-xs font-semibold text-texto-fraco">unidades totais</p>

              {/* Proporção desta categoria em relação à maior */}
              <div
                className="mb-3 h-2 overflow-hidden rounded-full bg-cartao"
                role="img"
                aria-label={`${pct}% do volume da maior categoria`}
              >
                <div className="h-full rounded-full bg-marca transition-all" style={{ width: `${pct}%` }} />
              </div>

              {/* Bio x Industrial DENTRO da categoria: antes eram dois números
                  soltos embaixo, e ninguém comparava um com o outro. */}
              {total > 0 && (
                <div className="flex h-2 overflow-hidden rounded-full bg-cartao" aria-hidden="true">
                  <div className="h-full bg-ok" style={{ width: `${pctBio}%` }} />
                  <div className="h-full flex-1 bg-marca" />
                </div>
              )}

              <dl className="mt-2.5 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <dt className="flex items-center gap-1.5 font-bold text-ok">
                    <span className="h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
                    Bio
                  </dt>
                  <dd className="num font-extrabold text-tinta">{bio.toLocaleString("pt-BR")}</dd>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <dt className="flex items-center gap-1.5 font-bold text-marca">
                    <span className="h-2 w-2 rounded-full bg-marca" aria-hidden="true" />
                    Industrial
                  </dt>
                  <dd className="num font-extrabold text-tinta">{industrial.toLocaleString("pt-BR")}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
