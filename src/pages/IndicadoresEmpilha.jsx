import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart2, Clock, User, OctagonX, AlertTriangle, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageHeader } from "@/components/fluxo";
import BlocosIndicadores from "../components/empilhadeira/BlocosIndicadores";
import FiltroPeriodoEmpilha from "../components/empilhadeira/FiltroperiodoEmpilha";

export default function IndicadoresEmpilha() {
  const hoje = format(new Date(), "yyyy-MM-dd");
  const [dataInicio, setDataInicio] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);

  const { data: programacoes } = useQuery({
    queryKey: ["empilha-programacoes"],
    queryFn: () => base44.entities.EmpilhaProgramacao.list("-data_programada"),
    initialData: [],
  });

  const { data: linhas } = useQuery({
    queryKey: ["empilha-linhas-all"],
    queryFn: () => base44.entities.EmpilhaLinha.list(),
    initialData: [],
  });

  const { data: paradas } = useQuery({
    queryKey: ["empilha-paradas"],
    queryFn: () => base44.entities.EmpilhadeiraParada.list("-data"),
    initialData: [],
  });

  const { data: ocorrencias } = useQuery({
    queryKey: ["empilha-ocorrencias"],
    queryFn: () => base44.entities.EmpilhaOcorrencia.list("-data"),
    initialData: [],
  });

  const { data: empilhadeiras } = useQuery({
    queryKey: ["empilhadeiras-config"],
    queryFn: () => base44.entities.EmpilhadeiraConfig.list(),
    initialData: [],
  });

  const emPeriodo = (data) => data && data >= dataInicio && data <= dataFim;

  const progIds = useMemo(() =>
    programacoes.filter(p => emPeriodo(p.data_programada)).map(p => p.id),
    [programacoes, dataInicio, dataFim]
  );

  const linhasFiltradas = useMemo(() =>
    linhas.filter(l => progIds.includes(l.programacao_id)),
    [linhas, progIds]
  );

  const paradasFiltradas = useMemo(() =>
    paradas.filter(p => emPeriodo(p.data)),
    [paradas, dataInicio, dataFim]
  );

  const ocorrenciasFiltradas = useMemo(() =>
    ocorrencias.filter(o => emPeriodo(o.data)),
    [ocorrencias, dataInicio, dataFim]
  );

  const empilhadeiraAtiva = empilhadeiras.find(e => e.ativa);
  const duracaoTurnoMins = (empilhadeiraAtiva?.duracao_turno_horas || 8) * 60;


  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="mx-auto flex min-w-0 max-w-7xl flex-col gap-4">
        <PageHeader
          migalha={[{ rotulo: "Empilhadeira" }, { rotulo: "Indicadores" }]}
          titulo="Indicadores da empilhadeira"
          legenda="Produção, operadores, paradas e aproveitamento"
          acoes={
            <Link to={createPageUrl("Empilhadeira")}>
              <Button variant="outline" size="lg">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar
              </Button>
            </Link>
          }
        />

        <FiltroPeriodoEmpilha
          dataInicio={dataInicio}
          dataFim={dataFim}
          onChange={(i, f) => { setDataInicio(i); setDataFim(f); }}
        />

        <BlocosIndicadores
          linhasFiltradas={linhasFiltradas}
          paradasFiltradas={paradasFiltradas}
          ocorrenciasFiltradas={ocorrenciasFiltradas}
          programacoes={programacoes}
          linhas={linhas}
          empilhadeiraAtiva={empilhadeiraAtiva}
          dataInicio={dataInicio}
          dataFim={dataFim}
        />
      </div>
    </div>
  );
}

/**
 * Ranking de pessoas — o mesmo bloco aparecia três vezes (empilhadores,
 * ajudantes e quem registrou ocorrência), com `border-b border-borda` e um
 * `<Badge>` cinza.
 *
 * A barra de proporção é nova: a lista ordenada já dizia a ordem, mas não a
 * distância entre o primeiro e o segundo.
 */