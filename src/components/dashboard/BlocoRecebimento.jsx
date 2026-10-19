import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Truck, AlertTriangle, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { SectionCard } from "@/components/fluxo";

const hoje = () => format(new Date(), "yyyy-MM-dd");

/**
 * Resumo de recebimento no painel.
 *
 * O que mudou: `slate-50`/`green-700`/`red-700` viraram token, a borda dura do
 * cartão saiu, e o ponto pulsante usa a utilitária `ao-vivo` — que respeita
 * `prefers-reduced-motion`, coisa que o `animate-pulse` solto não fazia.
 *
 * As consultas e as contas não mudaram.
 */
export default function BlocoRecebimento() {
  const { data: recebimentos = [] } = useQuery({
    queryKey: ["recebimentos-bloco"],
    queryFn: () => base44.entities.Recebimento.list("-data_chegada", 50),
  });

  const { data: ocorrencias = [] } = useQuery({
    queryKey: ["recebimento-ocorrencias-bloco"],
    queryFn: () => base44.entities.RecebimentoOcorrencia.list("-created_date", 50),
  });

  const hojeStr = hoje();
  const hoje_rec = recebimentos.filter(r => r.data_chegada === hojeStr || r.data_prevista === hojeStr);
  const emAndamento = recebimentos.filter(r => r.status === "Em andamento");
  const concluidosHoje = hoje_rec.filter(r => r.status === "Concluído");
  const comOcorrencia = recebimentos.filter(r => ocorrencias.some(o => o.recebimento_id === r.id && !o.resolvido));

  return (
    <SectionCard
      titulo="Recebimento"
      legenda="Hoje na portaria"
      icone={Truck}
      atraso={0.15}
      acoes={
        <Link to="/Recebimento">
          <Button size="lg" variant="outline">
            Ver todos
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      }
    >
      <div className="grid min-w-0 grid-cols-2 gap-2.5 md:grid-cols-4">
        {[
          { rotulo: "Hoje", valor: hoje_rec.length, cor: "text-tinta" },
          { rotulo: "Em andamento", valor: emAndamento.length, cor: "text-marca" },
          { rotulo: "Concluídos hoje", valor: concluidosHoje.length, cor: "text-ok" },
          { rotulo: "Com ocorrência", valor: comOcorrencia.length, cor: "text-erro" },
        ].map((k) => (
          <div key={k.rotulo} className="min-w-0 rounded-token bg-fundo px-4 py-3">
            <p className="truncate text-xs font-bold text-texto-fraco">{k.rotulo}</p>
            <p className={`num text-2xl font-extrabold ${k.cor}`}>{k.valor}</p>
          </div>
        ))}
      </div>

      {emAndamento.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {emAndamento.map((r) => (
            <li key={r.id}>
              <Link
                to={`/ExecutarRecebimento?id=${r.id}`}
                className="press foco-fluxo flex min-h-[56px] items-center justify-between gap-3
                           rounded-token bg-marca-suave px-4 py-2.5 hover:bg-marca-suave-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="ao-vivo h-2 w-2 flex-none rounded-full bg-marca" aria-hidden="true" />
                  <span className="truncate font-extrabold text-tinta">{r.numero_documento}</span>
                  <span className="flex-none rounded-full bg-cartao px-2 py-0.5 text-[11px] font-extrabold text-marca">
                    {r.tipo}
                  </span>
                </span>
                <span className="flex-none truncate text-xs font-bold text-marca">
                  {r.fornecedor_nome || "—"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {comOcorrencia.length > 0 && (
        <p
          role="alert"
          className="mt-2.5 flex items-center gap-2 rounded-token bg-erro-suave px-4 py-2.5
                     text-sm font-bold text-erro"
        >
          <AlertTriangle className="h-4 w-4 flex-none" aria-hidden="true" />
          {comOcorrencia.length} recebimento{comOcorrencia.length > 1 ? "s" : ""} com ocorrências abertas
        </p>
      )}
    </SectionCard>
  );
}
