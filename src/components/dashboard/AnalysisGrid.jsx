import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Card key={i} className="border-slate-200">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const consistenciaData = getConsistenciaAnalysis();
  const mesData = getMesAnalysis();
  const operadorQtdData = getOperadorQuantidadeAnalysis();
  const dificuldadeData = getDificuldadeAnalysis();
  const produtoData = getProdutoAnalysis();
  const embalagemData = getEmbalagemAnalysis();
  const operadorTempoData = getOperadorTempoAnalysis();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Análises de Produção</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Consistência - Média de tempo produtivo */}
        <Card className="border-slate-200">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg font-bold text-slate-900">
              Consistência - Tempo Médio Produtivo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={consistenciaData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="consistencia" stroke="#64748b" />
                <YAxis stroke="#64748b" label={{ value: 'Minutos', angle: -90, position: 'insideLeft' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="media" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Mês - Quantidade envasada */}
        <Card className="border-slate-200">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg font-bold text-slate-900">
              Mês - Quantidade Envasada
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={mesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="quantidade" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Operador - Quantidade envasada */}
        <Card className="border-slate-200">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg font-bold text-slate-900">
              Operador - Quantidade Envasada
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operador</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operadorQtdData.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{item.operador}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {item.quantidade.toLocaleString('pt-BR')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Dificuldade - Quantidade envasada */}
        <Card className="border-slate-200">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg font-bold text-slate-900">
              Dificuldade - Quantidade Envasada
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dificuldadeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="dificuldade" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="quantidade" fill="#f59e0b" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Produto - Quantidade envasada */}
        <Card className="border-slate-200">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg font-bold text-slate-900">
              Top 10 Produtos - Quantidade Envasada
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {produtoData.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{item.produto}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {item.quantidade.toLocaleString('pt-BR')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Embalagem - Quantidade envasada */}
        <Card className="border-slate-200">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg font-bold text-slate-900">
              Top 10 Embalagens - Quantidade Envasada
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Embalagem</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {embalagemData.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{item.embalagem}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {item.quantidade.toLocaleString('pt-BR')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Operador - Média de Tempo por embalagem */}
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg font-bold text-slate-900">
              Operador - Tempo Médio por Embalagem (minutos)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={operadorTempoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="operador" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="media" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}