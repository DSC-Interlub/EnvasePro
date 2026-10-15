import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  ChartCard, SectionCard, EmptyState, CORES_GRAFICO, EIXO, GRADE, TOOLTIP, RAIO_BARRA,
} from "@/components/fluxo";

export default function AnalysisGrid({ records, isLoading }) {
  // Consistência - Média de tempo produtivo
  const getConsistenciaAnalysis = () => {
    const groups = {};
    records.forEach(r => {
      if (!r.consistencia || !r.tempo_produtivo) return;
      if (!groups[r.consistencia]) {
        groups[r.consistencia] = { total: 0, count: 0 };
      }
      const [hours, mins] = r.tempo_produtivo.split(':').map(Number);
      const totalMins = (hours * 60) + mins;
      groups[r.consistencia].total += totalMins;
      groups[r.consistencia].count += 1;
    });

    return Object.entries(groups).map(([consistencia, data]) => ({
      consistencia,
      media: (data.total / data.count).toFixed(1)
    })).sort((a, b) => b.media - a.media);
  };

  // Mês - Quantidade envasada
  const getMesAnalysis = () => {
    const groups = {};
    records.forEach(r => {
      if (!r.mes) return;
      const mesNome = new Date(2025, r.mes - 1).toLocaleDateString('pt-BR', { month: 'long' });
      if (!groups[mesNome]) groups[mesNome] = 0;
      groups[mesNome] += r.quantidade_produzida || 0;
    });

    return Object.entries(groups).map(([mes, quantidade]) => ({
      mes,
      quantidade
    })).sort((a, b) => b.quantidade - a.quantidade);
  };

  // Operador - Quantidade envasada
  const getOperadorQuantidadeAnalysis = () => {
    const groups = {};
    records.forEach(r => {
      if (!r.operador) return;
      if (!groups[r.operador]) groups[r.operador] = 0;
      groups[r.operador] += r.quantidade_produzida || 0;
    });

    return Object.entries(groups).map(([operador, quantidade]) => ({
      operador,
      quantidade
    })).sort((a, b) => b.quantidade - a.quantidade);
  };

  // Dificuldade - Quantidade envasada
  const getDificuldadeAnalysis = () => {
    const dificuldadeNomes = {
      0: "Normal",
      1: "Rotulagem",
      2: "Final Tambor",
      3: "Mescla de Produto"
    };
    
    const groups = {};
    records.forEach(r => {
      const nome = dificuldadeNomes[r.dificuldade_codigo] || "Não especificado";
      if (!groups[nome]) groups[nome] = 0;
      groups[nome] += r.quantidade_produzida || 0;
    });

    return Object.entries(groups).map(([dificuldade, quantidade]) => ({
      dificuldade,
      quantidade
    })).sort((a, b) => b.quantidade - a.quantidade);
  };

  // Produto - Quantidade envasada
  const getProdutoAnalysis = () => {
    const groups = {};
    records.forEach(r => {
      if (!r.descricao_produto) return;
      if (!groups[r.descricao_produto]) groups[r.descricao_produto] = 0;
      groups[r.descricao_produto] += r.quantidade_produzida || 0;
    });

    return Object.entries(groups).map(([produto, quantidade]) => ({
      produto,
      quantidade
    })).sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);
  };

  // Embalagem - Quantidade envasada
  const getEmbalagemAnalysis = () => {
    const groups = {};
    records.forEach(r => {
      if (!r.descricao_embalagem) return;
      if (!groups[r.descricao_embalagem]) groups[r.descricao_embalagem] = 0;
      groups[r.descricao_embalagem] += r.quantidade_produzida || 0;
    });

    return Object.entries(groups).map(([embalagem, quantidade]) => ({
      embalagem,
      quantidade
    })).sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);
  };

  // Operador - Média de Tempo por embalagem
  const getOperadorTempoAnalysis = () => {
    const groups = {};
    records.forEach(r => {
      if (!r.operador || !r.tempo_por_embalagem) return;
      if (!groups[r.operador]) {
        groups[r.operador] = { total: 0, count: 0 };
      }
      const tempoNum = parseFloat(r.tempo_por_embalagem);
      if (!isNaN(tempoNum)) {
        groups[r.operador].total += tempoNum;
        groups[r.operador].count += 1;
      }
    });

    return Object.entries(groups).map(([operador, data]) => ({
      operador,
      media: (data.total / data.count).toFixed(2)
    })).sort((a, b) => parseFloat(a.media) - parseFloat(b.media));
  };
  if (isLoading) {
    return (
      <div className="cartao-fluxo">
        <EmptyState carregando />
      </div>
    );
  }

  const consistenciaData = getConsistenciaAnalysis();
  const mesData = getMesAnalysis();
  const operadorQtdData = getOperadorQuantidadeAnalysis();
  const dificuldadeData = getDificuldadeAnalysis();
  const embalagemData = getEmbalagemAnalysis();
  const operadorTempoData = getOperadorTempoAnalysis();

  const cores = CORES_GRAFICO();
  const eixo = EIXO();
  const grade = GRADE();
  const tooltip = TOOLTIP();

  /** As barras, que eram seis cópias do mesmo bloco com uma cor diferente. */
  const Barras = ({ dados, eixoX, chave, cor, unidade }) => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dados} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid {...grade} />
        <XAxis dataKey={eixoX} {...eixo} />
        <YAxis {...eixo} />
        <Tooltip {...tooltip} formatter={(v) => [`${v.toLocaleString("pt-BR")}${unidade || ""}`, ""]} />
        <Bar dataKey={chave} fill={cor} radius={RAIO_BARRA} />
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          titulo="Consistência"
          legenda="Tempo médio produtivo, em minutos"
          vazio={consistenciaData.length === 0}
          atraso={0.05}
        >
          <Barras dados={consistenciaData} eixoX="consistencia" chave="media" cor={cores[0]} unidade=" min" />
        </ChartCard>

        <ChartCard
          titulo="Mês a mês"
          legenda="Quantidade envasada"
          vazio={mesData.length === 0}
          atraso={0.1}
        >
          <Barras dados={mesData} eixoX="mes" chave="quantidade" cor={cores[1]} />
        </ChartCard>

        <Ranking
          titulo="Por operador"
          legenda="Quantidade envasada"
          coluna="Operador"
          itens={operadorQtdData.map((i) => ({ nome: i.operador, valor: i.quantidade }))}
          atraso={0.15}
        />

        <ChartCard
          titulo="Por dificuldade"
          legenda="Quantidade envasada"
          vazio={dificuldadeData.length === 0}
          atraso={0.2}
        >
          <Barras dados={dificuldadeData} eixoX="dificuldade" chave="quantidade" cor={cores[2]} />
        </ChartCard>

        <Ranking
          titulo="Por embalagem"
          legenda="Quantidade envasada"
          coluna="Embalagem"
          itens={embalagemData.map((i) => ({ nome: i.embalagem, valor: i.quantidade }))}
          atraso={0.25}
        />

        <ChartCard
          titulo="Tempo por embalagem"
          legenda="Média em minutos, por operador"
          vazio={operadorTempoData.length === 0}
          atraso={0.3}
          className="lg:col-span-2"
        >
          <Barras dados={operadorTempoData} eixoX="operador" chave="media" cor={cores[4]} unidade=" min" />
        </ChartCard>
      </div>
    </div>
  );
}

/**
 * Tabela de ranking — era o mesmo bloco escrito duas vezes (operador e
 * embalagem), com `<Table>` cru dentro de um `<Card>`.
 *
 * Ganhou a barra de proporção: uma coluna de números ordenada já diz a ordem,
 * mas não a DISTÂNCIA entre o primeiro e o segundo, que é o que interessa
 * quando se compara operador com operador.
 */
function Ranking({ titulo, legenda, coluna, itens, atraso }) {
  const maior = Math.max(...itens.map((i) => i.valor), 1);

  return (
    <SectionCard titulo={titulo} legenda={legenda} atraso={atraso} semPadding>
      {itens.length === 0 ? (
        <EmptyState titulo="Sem dados no período" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-cartao-fraco">
              <TableHead>{coluna}</TableHead>
              <TableHead className="text-right">Quantidade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((item) => (
              <TableRow key={item.nome}>
                <TableCell>
                  <span className="block font-semibold text-tinta">{item.nome}</span>
                  <span
                    aria-hidden="true"
                    className="mt-1.5 block h-1.5 max-w-[220px] overflow-hidden rounded-full bg-fundo"
                  >
                    <span
                      className="block h-full rounded-full bg-marca"
                      style={{ width: `${Math.round((item.valor / maior) * 100)}%` }}
                    />
                  </span>
                </TableCell>
                <TableCell className="num text-right font-bold">
                  {item.valor.toLocaleString("pt-BR")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}
