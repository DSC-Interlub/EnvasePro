import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Target, History, AlertCircle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, SectionCard, EmptyState } from "@/components/fluxo";
import { ITENS_META, chaveMeta, vigentes } from "@/lib/metas";
import { formatarData } from "@/lib/datas";

/**
 * Metas diárias — só admin (PAGINAS_SOMENTE_ADMIN e RLS da tabela).
 *
 * DECIDIDO PELO DONO (19/10/2026): envase com meta de unidades e de envases
 * concluídos, uma por sala; check-out (pedidos) e empilhadeira (linhas) com
 * uma cada; valor fixo que vale a partir de uma data, com histórico.
 *
 * TROCAR A META É LANÇAR UMA NOVA, com a data em que passa a valer. A antiga
 * não é apagada: um dia passado continua medido pela meta da época. Por isso
 * só se apaga meta que começa HOJE ou depois — e quem garante isso é o RLS
 * da tabela, não esta tela.
 */
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const fmt = (n) => Number(n).toLocaleString("pt-BR");

function mensagemDoErro(err) {
  if (err?.code === "23505") return "Já existe uma meta para esse item começando nessa data. Escolha outra data.";
  if (err?.code === "23514") return "Valor inválido: a meta tem de ser um número maior que zero.";
  if (err?.code === "42501") return "Só administradores podem lançar metas.";
  return "Não foi possível salvar a meta. Tente de novo.";
}

export default function Metas() {
  const queryClient = useQueryClient();
  const hoje = hojeSP();
  const [item, setItem] = useState(chaveMeta(ITENS_META[0]));
  const [valor, setValor] = useState("");
  const [desde, setDesde] = useState(hoje);
  const [observacao, setObservacao] = useState("");
  const [aviso, setAviso] = useState(null);

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ["metas-diarias"],
    queryFn: () => base44.functions.metasDiarias(),
  });

  const atuais = useMemo(() => vigentes(linhas, hoje), [linhas, hoje]);
  const historico = useMemo(
    () => [...linhas].sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde)),
    [linhas],
  );
  const rotuloDe = (l) => ITENS_META.find((i) => chaveMeta(i) === chaveMeta(l))?.rotulo ?? chaveMeta(l);
  const unidadeDe = (l) => ITENS_META.find((i) => chaveMeta(i) === chaveMeta(l))?.unidade ?? "";

  const depoisDeMudar = () => {
    queryClient.invalidateQueries({ queryKey: ["metas-diarias"] });
    // As TVs leem a meta junto com o painel: atualiza já, sem esperar 30 s.
    queryClient.invalidateQueries({ queryKey: ["painel-tv"] });
  };

  const lancar = useMutation({
    mutationFn: () => {
      const escolhido = ITENS_META.find((i) => chaveMeta(i) === item);
      return base44.functions.lancarMeta({
        modulo: escolhido.modulo, indicador: escolhido.indicador, sala: escolhido.sala,
        valor: Number(valor), vigente_desde: desde, observacao: observacao.trim() || null,
      });
    },
    onSuccess: () => {
      setAviso({ tipo: "ok", texto: "Meta lançada." });
      setValor("");
      setObservacao("");
      depoisDeMudar();
    },
    onError: (err) => setAviso({ tipo: "erro", texto: mensagemDoErro(err) }),
  });

  const apagar = useMutation({
    mutationFn: (id) => base44.functions.apagarMeta(id),
    onSuccess: () => { setAviso({ tipo: "ok", texto: "Meta apagada." }); depoisDeMudar(); },
    onError: (err) => setAviso({ tipo: "erro", texto: mensagemDoErro(err) }),
  });

  const valorOk = Number(valor) > 0 && Number.isInteger(Number(valor));

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="mx-auto flex min-w-0 max-w-[1100px] flex-col gap-4">
        <PageHeader
          migalha={[{ rotulo: "Cadastros" }, { rotulo: "Metas diárias" }]}
          titulo="Metas diárias"
          legenda="O que as TVs usam para medir o dia"
        />

        {aviso && (
          <div
            role={aviso.tipo === "erro" ? "alert" : "status"}
            className={`flex items-start gap-2.5 rounded-token px-4 py-3 ${aviso.tipo === "erro" ? "bg-erro-suave" : "bg-ok-suave"}`}
          >
            {aviso.tipo === "erro"
              ? <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-erro" aria-hidden="true" />
              : <CheckCircle className="mt-0.5 h-4 w-4 flex-none text-ok" aria-hidden="true" />}
            <p className={`text-sm font-bold ${aviso.tipo === "erro" ? "text-erro" : "text-ok"}`}>{aviso.texto}</p>
          </div>
        )}

        <SectionCard titulo="Valendo hoje" legenda={formatarData(hoje, "dd/MM/yyyy")} icone={Target} atraso={0.05}>
          <ul className="grid min-w-0 gap-2.5 sm:grid-cols-2">
            {ITENS_META.map((i) => {
              const v = atuais.get(chaveMeta(i));
              return (
                <li key={chaveMeta(i)} data-meta-item={chaveMeta(i)} className="rounded-token bg-fundo px-4 py-3">
                  <p className="text-xs font-bold text-texto-fraco">{i.rotulo}</p>
                  {v ? (
                    <p className="num text-2xl font-extrabold text-tinta">
                      {fmt(v.valor)} <span className="text-sm text-texto-fraco">{i.unidade}</span>
                      <span className="ml-2 text-xs font-semibold text-texto-apagado">
                        desde {formatarData(v.vigente_desde, "dd/MM/yyyy")}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-texto-apagado">sem meta — a TV mostra o concluído do dia</p>
                  )}
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard titulo="Lançar ou trocar uma meta" legenda="A anterior continua valendo até a data escolhida" icone={Target} atraso={0.1}>
          <form
            className="grid min-w-0 gap-4 md:grid-cols-2"
            onSubmit={(e) => { e.preventDefault(); if (valorOk && desde && !lancar.isPending) { setAviso(null); lancar.mutate(); } }}
          >
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="meta-item">Meta de</Label>
              <select
                id="meta-item"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                className="h-12 w-full rounded-token border border-borda bg-cartao px-3 text-base font-semibold text-tinta"
              >
                {ITENS_META.map((i) => <option key={chaveMeta(i)} value={chaveMeta(i)}>{i.rotulo}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-valor">Valor por dia</Label>
              <Input
                id="meta-valor" type="number" inputMode="numeric" min="1" step="1" required
                value={valor} onChange={(e) => setValor(e.target.value)}
                aria-invalid={valor !== "" && !valorOk ? "true" : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-desde">Vale a partir de</Label>
              <Input id="meta-desde" type="date" required value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="meta-obs">Observação (opcional)</Label>
              <Input id="meta-obs" value={observacao} maxLength={200} onChange={(e) => setObservacao(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" size="lg" disabled={!valorOk || !desde || lancar.isPending}>
                {lancar.isPending ? "Salvando…" : "Lançar meta"}
              </Button>
            </div>
          </form>
        </SectionCard>

        <SectionCard titulo="Histórico" legenda="Todas as metas, da mais nova para a mais antiga" icone={History} atraso={0.15}>
          {isLoading ? (
            <EmptyState carregando />
          ) : historico.length === 0 ? (
            <EmptyState icone={History} titulo="Nenhuma meta lançada ainda" legenda="Sem meta, as TVs mostram o concluído do dia." />
          ) : (
            <ul className="flex flex-col gap-2">
              {historico.map((l) => {
                const futura = l.vigente_desde > hoje;
                const apagavel = l.vigente_desde >= hoje;
                const vigente = atuais.get(chaveMeta(l))?.id === l.id;
                return (
                  <li key={l.id} className="flex min-h-[48px] flex-wrap items-center gap-3 rounded-token bg-fundo px-4 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-extrabold text-tinta">{rotuloDe(l)}</span>
                      <span className="block text-xs font-semibold text-texto-fraco">
                        {fmt(l.valor)} {unidadeDe(l)} · a partir de {formatarData(l.vigente_desde, "dd/MM/yyyy")}
                        {l.observacao ? ` · ${l.observacao}` : ""}
                      </span>
                    </span>
                    {vigente && <span className="rounded-full bg-ok-suave px-2.5 py-1 text-xs font-extrabold text-ok">valendo</span>}
                    {futura && <span className="rounded-full bg-marca-suave px-2.5 py-1 text-xs font-extrabold text-marca">futura</span>}
                    {apagavel && (
                      <Button
                        variant="outline" size="lg"
                        aria-label={`Apagar a meta de ${rotuloDe(l)} a partir de ${formatarData(l.vigente_desde, "dd/MM/yyyy")}`}
                        disabled={apagar.isPending}
                        onClick={() => apagar.mutate(l.id)}
                      >
                        Apagar
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
        <p className="text-xs font-semibold text-texto-apagado">
          Atualizado em {format(new Date(), "dd/MM/yyyy HH:mm")}. Meta que já valeu em dia passado não se altera nem se apaga: para mudar daqui para frente, lance uma nova.
        </p>
      </div>
    </div>
  );
}
