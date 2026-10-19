import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { PageHeader } from "@/components/fluxo";
import BlocosIndicadores from "../components/empilhadeira/BlocosIndicadores";
import FiltroPeriodoEmpilha from "../components/empilhadeira/FiltroperiodoEmpilha";

export default function IndicadoresEmpilha() {
  const hoje = format(new Date(), "yyyy-MM-dd");
  const [dataInicio, setDataInicio] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);

  // Os cinco blocos vêm prontos do banco — public.indicadores_empilhadeira
  // (Etapa 2). Antes a página baixava todo o histórico de linhas,
  // programações, paradas e ocorrências para contar um período.
  const { data: indicadores, isLoading } = useQuery({
    queryKey: ["indicadores-empilha", dataInicio, dataFim],
    queryFn: () => base44.functions.indicadoresEmpilhadeira(dataInicio, dataFim),
  });

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

        <BlocosIndicadores dados={indicadores} carregando={isLoading} />
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