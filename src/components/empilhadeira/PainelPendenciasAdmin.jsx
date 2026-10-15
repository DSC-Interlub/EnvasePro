import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChipsFiltro } from "@/components/fluxo";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, PenLine, CheckCircle, Clock, AlertTriangle, OctagonX, Wrench, Sparkles } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import ModalAssinaturaLimpeza from "../limpeza/ModalAssinaturaLimpeza";

export default function PainelPendenciasAdmin({ linhas, ocorrencias, paradas, empilhadeiras, programacoes, currentUser }) {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState("assinaturas");
  const [modalAssinaturaLimpeza, setModalAssinaturaLimpeza] = useState(null);

  const { data: limpezasProg } = useQuery({
    queryKey: ["limpeza-programacoes"],
    queryFn: () => base44.entities.LimpezaProgramacao.list("data_prevista"),
    initialData: [],
  });

  const hoje = format(new Date(), "yyyy-MM-dd");
  const limpezasAtrasadas = limpezasProg.filter(p => p.data_prevista < hoje && p.status !== "Concluído");
  const limpezasAguardandoLider = limpezasProg.filter(p => p.status === "Concluído" && p.assinatura_responsavel && !p.assinatura_lider);

  const updateLimpezaMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LimpezaProgramacao.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["limpeza-programacoes"] }),
  });

  // Assinaturas pendentes
  const linhasPendentesAssinatura = linhas.filter(l => l.status === "Concluído" && !l.assinatura_lider);

  // Ocorrências abertas do dia
  const ocorrenciasAbertas = ocorrencias.filter(o => !o.resolvido);

  // Paradas em aberto
  const paradasEmAberto = paradas.filter(p => !p.hora_fim);

  // Alertas de manutenção (próximos 7 dias ou vencidos)
  const alertasManutencao = empilhadeiras.filter(e => {
    if (!e.data_proxima_manutencao) return false;
    const dias = differenceInDays(parseISO(e.data_proxima_manutencao), new Date());
    return dias <= 7;
  });

  const totalPendencias = linhasPendentesAssinatura.length + ocorrenciasAbertas.length + paradasEmAberto.length + alertasManutencao.length + limpezasAtrasadas.length + limpezasAguardandoLider.length;

  const [resolvendo, setResolvendo] = useState(null);
  const [resolucaoTexto, setResolucaoTexto] = useState("");
  const [horaFimParada, setHoraFimParada] = useState(format(new Date(), "HH:mm"));
  const [nomeLider, setNomeLider] = useState(currentUser?.full_name || "");

  const updateLinhaMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EmpilhaLinha.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empilha-linhas-all"] });
      queryClient.invalidateQueries({ queryKey: ["empilha-linhas"] });
    },
  });

  const updateOcorrenciaMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EmpilhaOcorrencia.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["empilha-ocorrencias"] }),
  });

  const updateParadaMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EmpilhadeiraParada.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empilha-paradas"] });
      queryClient.invalidateQueries({ queryKey: ["empilha-paradas-prog"] });
    },
  });

  const handleAssinarLider = (linha) => {
    const now = format(new Date(), "HH:mm");
    updateLinhaMutation.mutate({
      id: linha.id,
      data: {
        assinatura_lider: true,
        assinatura_lider_nome: nomeLider,
        assinatura_lider_hora: now,
        status_assinatura: "Completo",
      },
    });
  };

  const handleResolverOcorrencia = (id) => {
    if (!resolucaoTexto) return;
    updateOcorrenciaMutation.mutate({ id, data: { resolvido: true, resolucao: resolucaoTexto } });
    setResolvendo(null);
    setResolucaoTexto("");
  };

  const handleFecharParada = (parada) => {
    const inicio = parada.hora_inicio;
    const [h1, m1] = inicio.split(":").map(Number);
    const [h2, m2] = horaFimParada.split(":").map(Number);
    const tempo = (h2 * 60 + m2) - (h1 * 60 + m1);
    updateParadaMutation.mutate({
      id: parada.id,
      data: { hora_fim: horaFimParada, tempo_total: tempo > 0 ? `${tempo} min` : "0 min" },
    });
  };

  const getProgramacaoData = (id) => {
    const prog = programacoes.find(p => p.id === id);
    return prog?.data_programada || "";
  };

  /**
   * As cinco faixas de pendencia.
   *
   * A cor por faixa saiu: eram cinco paletas (uma delas, `bg-teal-100`, nem
   * token do sistema era) para distinguir abas que ja se distinguem pelo nome e
   * pela contagem. Cor aqui nao informava nada — decorava.
   */
  const ABAS = [
    { valor: "assinaturas", rotulo: "Assinaturas", contagem: linhasPendentesAssinatura.length },
    { valor: "ocorrencias", rotulo: "Ocorrências", contagem: ocorrenciasAbertas.length },
    { valor: "paradas", rotulo: "Paradas", contagem: paradasEmAberto.length },
    { valor: "manutencao", rotulo: "Manutenção", contagem: alertasManutencao.length },
    { valor: "limpeza", rotulo: "Limpeza",
      contagem: limpezasAtrasadas.length + limpezasAguardandoLider.length },
  ];
  if (totalPendencias === 0) return null;

  return (
    <section className="entra cartao-fluxo min-w-0">
      {/* O cabecalho era um `<CardHeader>` com `cursor-pointer` e um onClick:
          parecia clicavel para quem usa mouse e nao existia para quem usa
          teclado ou leitor de tela. Agora e um <button> de verdade, com
          `aria-expanded`. */}
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        className="press foco-fluxo flex min-h-[56px] w-full items-center justify-between gap-3
                   border-b border-borda px-5 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="text-base font-extrabold text-tinta">Pendências</span>
          <span className="num rounded-full bg-erro px-2.5 py-0.5 text-xs font-extrabold text-white">
            {totalPendencias}
          </span>
        </span>
        {aberto
          ? <ChevronUp className="h-4 w-4 flex-none text-texto-apagado" aria-hidden="true" />
          : <ChevronDown className="h-4 w-4 flex-none text-texto-apagado" aria-hidden="true" />}
      </button>

      {aberto && (
        <div className="flex min-w-0 flex-col gap-4 p-5">
          <ChipsFiltro
            rotulo="Faixa de pendência"
            opcoes={ABAS}
            valor={abaAtiva}
            aoEscolher={setAbaAtiva}
          />

          {/* Conteúdo — Assinaturas */}
          {abaAtiva === "assinaturas" && (
            <div className="space-y-2">
              <div className="space-y-2 mb-3">
                <label className="text-xs text-texto-fraco">Seu nome (líder):</label>
                <Input value={nomeLider} onChange={e => setNomeLider(e.target.value)} className="max-w-xs" placeholder="Nome do líder" />
              </div>
              {linhasPendentesAssinatura.length === 0 ? (
                <p className="text-texto-apagado text-sm">Nenhuma assinatura pendente.</p>
              ) : linhasPendentesAssinatura.map(l => (
                <div key={l.id} className="flex items-center gap-3 p-3 bg-marca-suave rounded-token border border-marca-suave-2">
                  <PenLine className="w-4 h-4 text-marca flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-tinta text-sm truncate">{l.descricao_produto || "Sem descrição"}</p>
                    <p className="text-xs text-texto-fraco">
                      {getProgramacaoData(l.programacao_id) && `${format(new Date(getProgramacaoData(l.programacao_id) + "T00:00:00"), "dd/MM")} · `}
                      {l.operador_empilhadeira} · Fim: {l.hora_termino}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-marca hover:bg-marca-forte flex-shrink-0"
                    onClick={() => handleAssinarLider(l)}
                    disabled={!nomeLider || updateLinhaMutation.isPending}
                  >
                    <PenLine className="w-3 h-3 mr-1" /> Assinar
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Conteúdo — Ocorrências */}
          {abaAtiva === "ocorrencias" && (
            <div className="space-y-2">
              {ocorrenciasAbertas.length === 0 ? (
                <p className="text-texto-apagado text-sm">Nenhuma ocorrência aberta.</p>
              ) : ocorrenciasAbertas.map(o => (
                <div key={o.id} className="p-3 bg-atencao-suave rounded-token border border-atencao space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-cartao px-2.5 py-0.5 text-[11px] font-extrabold text-atencao">{o.tipo}</span>
                        <span className="text-xs text-texto-fraco">{o.data} {o.hora} — {o.registrado_por}</span>
                      </div>
                      <p className="text-sm text-tinta-media mt-1">{o.descricao}</p>
                    </div>
                    <Button size="sm" variant="outline" className="border-atencao text-atencao flex-shrink-0" onClick={() => setResolvendo(o.id)}>
                      Resolver
                    </Button>
                  </div>
                  {resolvendo === o.id && (
                    <div className="space-y-2 pt-2 border-t border-atencao">
                      <Textarea value={resolucaoTexto} onChange={e => setResolucaoTexto(e.target.value)} placeholder="Descreva a resolução..." rows={2} />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setResolvendo(null)}>Cancelar</Button>
                        <Button size="sm" className="bg-ok hover:bg-ok" onClick={() => handleResolverOcorrencia(o.id)} disabled={!resolucaoTexto}>
                          <CheckCircle className="w-3 h-3 mr-1" /> Marcar como Resolvido
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Conteúdo — Paradas */}
          {abaAtiva === "paradas" && (
            <div className="space-y-2">
              {paradasEmAberto.length === 0 ? (
                <p className="text-texto-apagado text-sm">Nenhuma parada em aberto.</p>
              ) : paradasEmAberto.map(p => (
                <div key={p.id} className="p-3 bg-erro-suave rounded-token border border-erro space-y-2">
                  <div className="flex items-center gap-2">
                    <OctagonX className="w-4 h-4 text-erro" />
                    <div>
                      <p className="font-medium text-erro text-sm">{p.tipo} — desde {p.hora_inicio}</p>
                      <p className="text-xs text-texto-fraco">{p.data} · {p.descricao}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-texto-fraco">Hora de fim:</label>
                    <input type="time" value={horaFimParada} onChange={e => setHoraFimParada(e.target.value)} className="h-12 text-sm border rounded px-2" />
                    <Button size="sm" className="bg-erro hover:bg-erro" onClick={() => handleFecharParada(p)} disabled={updateParadaMutation.isPending}>
                      Registrar fim
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Conteúdo — Manutenção */}
          {abaAtiva === "manutencao" && (
            <div className="space-y-2">
              {alertasManutencao.length === 0 ? (
                <p className="text-texto-apagado text-sm">Nenhum alerta de manutenção.</p>
              ) : alertasManutencao.map(e => {
                const dias = differenceInDays(parseISO(e.data_proxima_manutencao), new Date());
                return (
                  <div key={e.id} className="flex items-center gap-3 p-3 bg-atencao-suave rounded-token border border-atencao">
                    <Wrench className="w-4 h-4 text-atencao flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-atencao text-sm">{e.nome}</p>
                      <p className="text-xs text-texto-fraco">
                        {dias < 0 ? `⚠️ Manutenção ATRASADA há ${Math.abs(dias)} dias!` : `Manutenção em ${dias} dia(s) — ${e.data_proxima_manutencao}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Conteúdo — Limpeza */}
          {abaAtiva === "limpeza" && (
            <div className="space-y-3">
              {limpezasAtrasadas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-erro mb-1.5">Limpezas atrasadas ({limpezasAtrasadas.length})</p>
                  <div className="space-y-1.5">
                    {limpezasAtrasadas.map(p => (
                      <div key={p.id} className="flex items-center gap-3 p-2.5 bg-erro-suave rounded-token border border-erro">
                        <Sparkles className="w-4 h-4 text-erro flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-erro text-sm">{p.local_nome}</p>
                          <p className="text-xs text-texto-fraco">{p.data_prevista} · {p.responsavel_nome} · {p.tipo_limpeza}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {limpezasAguardandoLider.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-atencao mb-1.5">Aguardando assinatura do líder ({limpezasAguardandoLider.length})</p>
                  <div className="space-y-1.5">
                    {limpezasAguardandoLider.map(p => (
                      <div key={p.id} className="flex items-center gap-3 p-2.5 bg-atencao-suave rounded-token border border-atencao">
                        <PenLine className="w-4 h-4 text-atencao flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-atencao text-sm">{p.local_nome}</p>
                          <p className="text-xs text-texto-fraco">{p.data_realizada || p.data_prevista} · {p.responsavel_nome}</p>
                        </div>
                        <Button size="sm" className="bg-atencao hover:bg-atencao flex-shrink-0 h-12 text-xs"
                          onClick={() => setModalAssinaturaLimpeza(p.id)}>
                          <PenLine className="w-3 h-3 mr-1" /> Assinar
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {limpezasAtrasadas.length === 0 && limpezasAguardandoLider.length === 0 && (
                <p className="text-texto-apagado text-sm">Nenhuma pendência de limpeza.</p>
              )}
            </div>
          )}
        </div>
      )}

      {modalAssinaturaLimpeza && (
        <ModalAssinaturaLimpeza
          open={!!modalAssinaturaLimpeza}
          onClose={() => setModalAssinaturaLimpeza(null)}
          programacao={limpezasProg.find(p => p.id === modalAssinaturaLimpeza)}
          currentUser={currentUser}
          isAdmin={true}
        />
      )}
    </section>
  );
}