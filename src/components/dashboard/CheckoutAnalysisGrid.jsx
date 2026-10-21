import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle, Calendar } from "lucide-react";
import { format } from "date-fns";
import { paraData } from "@/lib/datas";
import {
  ChartCard, SectionCard, EmptyState, CORES_GRAFICO, EIXO, GRADE, TOOLTIP, RAIO_BARRA,
} from "@/components/fluxo";

export default function CheckoutAnalysisGrid({ items, programacoes, isLoading }) {
  // Operador - Tempo médio
  const getOperadorTempoMedio = () => {
    const groups = {};
    items.filter(i => i.operador && i.tempo_total).forEach(item => {
      if (!groups[item.operador]) {
        groups[item.operador] = { total: 0, count: 0 };
      }
      const [hours, mins] = item.tempo_total.split(':').map(Number);
      const totalMins = (hours || 0) * 60 + (mins || 0);
      groups[item.operador].total += totalMins;
      groups[item.operador].count += 1;
    });

    return Object.entries(groups).map(([operador, data]) => ({
      operador,
      media: (data.total / data.count).toFixed(1)
    })).sort((a, b) => parseFloat(a.media) - parseFloat(b.media));
  };

  // Pedidos críticos
  const getPedidosCriticos = () => {
    return items
      .filter(i => i.critico)
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 10);
  };

  // Pedidos atrasados
  const getPedidosAtrasados = () => {
    return items
      .filter(i => i.finalizado_fora_do_prazo)
      .sort((a, b) => (paraData(b.data_finalizacao_real) || 0) - (paraData(a.data_finalizacao_real) || 0))
      .slice(0, 10);
  };

  // Operador - Quantidade de pedidos
  const getOperadorQuantidade = () => {
    const groups = {};
    items.filter(i => i.operador).forEach(item => {
      if (!groups[item.operador]) groups[item.operador] = 0;
      groups[item.operador] += 1;
    });

    return Object.entries(groups).map(([operador, quantidade]) => ({
      operador,
      quantidade
    })).sort((a, b) => b.quantidade - a.quantidade);
  };

  if (isLoading) {
    return (
      <div className="cartao-fluxo">
        <EmptyState carregando />
      </div>
    );
  }

  const operadorTempo = getOperadorTempoAnalysis();
  const operadorQuantidade = getOperadorQuantidadeAnalysis();
  const pedidosCriticos = getPedidosCriticos();
  const pedidosAtrasados = getPedidosAtrasados();

  const cores = CORES_GRAFICO();
  const eixo = EIXO();
  const grade = GRADE();
  const tooltip = TOOLTIP();

  const Barras = ({ dados, chave, cor, unidade }) => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dados} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid {...grade} />
        <XAxis dataKey="operador" {...eixo} />
        <YAxis {...eixo} />
        <Tooltip {...tooltip} formatter={(v) => [`${v.toLocaleString("pt-BR")}${unidade || ""}`, ""]} />
        <Bar dataKey={chave} fill={cor} radius={RAIO_BARRA} />
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        titulo="Tempo por operador"
        legenda="Média em minutos por pedido"
        vazio={operadorTempo.length === 0}
        atraso={0.05}
      >
        <Barras dados={operadorTempo} chave="media" cor={cores[0]} unidade=" min" />
      </ChartCard>

      <ChartCard
        titulo="Pedidos por operador"
        legenda="Quantidade concluída"
        vazio={operadorQuantidade.length === 0}
        atraso={0.1}
      >
        <Barras dados={operadorQuantidade} chave="quantidade" cor={cores[1]} />
      </ChartCard>

      <SectionCard
        titulo="Pedidos críticos"
        legenda={`${pedidosCriticos.length} em aberto`}
        icone={AlertTriangle}
        atraso={0.15}
      >
        {pedidosCriticos.length === 0 ? (
          <EmptyState titulo="Nenhum pedido crítico" legenda="Nada exigindo atenção agora." />
        ) : (
          // A rolagem ficava num `div` de altura fixa sem indicação nenhuma de
          // que havia mais coisa embaixo. A contagem no cabeçalho agora diz
          // quantos existem, mesmo que só três caibam na tela.
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {pedidosCriticos.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-token bg-atencao-suave px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-extrabold text-tinta">{item.numero_pedido}</p>
                  <p className="truncate text-sm font-semibold text-texto-fraco">{item.cliente}</p>
                </div>
                {item.data_saida && (
                  <span className="num flex-none rounded-full bg-cartao px-3 py-1 text-xs font-bold text-texto-fraco">
                    saída {format(paraData(item.data_saida), "dd/MM")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        titulo="Finalizados com atraso"
        legenda={`${pedidosAtrasados.length} fora do prazo`}
        icone={Calendar}
        atraso={0.2}
      >
        {pedidosAtrasados.length === 0 ? (
          <EmptyState titulo="Nenhum pedido com atraso" legenda="Tudo entregue dentro do prazo." />
        ) : (
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {pedidosAtrasados.map((item) => {
              const programacao = programacoes.find((p) => p.id === item.programacao_id);
              return (
                <li key={item.id} className="rounded-token bg-erro-suave px-4 py-3">
                  <p className="truncate font-extrabold text-tinta">{item.numero_pedido}</p>
                  <p className="truncate text-sm font-semibold text-texto-fraco">{item.cliente}</p>
                  <dl className="mt-1.5 flex flex-wrap gap-x-4 text-xs font-semibold text-texto-fraco">
                    {programacao && (
                      <div className="flex gap-1">
                        <dt>Programado:</dt>
                        <dd className="num">{format(paraData(programacao.data_programada), "dd/MM/yyyy")}</dd>
                      </div>
                    )}
                    {item.data_finalizacao_real && (
                      <div className="flex gap-1">
                        <dt>Finalizado:</dt>
                        <dd className="num">{format(paraData(item.data_finalizacao_real), "dd/MM/yyyy")}</dd>
                      </div>
                    )}
                  </dl>
                  {item.motivo_atraso && (
                    <p className="mt-1 text-xs font-bold text-erro">Motivo: {item.motivo_atraso}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
