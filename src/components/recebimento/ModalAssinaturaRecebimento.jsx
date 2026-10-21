import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SelectOperador from "@/components/operadores/SelectOperador";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, PenLine, Clock } from "lucide-react";
import { format } from "date-fns";

export default function ModalAssinaturaRecebimento({ open, onClose, recebimento, participantes, currentUser, isAdmin }) {
  const queryClient = useQueryClient();
  const [etapa, setEtapa] = useState("participantes");
  const [assinandoId, setAssinandoId] = useState(null);
  const [confirmado, setConfirmado] = useState(false);
  // O líder é escolhido na lista de operadores, sem pré-preenchimento.
  const [nomeLider, setNomeLider] = useState(null);
  const [participantesLocais, setParticipantesLocais] = useState([]);

  useEffect(() => {
    if (!recebimento) return;
    setParticipantesLocais(participantes || []);
    setConfirmado(false);
    setAssinandoId(null);
    setNomeLider(null);
    const todosAssinaram = participantes?.length > 0 && participantes.every(p => p.assinou);
    setEtapa(todosAssinaram ? "lider" : "participantes");
  }, [recebimento, open, participantes]);

  const mutParticipante = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RecebimentoParticipante.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recebimento-participantes", recebimento?.id] }),
  });

  const mutRecebimento = useMutation({
    mutationFn: (data) => base44.entities.Recebimento.update(recebimento.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recebimentos"] });
      queryClient.invalidateQueries({ queryKey: ["recebimento", recebimento.id] });
    },
  });

  const handleAssinarParticipante = (participante) => {
    const dt = new Date().toISOString();
    const novos = participantesLocais.map(p => p.id === participante.id ? { ...p, assinou: true, assinatura_datetime: dt } : p);
    setParticipantesLocais(novos);
    setAssinandoId(null);
    setConfirmado(false);

    mutParticipante.mutate({ id: participante.id, data: { assinou: true, assinatura_datetime: dt } });

    const todosAssinaram = novos.every(p => p.assinou);
    if (todosAssinaram) {
      mutRecebimento.mutate({
        assinatura_coordenador: true,
        assinatura_coordenador_nome: novos.filter(p => p.funcao === "Coordenador").map(p => p.operator_nome).join(", ") || recebimento.coordenador_nome,
        assinatura_coordenador_datetime: dt,
        status_assinatura: "Parcial",
      }, { onSuccess: () => setEtapa("lider") });
    }
  };

  const handleAssinarLider = () => {
    const dt = new Date().toISOString();
    mutRecebimento.mutate({
      assinatura_lider: true,
      assinatura_lider_nome: nomeLider?.nome,
      assinatura_lider_datetime: dt,
      status_assinatura: "Completo",
    }, { onSuccess: onClose });
  };

  if (!recebimento) return null;

  const pendentes = participantesLocais.filter(p => !p.assinou);
  const assinados = participantesLocais.filter(p => p.assinou);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="w-5 h-5 text-marca" />
            Assinaturas — {recebimento.numero_documento}
          </DialogTitle>
        </DialogHeader>

        {etapa === "participantes" && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-texto-fraco">Cada participante deve assinar individualmente.</p>

            {assinados.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-3 bg-ok-suave rounded-token border border-ok">
                <CheckCircle className="w-4 h-4 text-ok shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-ok">{p.operator_nome} <span className="text-xs text-ok">({p.funcao})</span></p>
                  <p className="text-xs text-ok flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {p.assinatura_datetime ? format(new Date(p.assinatura_datetime), "dd/MM HH:mm") : ""}
                  </p>
                </div>
              </div>
            ))}

            {pendentes.map(p => (
              <div key={p.id} className="border border-borda rounded-token overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-fundo">
                  <div>
                    <span className="text-sm font-medium text-tinta-media">{p.operator_nome}</span>
                    <span className="text-xs text-texto-apagado ml-2">({p.funcao})</span>
                  </div>
                  {assinandoId !== p.id && (
                    <Button size="sm" variant="outline" className="h-12 text-xs"
                      onClick={() => { setAssinandoId(p.id); setConfirmado(false); }}>
                      Assinar
                    </Button>
                  )}
                </div>
                {assinandoId === p.id && (
                  <div className="p-3 space-y-3 border-t border-borda">
                    <div className="flex items-center gap-3 p-3 bg-marca-suave rounded-token border border-marca-suave-2">
                      <Checkbox id={`cf-${p.id}`} checked={confirmado} onCheckedChange={setConfirmado} />
                      <label htmlFor={`cf-${p.id}`} className="text-sm text-marca cursor-pointer">
                        Confirmo minha participação neste recebimento.
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setAssinandoId(null)}>Cancelar</Button>
                      <Button size="sm" className="flex-1 bg-marca hover:bg-marca-forte"
                        disabled={!confirmado || mutParticipante.isPending}
                        onClick={() => handleAssinarParticipante(p)}>
                        Confirmar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Fechar</Button>
            </DialogFooter>
          </div>
        )}

        {etapa === "lider" && (
          <div className="space-y-4 py-2">
            <div className="p-3 bg-ok-suave rounded-token border border-ok">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-ok" />
                <p className="text-sm font-medium text-ok">Todos os participantes assinaram</p>
              </div>
              {assinados.map(p => (
                <p key={p.id} className="text-xs text-ok ml-6">
                  {p.operator_nome} ({p.funcao}) — {p.assinatura_datetime ? format(new Date(p.assinatura_datetime), "dd/MM HH:mm") : ""}
                </p>
              ))}
            </div>

            <p className="text-sm text-texto-fraco">Assinatura do líder (somente admin)</p>

            {recebimento.assinatura_lider ? (
              <div className="flex items-center gap-3 p-3 bg-ok-suave rounded-token border border-ok">
                <CheckCircle className="w-4 h-4 text-ok" />
                <div>
                  <p className="text-sm font-medium text-ok">Líder já assinou</p>
                  <p className="text-xs text-ok">
                    {recebimento.assinatura_lider_nome} — {recebimento.assinatura_lider_datetime ? format(new Date(recebimento.assinatura_lider_datetime), "dd/MM HH:mm") : ""}
                  </p>
                </div>
              </div>
            ) : isAdmin ? (
              <>
                <SelectOperador
                  id="assina-lider-recebimento"
                  rotulo="Líder"
                  placeholder="Selecione o líder"
                  obrigatorio
                  valor={nomeLider?.id}
                  aoEscolher={setNomeLider}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={onClose}>Fechar</Button>
                  <Button className="bg-ok hover:bg-ok" onClick={handleAssinarLider}
                    disabled={!nomeLider || mutRecebimento.isPending}>
                    Assinar como Líder
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <div className="p-3 bg-atencao-suave rounded-token border border-atencao">
                  <p className="text-sm text-atencao">Aguardando assinatura do líder.</p>
                </div>
                <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}