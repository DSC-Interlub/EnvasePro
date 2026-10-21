import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Calendar, Package, CheckCircle, Filter, AlertCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { formatarData } from '@/lib/datas';
import { useAuth } from "@/lib/AuthContext";
import { PageHeader, StatCard, ListaCard, StatusPill, EmptyState } from "@/components/fluxo";

export default function Checkout() {
  // Excluir programação é só do admin (o banco recusa o operador).
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const queryClient = useQueryClient();
  
  const { data: programacoes, isLoading: isLoadingProgramacoes } = useQuery({
    queryKey: ['checkout-programacoes'],
    queryFn: () => base44.entities.CheckoutProgramacao.list("-data_programada"),
    initialData: [],
  });

  const { data: checkoutItems, isLoading: isLoadingCheckoutItems } = useQuery({
    queryKey: ['checkout-items'],
    queryFn: () => base44.entities.CheckoutItem.list(),
    initialData: [],
  });

  const deleteProgramacaoMutation = useMutation({
    mutationFn: async (programacaoId) => {
      // Primeiro, excluir todos os itens da programação
      const items = checkoutItems.filter(item => item.programacao_id === programacaoId);
      await Promise.all(items.map(item => base44.entities.CheckoutItem.delete(item.id)));
      
      // Depois, excluir a programação
      await base44.entities.CheckoutProgramacao.delete(programacaoId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkout-programacoes'] });
      queryClient.invalidateQueries({ queryKey: ['checkout-items'] });
    },
  });

  const handleDeleteProgramacao = (programacao) => {
    const itemsCount = checkoutItems.filter(item => item.programacao_id === programacao.id).length;
    const message = itemsCount > 0 
      ? `Tem certeza que deseja excluir esta programação?\n\n${itemsCount} pedido(s) também serão excluídos.`
      : 'Tem certeza que deseja excluir esta programação?';
    
    if (confirm(message)) {
      deleteProgramacaoMutation.mutate(programacao.id);
    }
  };
  const filteredProgramacoes = programacoes.filter(prog => {
    if (!prog.data_programada) return false;
    
    const progDate = prog.data_programada;
    const progMonth = formatarData(progDate, "yyyy-MM");
    
    let dateMatch = true;
    
    if (selectedMonth) {
      dateMatch = progMonth === selectedMonth;
      
      if (startDate || endDate) {
        if (startDate && endDate) {
          dateMatch = progDate >= startDate && progDate <= endDate;
        } else if (startDate) {
          dateMatch = progDate >= startDate;
        } else if (endDate) {
          dateMatch = progDate <= endDate;
        }
      }
    }
    
    return dateMatch;
  });

  const isLoading = isLoadingProgramacoes || isLoadingCheckoutItems;

  const itensDaProg = (progId) => checkoutItems.filter((item) => item.programacao_id === progId);
  const totalCriticos = filteredProgramacoes.reduce(
    (total, prog) => total + itensDaProg(prog.id).filter((item) => item.critico).length, 0);

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="mx-auto flex min-w-0 max-w-7xl flex-col gap-4">
        <PageHeader
          migalha={[{ rotulo: "Operação" }, { rotulo: "Check-out" }]}
          titulo="Check-out de pedidos"
          legenda="Programações e execução"
          acoes={
            <Link to={createPageUrl("NovaProgramacaoCheckout")}>
              <Button size="lg">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nova programação
              </Button>
            </Link>
          }
        />

        {/* Filtro de período: era um cartão de 6rem com três campos rotulados
            um a um. O `type` do campo já diz ao olho o que ele é, e o
            `aria-label` diz ao leitor de tela. */}
        <div className="cartao-fluxo flex min-w-0 flex-wrap items-center gap-2.5 p-4">
          <span className="flex items-center gap-2 text-[13px] font-bold text-texto-fraco">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Período
          </span>
          <Input
            id="month" type="month" aria-label="Filtrar por mês"
            value={selectedMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); setStartDate(""); setEndDate(""); }}
            className="w-44"
          />
          <Input
            id="startDate" type="date" aria-label="Data inicial" value={startDate}
            onChange={(e) => setStartDate(e.target.value)} max={endDate || undefined} className="w-40"
          />
          <span className="text-sm font-bold text-texto-apagado">até</span>
          <Input
            id="endDate" type="date" aria-label="Data final" value={endDate}
            onChange={(e) => setEndDate(e.target.value)} min={startDate || undefined} className="w-40"
          />
          {(startDate || endDate) && (
            <p className="w-full text-xs font-semibold text-texto-fraco">
              {startDate && endDate
                ? `Mostrando programações de ${formatarData(startDate, "dd/MM/yyyy")} até ${formatarData(endDate, "dd/MM/yyyy")}`
                : startDate
                  ? `Mostrando programações a partir de ${formatarData(startDate, "dd/MM/yyyy")}`
                  : `Mostrando programações até ${formatarData(endDate, "dd/MM/yyyy")}`}
            </p>
          )}
        </div>

        <div className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
          <StatCard
            rotulo="Programações" valor={filteredProgramacoes.length}
            icone={Calendar} destaque legenda="no período" atraso={0.05}
          />
          <StatCard
            rotulo="Pedidos críticos" valor={totalCriticos} icone={AlertCircle}
            tom={totalCriticos > 0 ? "erro" : "neutro"} legenda="exigem atenção" atraso={0.1}
          />
          <StatCard
            rotulo="Concluídas" icone={CheckCircle} tom="ok" atraso={0.15}
            valor={filteredProgramacoes.filter((p) => p.status === "Concluído").length}
            legenda="programações fechadas"
          />
        </div>

        <ListaCard atraso={0.2}>
          <div className="px-5 pb-5 pt-4">
            {isLoading ? (
              <EmptyState carregando />
            ) : filteredProgramacoes.length === 0 ? (
              <EmptyState
                icone={Calendar}
                titulo="Nenhuma programação no período"
                legenda="Ajuste o período acima ou crie a primeira programação."
                acao={
                  <Link to={createPageUrl("NovaProgramacaoCheckout")}>
                    <Button><Plus className="h-4 w-4" aria-hidden="true" />Criar programação</Button>
                  </Link>
                }
              />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {filteredProgramacoes.map((prog) => {
                  const itens = itensDaProg(prog.id);
                  const criticos = itens.filter((i) => i.critico).length;
                  const total = prog.total_pedidos || itens.length;
                  const feitos = prog.pedidos_concluidos || 0;
                  const pct = total > 0 ? Math.round((feitos / total) * 100) : 0;

                  return (
                    <li
                      key={prog.id}
                      className="flex min-w-0 flex-col gap-3 rounded-painel bg-fundo p-4
                                 sm:flex-row sm:items-center"
                    >
                      <Link
                        to={createPageUrl(`ExecutarCheckout?id=${prog.id}`)}
                        className="foco-fluxo min-w-0 flex-1 rounded-token"
                      >
                        <span className="block text-lg font-extrabold text-tinta">
                          {formatarData(prog.data_programada, "EEEE, dd 'de' MMMM 'de' yyyy")}
                        </span>

                        <span className="mt-1 flex flex-wrap items-center gap-3 text-sm font-semibold text-texto-fraco">
                          <span className="flex items-center gap-1.5">
                            <Package className="h-4 w-4" aria-hidden="true" />
                            <span className="num font-bold text-tinta">{total}</span> pedidos
                          </span>
                          <span className="flex items-center gap-1.5">
                            <CheckCircle className="h-4 w-4" aria-hidden="true" />
                            <span className="num font-bold text-tinta">{feitos}</span> concluídos
                          </span>
                          {criticos > 0 && (
                            <span className="rounded-full bg-erro-suave px-2.5 py-0.5 text-xs font-extrabold text-erro">
                              {criticos} crítico{criticos > 1 ? "s" : ""}
                            </span>
                          )}
                        </span>

                        {/* Barra de progresso: a programação dizia "12 pedidos,
                            3 concluídos" e deixava a conta para quem olhava. */}
                        {total > 0 && (
                          <span
                            className="mt-2.5 block h-1.5 max-w-sm overflow-hidden rounded-full bg-cartao"
                            role="img"
                            aria-label={`${pct}% concluído`}
                          >
                            <span
                              className={`block h-full rounded-full ${pct === 100 ? "bg-ok" : "bg-marca"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                        )}

                        {prog.observacoes && (
                          <span className="mt-2 block text-sm font-semibold italic text-texto-apagado">
                            “{prog.observacoes}”
                          </span>
                        )}
                      </Link>

                      <div className="flex flex-none items-center gap-2.5">
                        <StatusPill estado={prog.status} />
                        {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteProgramacao(prog)}
                          disabled={deleteProgramacaoMutation.isPending}
                          aria-label={`Excluir a programação de ${formatarData(prog.data_programada, "dd/MM/yyyy")}`}
                          className="text-texto-fraco hover:bg-erro-suave hover:text-erro"
                        >
                          <Trash2 className="h-5 w-5" aria-hidden="true" />
                        </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </ListaCard>
      </div>
    </div>
  );
}
