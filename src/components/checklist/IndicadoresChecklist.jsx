import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { ClipboardCheck } from "lucide-react";

const CAMPOS_LABELS = {
  pedido_disponivel_etapa5: "Pedido Etapa 5",
  entrega_conforme_prevista: "Entrega conforme",
  quantidade_conforme_nf: "Qtd conforme NF",
  amostragem_inspecionada: "Amostragem (10%)",
  condicoes_gerais_conformes: "Cond. gerais",
  spray_conforme_feps: "Spray/FEPS",
  acompanha_certificado_analise: "Cert. análise",
  acompanha_ficha_emergencia: "Ficha emergência",
  acompanha_fispq: "FISPQ",
};

const CAMPOS = Object.keys(CAMPOS_LABELS);
const PIE_COLORS = ["#22c55e", "#eab308", "#ef4444"];

export default function IndicadoresChecklist({ checklists }) {
  if (!checklists || checklists.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p>Nenhum checklist no período</p>
      </div>
    );
  }

  const total = checklists.length;
  const notaMedia = Math.round(checklists.reduce((s, c) => s + (c.nota_final ?? 0), 0) / total);
  const aprovados = checklists.filter(c => (c.nota_final ?? 0) >= 80).length;
  const atencao = checklists.filter(c => (c.nota_final ?? 0) >= 0 && (c.nota_final ?? 0) < 80).length;
  const reprovados = checklists.filter(c => (c.nota_final ?? 0) < 0).length;

  const pieData = [
    { name: "Aprovado", value: aprovados },
    { name: "Atenção", value: atencao },
    { name: "Reprovado", value: reprovados },
  ].filter(d => d.value > 0);

  // Evolução por dia
  const porDia = Object.entries(
    checklists.reduce((acc, c) => {
      const d = c.data_entrega || "";
      if (!d) return acc;
      if (!acc[d]) acc[d] = { soma: 0, count: 0 };
      acc[d].soma += c.nota_final ?? 0;
      acc[d].count++;
      return acc;
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({
    dia: date.slice(5),
    media: Math.round(v.soma / v.count),
  }));

  // Por fornecedor
  const porFornecedor = Object.entries(
    checklists.reduce((acc, c) => {
      const f = c.nome_fornecedor || "Desconhecido";
      if (!acc[f]) acc[f] = { soma: 0, count: 0, reprovados: 0 };
      acc[f].soma += c.nota_final ?? 0;
      acc[f].count++;
      if ((c.nota_final ?? 0) < 0) acc[f].reprovados++;
      return acc;
    }, {})
  ).map(([nome, v]) => ({ nome: nome.length > 20 ? nome.slice(0, 20) + "…" : nome, media: Math.round(v.soma / v.count), count: v.count, reprovados: v.reprovados }))
    .sort((a, b) => b.media - a.media).slice(0, 10);

  // Por campo
  const porCampo = CAMPOS.map(key => {
    let sim = 0, nao = 0, na = 0;
    checklists.forEach(c => {
      const v = c[key];
      if (v === "Sim") sim++;
      else if (v === "Não") nao++;
      else if (v === "N/A") na++;
    });
    const total2 = sim + nao + na;
    return {
      label: CAMPOS_LABELS[key],
      sim: total2 > 0 ? Math.round((sim / total2) * 100) : 0,
      nao: total2 > 0 ? Math.round((nao / total2) * 100) : 0,
      na: total2 > 0 ? Math.round((na / total2) * 100) : 0,
      naoCount: nao,
    };
  }).sort((a, b) => b.naoCount - a.naoCount);

  // Por inspetor
  const porInspetor = Object.entries(
    checklists.reduce((acc, c) => {
      (c.inspecionado_por || []).forEach(nome => {
        if (!acc[nome]) acc[nome] = { soma: 0, count: 0 };
        acc[nome].soma += c.nota_final ?? 0;
        acc[nome].count++;
      });
      return acc;
    }, {})
  ).map(([nome, v]) => ({ nome, count: v.count, media: Math.round(v.soma / v.count) }))
    .sort((a, b) => b.count - a.count).slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Bloco 1 — Visão geral */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-blue-600" />Visão Geral</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total checklists", value: total, cls: "text-slate-700" },
              { label: "Nota média", value: notaMedia, cls: notaMedia >= 80 ? "text-green-700" : notaMedia >= 0 ? "text-yellow-700" : "text-red-700" },
              { label: "Aprovados (≥80)", value: aprovados, cls: "text-green-700" },
              { label: "Reprovados (<0)", value: reprovados, cls: "text-red-700" },
            ].map(k => (
              <div key={k.label} className="text-center bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">{k.label}</p>
                <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Distribuição por resultado</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Evolução da nota média por dia</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={porDia}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="media" stroke="#2563eb" strokeWidth={2} dot={false} name="Nota média" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bloco 2 — Por fornecedor */}
      <Card>
        <CardHeader><CardTitle className="text-base">📦 Por Fornecedor</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Nota média por fornecedor (top 10)</p>
            <ResponsiveContainer width="100%" height={Math.max(160, porFornecedor.length * 32)}>
              <BarChart data={porFornecedor} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                <YAxis dataKey="nome" type="category" tick={{ fontSize: 10 }} width={140} />
                <Tooltip formatter={(v) => [`${v}`, "Nota média"]} />
                <Bar dataKey="media" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Fornecedores com mais checklists reprovados</p>
            <div className="space-y-1">
              {porFornecedor.filter(f => f.reprovados > 0).sort((a, b) => b.reprovados - a.reprovados).map(f => (
                <div key={f.nome} className="flex justify-between items-center text-sm px-3 py-1.5 bg-red-50 border border-red-100 rounded">
                  <span className="text-slate-700">{f.nome}</span>
                  <span className="text-red-700 font-bold">{f.reprovados} reprovados</span>
                </div>
              ))}
              {porFornecedor.filter(f => f.reprovados > 0).length === 0 && <p className="text-xs text-slate-400">Nenhum reprovado no período</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bloco 3 — Por campo */}
      <Card>
        <CardHeader><CardTitle className="text-base">🔍 Por Campo de Checklist</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 mb-3">Ordenado pelos campos com maior % de "Não" (pontos críticos)</p>
          <div className="space-y-2">
            {porCampo.map(c => (
              <div key={c.label}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-slate-700 font-medium">{c.label}</span>
                  <span className="text-slate-500">
                    <span className="text-green-700 font-bold">{c.sim}%</span> Sim ·
                    <span className="text-red-700 font-bold ml-1">{c.nao}%</span> Não ·
                    <span className="text-slate-400 ml-1">{c.na}%</span> N/A
                  </span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
                  <div className="bg-green-500" style={{ width: `${c.sim}%` }} />
                  <div className="bg-red-500" style={{ width: `${c.nao}%` }} />
                  <div className="bg-slate-300" style={{ width: `${c.na}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bloco 4 — Por inspetor */}
      <Card>
        <CardHeader><CardTitle className="text-base">👤 Por Inspetor</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Inspetor</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500">Checklists</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500">Nota média</th>
                </tr>
              </thead>
              <tbody>
                {porInspetor.map(i => (
                  <tr key={i.nome} className="border-t border-slate-100">
                    <td className="px-3 py-2">{i.nome}</td>
                    <td className="px-3 py-2 text-center font-bold">{i.count}</td>
                    <td className={`px-3 py-2 text-center font-bold ${i.media >= 80 ? "text-green-700" : i.media >= 0 ? "text-yellow-700" : "text-red-700"}`}>
                      {i.media}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Tabela resumo */}
      <Card>
        <CardHeader><CardTitle className="text-base">📋 Tabela Resumo</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Cód. Fornecedor</th>
                <th className="px-3 py-2 text-left">Nome Fornecedor</th>
                <th className="px-3 py-2 text-left">Inspetor</th>
                <th className="px-3 py-2 text-left">Data Entrega</th>
                <th className="px-3 py-2 text-left">Material</th>
                <th className="px-3 py-2 text-center">Nota</th>
              </tr>
            </thead>
            <tbody>
              {checklists.map(c => (
                <tr key={c.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2">{c.codigo_fornecedor || "—"}</td>
                  <td className="px-3 py-2 max-w-[150px] truncate">{c.nome_fornecedor}</td>
                  <td className="px-3 py-2">{(c.inspecionado_por || []).join(", ")}</td>
                  <td className="px-3 py-2">{c.data_entrega || "—"}</td>
                  <td className="px-3 py-2">{c.material_recebimento}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`font-bold ${(c.nota_final ?? 0) >= 80 ? "text-green-700" : (c.nota_final ?? 0) >= 0 ? "text-yellow-700" : "text-red-700"}`}>
                      {c.nota_final ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}