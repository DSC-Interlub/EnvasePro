import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { BarChart2, Clock, User, OctagonX, AlertTriangle, TrendingUp } from "lucide-react";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  SectionCard, EmptyState, MiniKPI,
  CORES_GRAFICO, EIXO, GRADE, TOOLTIP, LEGENDA, RAIO_BARRA,
} from "@/components/fluxo";

/**
 * Os cinco blocos de indicadores da empilhadeira: producao, operadores,
 * paradas, ocorrencias e OEE.
 *
 * POR QUE VIROU COMPONENTE
 *
 * Estes mesmos cinco blocos existiam DUAS VEZES, com as mesmas contas e o
 * mesmo desenho: na página "IndicadoresEmpilha" e na aba "Indicadores" da
 * página "Empilhadeira". Eram cerca de 210 linhas copiadas, e as duas cópias
 * já divergiam numa variável. Dois lugares para corrigir, e a certeza de que
 * um dia só um deles seria corrigido.
 *
 * As contas vem para DENTRO do componente de proposito: quem chama passa os
 * dados crus ja filtrados pelo periodo, e nao dezoito valores calculados.
 */
function minsFromHHMM(str) {
  if (!str) return 0;
  // Formato "X:MM" ou "X min"
  if (str.includes("min")) return parseInt(str) || 0;
  const [h, m] = str.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export default function BlocosIndicadores({
  // Filtradas pelo periodo, para os totais.
  linhasFiltradas = [],
  paradasFiltradas = [],
  ocorrenciasFiltradas = [],
  // COMPLETAS, para os graficos por dia: o grafico percorre cada dia do
  // intervalo e precisa cruzar programacao com linha, o que nao da para fazer
  // com a lista ja filtrada.
  programacoes = [],
  linhas = [],
  empilhadeiraAtiva,
  dataInicio,
  dataFim,
}) {
  const duracaoTurnoMins = (empilhadeiraAtiva?.duracao_turno_horas || 8) * 60;

  // ---------- Bloco 1: Produção ----------
  const totalNormal = linhasFiltradas.filter(l => l.tipo_linha === "Normal" || !l.tipo_linha).length;
  const totalCritico = linhasFiltradas.filter(l => l.tipo_linha === "Crítico").length;
  const totalAvulso = linhasFiltradas.filter(l => l.tipo_linha === "Avulso").length;
  const totalConcluidas = linhasFiltradas.filter(l => l.status === "Concluído").length;
  const totalPendentes = linhasFiltradas.length - totalConcluidas;

  const temposMins = linhasFiltradas
    .filter(l => l.tempo_total && l.status === "Concluído")
    .map(l => minsFromHHMM(l.tempo_total));
  const tempoMedioGeral = temposMins.length > 0 ? Math.round(temposMins.reduce((a, b) => a + b, 0) / temposMins.length) : 0;

  const tempoMedioTipo = ["Normal", "Crítico", "Avulso"].map(tipo => {
    const ts = linhasFiltradas
      .filter(l => (l.tipo_linha === tipo || (!l.tipo_linha && tipo === "Normal")) && l.status === "Concluído" && l.tempo_total)
      .map(l => minsFromHHMM(l.tempo_total));
    return { tipo, media: ts.length > 0 ? Math.round(ts.reduce((a, b) => a + b, 0) / ts.length) : 0, count: ts.length };
  });

  // Linhas por dia
  const dias = dataInicio && dataFim
    ? eachDayOfInterval({ start: parseISO(dataInicio), end: parseISO(dataFim) })
    : [];

  const linhasPorDia = dias.map(d => {
    const dia = format(d, "yyyy-MM-dd");
    const ps = programacoes.filter(p => p.data_programada === dia).map(p => p.id);
    const ls = linhas.filter(l => ps.includes(l.programacao_id));
    return {
      dia: format(d, "dd/MM", { locale: ptBR }),
      Normal: ls.filter(l => l.tipo_linha === "Normal" || !l.tipo_linha).length,
      Crítico: ls.filter(l => l.tipo_linha === "Crítico").length,
      Avulso: ls.filter(l => l.tipo_linha === "Avulso").length,
    };
  });

  // ---------- Bloco 2: Operadores ----------
  const rankingEmpilhador = {};
  const rankingAjudante = {};
  linhasFiltradas.filter(l => l.status === "Concluído").forEach(l => {
    if (l.operador_empilhadeira) {
      if (!rankingEmpilhador[l.operador_empilhadeira]) rankingEmpilhador[l.operador_empilhadeira] = { total: 0, mins: [] };
      rankingEmpilhador[l.operador_empilhadeira].total++;
      if (l.tempo_total) rankingEmpilhador[l.operador_empilhadeira].mins.push(minsFromHHMM(l.tempo_total));
    }
    if (l.operador_ajudante && l.operador_ajudante !== "nenhum") {
      if (!rankingAjudante[l.operador_ajudante]) rankingAjudante[l.operador_ajudante] = { total: 0, mins: [] };
      rankingAjudante[l.operador_ajudante].total++;
      if (l.tempo_total) rankingAjudante[l.operador_ajudante].mins.push(minsFromHHMM(l.tempo_total));
    }
  });
  const toRanking = (obj) => Object.entries(obj).map(([nome, d]) => ({
    nome,
    total: d.total,
    media: d.mins.length > 0 ? Math.round(d.mins.reduce((a, b) => a + b, 0) / d.mins.length) : 0,
  })).sort((a, b) => b.total - a.total);

  // ---------- Bloco 3: Paradas ----------
  const totalTempoParado = paradasFiltradas.reduce((acc, p) => acc + (parseInt(p.tempo_total) || 0), 0);
  const paradaPorTipo = Object.entries(
    paradasFiltradas.reduce((acc, p) => { acc[p.tipo] = (acc[p.tipo] || 0) + (parseInt(p.tempo_total) || 0); return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  const paradasPorDia = dias.map(d => {
    const dia = format(d, "yyyy-MM-dd");
    const ps = paradasFiltradas.filter(p => p.data === dia);
    return { dia: format(d, "dd/MM", { locale: ptBR }), paradas: ps.length, tempo: ps.reduce((a, p) => a + (parseInt(p.tempo_total) || 0), 0) };
  });

  // ---------- Bloco 4: Ocorrências ----------
  const ocorrPorTipo = Object.entries(
    ocorrenciasFiltradas.reduce((acc, o) => { acc[o.tipo || "Outro"] = (acc[o.tipo || "Outro"] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  const rankOcorrencias = Object.entries(
    ocorrenciasFiltradas.reduce((acc, o) => { if (o.registrado_por) { acc[o.registrado_por] = (acc[o.registrado_por] || 0) + 1; } return acc; }, {})
  ).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);

  // ---------- Bloco 5: OEE simplificado ----------
  const oeeDias = dias.map(d => {
    const dia = format(d, "yyyy-MM-dd");
    const ps = programacoes.filter(p => p.data_programada === dia).map(p => p.id);
    const ls = linhas.filter(l => ps.includes(l.programacao_id) && l.status === "Concluído" && l.tempo_total);
    const produtivo = ls.reduce((a, l) => a + minsFromHHMM(l.tempo_total), 0);
    const parado = paradasFiltradas.filter(p => p.data === dia).reduce((a, p) => a + (parseInt(p.tempo_total) || 0), 0);
    const aproveitamento = duracaoTurnoMins > 0 ? Math.min(100, Math.round((produtivo / duracaoTurnoMins) * 100)) : 0;
    return { dia: format(d, "dd/MM", { locale: ptBR }), aproveitamento, produtivo, parado };
  });
  const oeeMedio = oeeDias.length > 0 ? Math.round(oeeDias.reduce((a, d) => a + d.aproveitamento, 0) / oeeDias.length) : 0;

  const cores = CORES_GRAFICO();
  const eixo = EIXO();
  const grade = GRADE();
  const tooltip = TOOLTIP();
  const legenda = LEGENDA();

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* ── PRODUÇÃO ─────────────────────────────────────────────────── */}
      <SectionCard titulo="Produção" legenda="Linhas movimentadas no período" icone={TrendingUp} atraso={0.05}>
        {linhasFiltradas.length === 0 ? (
          <EmptyState icone={BarChart2} titulo="Sem dados no período selecionado" />
        ) : (
          <div className="flex min-w-0 flex-col gap-5">
            <div className="grid min-w-0 grid-cols-2 gap-2.5 md:grid-cols-4">
              <MiniKPI rotulo="Normal" valor={totalNormal} />
              <MiniKPI rotulo="Crítico" valor={totalCritico} tom="erro" />
              <MiniKPI rotulo="Avulso" valor={totalAvulso} tom="atencao" />
              <MiniKPI rotulo="Concluídas" valor={`${totalConcluidas}/${linhasFiltradas.length}`} tom="ok" />
            </div>

            <div className="grid min-w-0 gap-5 md:grid-cols-2">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-texto-fraco">Tempo médio por linha</p>
                <p className="num text-[38px] font-extrabold leading-none text-tinta">
                  {tempoMedioGeral} <span className="text-xl text-texto-fraco">min</span>
                </p>
                <dl className="mt-2.5 space-y-1">
                  {tempoMedioTipo.map((t) => (
                    <div key={t.tipo} className="flex items-center gap-2 text-sm">
                      <dt className="w-20 font-bold text-texto-fraco">{t.tipo}</dt>
                      <dd className="num font-extrabold text-tinta">{t.media} min</dd>
                      <dd className="text-xs font-semibold text-texto-apagado">
                        ({t.count} linhas)
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="min-w-0">
                <p className="mb-2 text-[13px] font-bold text-texto-fraco">Linhas por dia</p>
                {linhasPorDia.length > 1 ? (
                  <div style={{ height: 180 }} className="min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={linhasPorDia} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                        <CartesianGrid {...grade} />
                        <XAxis dataKey="dia" {...eixo} />
                        <YAxis {...eixo} />
                        <Tooltip {...tooltip} />
                        <Bar dataKey="Normal" stackId="a" fill={cores[5]} />
                        <Bar dataKey="Crítico" stackId="a" fill={cores[3]} />
                        <Bar dataKey="Avulso" stackId="a" fill={cores[2]} radius={RAIO_BARRA} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-texto-apagado">
                    Selecione um período maior para ver o gráfico
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── OPERADORES ───────────────────────────────────────────────── */}
      <SectionCard titulo="Operadores" legenda="Quem movimentou mais linhas" icone={User} atraso={0.1}>
        {linhasFiltradas.length === 0 ? (
          <EmptyState icone={BarChart2} titulo="Sem dados no período selecionado" />
        ) : (
          <div className="grid min-w-0 gap-5 md:grid-cols-2">
            <Ranking titulo="Empilhadores" itens={toRanking(rankingEmpilhador)} />
            <Ranking titulo="Ajudantes" itens={toRanking(rankingAjudante)} />
          </div>
        )}
      </SectionCard>

      {/* ── PARADAS ──────────────────────────────────────────────────── */}
      <SectionCard titulo="Paradas" legenda="Tempo em que a empilhadeira ficou parada" icone={OctagonX} atraso={0.15}>
        {paradasFiltradas.length === 0 ? (
          <EmptyState icone={OctagonX} titulo="Nenhuma parada registrada no período"
            legenda="Nada a relatar é um bom resultado." />
        ) : (
          <div className="flex min-w-0 flex-col gap-5">
            <div className="grid min-w-0 grid-cols-3 gap-2.5">
              <MiniKPI rotulo="Total de paradas" valor={paradasFiltradas.length} tom="atencao" />
              <MiniKPI rotulo="Tempo parado" valor={`${totalTempoParado} min`} tom="erro" />
              <MiniKPI
                rotulo="% do turno perdido"
                valor={`${duracaoTurnoMins > 0 ? Math.round((totalTempoParado / duracaoTurnoMins) * 100) : 0}%`}
              />
            </div>

            <div className="grid min-w-0 gap-5 md:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-2 text-[13px] font-bold text-texto-fraco">Tempo parado por tipo</p>
                {paradaPorTipo.length > 0 && (
                  <div style={{ height: 180 }} className="min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paradaPorTipo} dataKey="value" nameKey="name"
                          cx="50%" cy="50%" outerRadius={64} paddingAngle={2}
                        >
                          {paradaPorTipo.map((_, i) => (
                            <Cell key={i} fill={cores[i % cores.length]} />
                          ))}
                        </Pie>
                        <Tooltip {...tooltip} formatter={(v) => [`${v} min`, ""]} />
                        <Legend {...legenda} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <p className="mb-2 text-[13px] font-bold text-texto-fraco">Paradas por dia</p>
                {paradasPorDia.length > 1 ? (
                  <div style={{ height: 180 }} className="min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={paradasPorDia} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                        <CartesianGrid {...grade} />
                        <XAxis dataKey="dia" {...eixo} />
                        <YAxis {...eixo} />
                        <Tooltip {...tooltip} />
                        <Bar dataKey="paradas" fill={cores[2]} radius={RAIO_BARRA} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-texto-apagado">
                    Selecione um período maior para ver o gráfico
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── OCORRÊNCIAS ──────────────────────────────────────────────── */}
      <SectionCard titulo="Ocorrências" legenda="Registradas no período" icone={AlertTriangle} atraso={0.2}>
        {ocorrenciasFiltradas.length === 0 ? (
          <EmptyState icone={AlertTriangle} titulo="Nenhuma ocorrência no período" />
        ) : (
          <div className="grid min-w-0 gap-5 md:grid-cols-2">
            <div className="min-w-0">
              <div className="mb-4 grid grid-cols-2 gap-2.5">
                <MiniKPI rotulo="Total" valor={ocorrenciasFiltradas.length} tom="atencao" />
                <MiniKPI
                  rotulo="Resolvidas"
                  valor={ocorrenciasFiltradas.filter((o) => o.resolvido).length}
                  tom="ok"
                />
              </div>
              <Ranking titulo="Quem mais registrou" itens={rankOcorrencias.slice(0, 5)} semMedia />
            </div>

            <div className="min-w-0">
              <p className="mb-2 text-[13px] font-bold text-texto-fraco">Por tipo</p>
              {ocorrPorTipo.length > 0 && (
                <div style={{ height: 200 }} className="min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={ocorrPorTipo} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" outerRadius={70} paddingAngle={2}
                      >
                        {ocorrPorTipo.map((_, i) => (
                          <Cell key={i} fill={cores[i % cores.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltip} />
                      <Legend {...legenda} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── OEE ──────────────────────────────────────────────────────── */}
      <SectionCard
        titulo="OEE simplificado"
        legenda={`Turno de ${empilhadeiraAtiva?.duracao_turno_horas || 8}h`}
        icone={Clock}
        atraso={0.25}
      >
        {oeeDias.every((d) => d.aproveitamento === 0) ? (
          <EmptyState icone={Clock} titulo="Sem dados de tempo concluído no período" />
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="rounded-painel bg-marca-suave px-5 py-4">
              <p className="text-[13px] font-bold text-marca-forte">
                Aproveitamento médio do período
              </p>
              <p className="num text-[60px] font-extrabold leading-none text-marca">{oeeMedio}%</p>
            </div>

            {oeeDias.length > 1 && (
              <div style={{ height: 200 }} className="min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={oeeDias} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid {...grade} />
                    <XAxis dataKey="dia" {...eixo} />
                    <YAxis domain={[0, 100]} unit="%" {...eixo} />
                    <Tooltip {...tooltip} formatter={(v) => [`${v}%`, "Aproveitamento"]} />
                    <Line
                      type="monotone" dataKey="aproveitamento" name="Aproveitamento"
                      stroke={cores[0]} strokeWidth={3}
                      dot={{ r: 4, fill: cores[0] }} activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function Ranking({ titulo, itens, semMedia = false }) {
  const maior = Math.max(...itens.map((i) => i.total), 1);

  return (
    <div className="min-w-0">
      <p className="mb-2.5 text-[13px] font-bold text-texto-fraco">{titulo}</p>
      {itens.length === 0 ? (
        <p className="text-sm font-semibold text-texto-apagado">Sem dados</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {itens.map((op, i) => (
            <li key={op.nome} className="flex min-h-[48px] items-center gap-3 rounded-token bg-fundo px-3">
              <span className="num w-5 flex-none text-sm font-bold text-texto-apagado">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold text-tinta">{op.nome}</span>
                <span
                  aria-hidden="true"
                  className="mt-1 block h-1.5 overflow-hidden rounded-full bg-cartao"
                >
                  <span
                    className="block h-full rounded-full bg-marca"
                    style={{ width: `${Math.round((op.total / maior) * 100)}%` }}
                  />
                </span>
              </span>
              <span className="flex-none text-right">
                <span className="num block text-sm font-extrabold text-tinta">{op.total}</span>
                {!semMedia && op.media != null && (
                  <span className="block text-[11px] font-semibold text-texto-apagado">
                    {op.media} min/linha
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
