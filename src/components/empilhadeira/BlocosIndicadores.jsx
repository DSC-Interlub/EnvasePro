import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { BarChart2, Clock, User, OctagonX, AlertTriangle, TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  SectionCard, EmptyState, MiniKPI,
  CORES_GRAFICO, EIXO, GRADE, TOOLTIP, LEGENDA, RAIO_BARRA,
} from "@/components/fluxo";

/**
 * Os cinco blocos de indicadores da empilhadeira: producao, operadores,
 * paradas, ocorrencias e OEE.
 *
 * Usado na página "IndicadoresEmpilha" e na aba "Indicadores" da página
 * "Empilhadeira" — um componente só, para as duas não divergirem.
 *
 * DESDE A ETAPA 2 O COMPONENTE SÓ DESENHA. As contas vêm prontas em `dados`,
 * de public.indicadores_empilhadeira(de, ate) — ou, se a função ainda não
 * existir no banco, de src/lib/indicadoresEmpilha.js, que tem a mesma regra.
 * Antes, cada tela baixava TODO o histórico para contar um período.
 */
const diaCurto = (dia) => format(parseISO(dia), "dd/MM", { locale: ptBR });

export default function BlocosIndicadores({ dados, carregando = false }) {
  if (!dados) {
    return (
      <div className="cartao-fluxo">
        <EmptyState carregando={carregando} icone={BarChart2} titulo="Sem dados no período selecionado" />
      </div>
    );
  }
  const P = dados.producao;
  const totalNormal = P.normal;
  const totalCritico = P.critico;
  const totalAvulso = P.avulso;
  const totalConcluidas = P.concluidas;
  const tempoMedioGeral = P.tempo_medio;
  const tempoMedioTipo = P.por_tipo;
  const linhasPorDia = P.por_dia.map((d) => ({ ...d, dia: diaCurto(d.dia) }));
  const temLinhas = P.total > 0;
  const duracaoTurnoMins = Number(dados.duracao_turno_horas) * 60;

  const totalTempoParado = Number(dados.paradas.minutos);
  const paradaPorTipo = dados.paradas.por_tipo.map((x) => ({ ...x, value: Number(x.value) }));
  const paradasPorDia = dados.paradas.por_dia.map((d) => ({ ...d, dia: diaCurto(d.dia), tempo: Number(d.tempo) }));
  const totalParadas = dados.paradas.total;

  const ocorrPorTipo = dados.ocorrencias.por_tipo;
  const rankOcorrencias = dados.ocorrencias.ranking;
  const totalOcorrencias = dados.ocorrencias.total;
  const ocorrResolvidas = dados.ocorrencias.resolvidas;

  const oeeDias = dados.oee.dias.map((d) => ({ ...d, dia: diaCurto(d.dia) }));
  const oeeMedio = dados.oee.medio;

  const cores = CORES_GRAFICO();
  const eixo = EIXO();
  const grade = GRADE();
  const tooltip = TOOLTIP();
  const legenda = LEGENDA();

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* ── PRODUÇÃO ─────────────────────────────────────────────────── */}
      <SectionCard titulo="Produção" legenda="Linhas movimentadas no período" icone={TrendingUp} atraso={0.05}>
        {!temLinhas ? (
          <EmptyState icone={BarChart2} titulo="Sem dados no período selecionado" />
        ) : (
          <div className="flex min-w-0 flex-col gap-5">
            <div className="grid min-w-0 grid-cols-2 gap-2.5 md:grid-cols-4">
              <MiniKPI rotulo="Normal" valor={totalNormal} />
              <MiniKPI rotulo="Crítico" valor={totalCritico} tom="erro" />
              <MiniKPI rotulo="Avulso" valor={totalAvulso} tom="atencao" />
              <MiniKPI rotulo="Concluídas" valor={`${totalConcluidas}/${P.total}`} tom="ok" />
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
        {!temLinhas ? (
          <EmptyState icone={BarChart2} titulo="Sem dados no período selecionado" />
        ) : (
          <div className="grid min-w-0 gap-5 md:grid-cols-2">
            <Ranking titulo="Empilhadores" itens={dados.operadores.empilhadores} />
            <Ranking titulo="Ajudantes" itens={dados.operadores.ajudantes} />
          </div>
        )}
      </SectionCard>

      {/* ── PARADAS ──────────────────────────────────────────────────── */}
      <SectionCard titulo="Paradas" legenda="Tempo em que a empilhadeira ficou parada" icone={OctagonX} atraso={0.15}>
        {totalParadas === 0 ? (
          <EmptyState icone={OctagonX} titulo="Nenhuma parada registrada no período"
            legenda="Nada a relatar é um bom resultado." />
        ) : (
          <div className="flex min-w-0 flex-col gap-5">
            <div className="grid min-w-0 grid-cols-3 gap-2.5">
              <MiniKPI rotulo="Total de paradas" valor={totalParadas} tom="atencao" />
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
        {totalOcorrencias === 0 ? (
          <EmptyState icone={AlertTriangle} titulo="Nenhuma ocorrência no período" />
        ) : (
          <div className="grid min-w-0 gap-5 md:grid-cols-2">
            <div className="min-w-0">
              <div className="mb-4 grid grid-cols-2 gap-2.5">
                <MiniKPI rotulo="Total" valor={totalOcorrencias} tom="atencao" />
                <MiniKPI
                  rotulo="Resolvidas"
                  valor={ocorrResolvidas}
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
        legenda={`Turno de ${Number(dados.duracao_turno_horas)}h`}
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
