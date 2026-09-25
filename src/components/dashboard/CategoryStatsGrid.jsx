import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Droplets, Layers, Circle } from "lucide-react";

const CATEGORIAS = [
  { key: "Óleo", label: "Óleo", icon: Droplets, colorBg: "bg-blue-100", colorText: "text-blue-700", colorBar: "bg-blue-500" },
  { key: "Graxa", label: "Graxa", icon: Layers, colorBg: "bg-amber-100", colorText: "text-amber-700", colorBar: "bg-amber-500" },
  { key: "Pasta", label: "Pasta", icon: Circle, colorBg: "bg-green-100", colorText: "text-green-700", colorBar: "bg-green-500" },
];

export default function CategoryStatsGrid({ records, products }) {
  // Montar mapa de código -> categoria
  const productCategoryMap = {};
  products.forEach(p => {
    if (p.codigo && p.categoria) {
      productCategoryMap[p.codigo] = p.categoria;
    }
  });

  // Calcular totais por sala e categoria
  const calcTotais = (sala) => {
    const filtered = sala === "all" ? records : records.filter(r => r.sala === sala);
    const totais = { Óleo: 0, Graxa: 0, Pasta: 0 };
    filtered.forEach(r => {
      const cat = productCategoryMap[r.codigo_produto];
      if (cat && totais[cat] !== undefined) {
        totais[cat] += r.quantidade_produzida || 0;
      }
    });
    return totais;
  };

  const totalBio = calcTotais("Bio");
  const totalIndustrial = calcTotais("Industrial");
  const totalGeral = calcTotais("all");

  const maxTotal = Math.max(...Object.values(totalGeral), 1);

  return (
    <Card className="border-slate-200 shadow-lg">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-lg font-bold text-slate-900">
          Produção por Categoria
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid md:grid-cols-3 gap-6">
          {CATEGORIAS.map(({ key, label, icon: Icon, colorBg, colorText, colorBar }) => {
            const bio = totalBio[key];
            const industrial = totalIndustrial[key];
            const total = bio + industrial;
            const pct = total === 0 ? 0 : Math.round((total / maxTotal) * 100);
            const bioPct = total === 0 ? 0 : Math.round((bio / total) * 100);
            const indPct = total === 0 ? 0 : 100 - bioPct;

            return (
              <div key={key} className={`rounded-xl p-4 ${colorBg} border border-opacity-30`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`p-2 rounded-lg bg-white shadow-sm`}>
                    <Icon className={`w-5 h-5 ${colorText}`} />
                  </div>
                  <span className={`font-bold text-lg ${colorText}`}>{label}</span>
                </div>

                <p className={`text-3xl font-black ${colorText} tabular-nums`}>
                  {total.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-slate-500 mb-3">unidades totais</p>

                {/* Barra de progresso geral */}
                <div className="h-2 bg-white rounded-full mb-3 overflow-hidden">
                  <div className={`h-full ${colorBar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>

                {/* Breakdown Bio/Industrial */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-green-700 font-semibold">🌿 Bio</span>
                    <span className="font-bold text-slate-700">{bio.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-blue-700 font-semibold">🏭 Industrial</span>
                    <span className="font-bold text-slate-700">{industrial.toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}