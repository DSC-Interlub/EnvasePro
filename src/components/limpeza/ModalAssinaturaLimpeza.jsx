import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, PenLine, Clock } from "lucide-react";
import { format } from "date-fns";

// Monta lista de assinaturas a partir da programação (suporte a registros antigos)
function buildAssinaturas(programacao) {
  if (programacao?.assinaturas_responsaveis?.length > 0) {
    return programacao.assinaturas_responsaveis.map(a => ({ ...a }));
  }
  // compatibilidade: registro antigo com responsavel único
  const responsaveis = programacao?.responsaveis || [];
  if (responsaveis.length > 0) {
    return responsaveis.map(r => ({
      id: r.id,
      nome: r.nome,
      assinado: programacao?.assinatura_responsavel && programacao?.assinatura_responsavel_nome?.includes(r.nome),
      hora: programacao?.assinatura_responsavel ? programacao?.assinatura_responsavel_hora : null,
    }));
  }
  // fallback: campo único antigo
  if (programacao?.responsavel_nome) {
    return [{
      id: "unico",
      nome: programacao.responsavel_nome,
      assinado: !!programacao?.assinatura_responsavel,
      hora: programacao?.assinatura_responsavel_hora || null,
    }];
  }
  return [];
}

export default function ModalAssinaturaLimpeza({ open, onClose, programacao, currentUser, isAdmin }) {
  const queryClient = useQueryClient();

  // Etapa: "responsaveis" ou "lider"
  const [etapa, setEtapa] = useState("responsaveis");
  const [assinaturas, setAssinaturas] = useState([]);
  const [assinandoId, setAssinandoId] = useState(null); // qual responsável está assinando agora
  const [confirmado, setConfirmado] = useState(false);
  const [nomeLider, setNomeLider] = useState("");

  useEffect(() => {
    if (!programacao) return;
    const lista = buildAssinaturas(programacao);
    setAssinaturas(lista);
    setConfirmado(false);
    setAssinandoId(null);
    setNomeLider(currentUser?.full_name || "");
    // Se todos responsáveis já assinaram, ir direto para etapa do líder
    const todosAssinaram = lista.length > 0 && lista.every(a => a.assinado);
    setEtapa(todosAssinaram ? "lider" : "responsaveis");
  }, [programacao, open]);

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.LimpezaProgramacao.update(programacao.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["limpeza-programacoes"] }),
  });

  const handleAssinarResponsavel = (id) => {
    const hora = format(new Date(), "HH:mm");
    const novas = assinaturas.map(a => a.id === id ? { ...a, assinado: true, hora } : a);
    setAssinaturas(novas);
    setAssinandoId(null);
    setConfirmado(false);

    const todosAssinaram = novas.every(a => a.assinado);
    const nomesAssinados = novas.filter(a => a.assinado).map(a => a.nome).join(", ");

    const payload = {
      assinaturas_responsaveis: novas,
      assinatura_responsavel: todosAssinaram,
      assinatura_responsavel_nome: nomesAssinados,
      assinatura_responsavel_hora: hora,
      status_assinatura: todosAssinaram ? "Parcial" : "Parcial",
    };
    mutation.mutate(payload, {
      onSuccess: () => {
        if (todosAssinaram) setEtapa("lider");
      }
    });
  };

  const handleAssinarLider = () => {
    const hora = format(new Date(), "HH:mm");
    mutation.mutate({
      assinatura_lider: true,
      assinatura_lider_nome: nomeLider,
      assinatura_lider_hora: hora,
      status_assinatura: "Completo",
    }, { onSuccess: onClose });
  };

  if (!programacao) return null;

  const pendentes = assinaturas.filter(a => !a.assinado);
  const assinados = assinaturas.filter(a => a.assinado);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="w-5 h-5 text-blue-600" />
            Assinatura — {programacao.local_nome}
          </DialogTitle>
        </DialogHeader>

        {/* Etapa responsáveis */}
        {etapa === "responsaveis" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-500">Cada responsável deve assinar individualmente.</p>

            {/* Já assinaram */}
            {assinados.map(a => (
              <div key={a.id} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800">{a.nome}</p>
                  <p className="text-xs text-green-600 flex items-center gap-1"><Clock className="w-3 h-3" />{a.hora}</p>
                </div>
              </div>
            ))}

            {/* Pendentes */}
            {pendentes.map(a => (
              <div key={a.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-slate-50">
                  <span className="text-sm font-medium text-slate-700">{a.nome}</span>
                  {assinandoId !== a.id && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAssinandoId(a.id); setConfirmado(false); }}>
                      Assinar
                    </Button>
                  )}
                </div>
                {assinandoId === a.id && (
                  <div className="p-3 space-y-3 border-t border-slate-200">
                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <Checkbox id={`confirma-${a.id}`} checked={confirmado} onCheckedChange={setConfirmado} />
                      <label htmlFor={`confirma-${a.id}`} className="text-sm text-blue-800 cursor-pointer">
                        Confirmo que realizei a limpeza conforme programado.
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setAssinandoId(null)}>Cancelar</Button>
                      <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700"
                        disabled={!confirmado || mutation.isPending}
                        onClick={() => handleAssinarResponsavel(a.id)}>
                        Confirmar assinatura
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

        {/* Etapa líder */}
        {etapa === "lider" && (
          <div className="space-y-4 py-2">
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <p className="text-sm font-medium text-green-800">Todos os responsáveis assinaram</p>
              </div>
              {assinados.map(a => (
                <p key={a.id} className="text-xs text-green-600 ml-6">{a.nome} — {a.hora}</p>
              ))}
            </div>

            <p className="text-sm text-slate-600">Assinatura do líder (somente admin)</p>

            {programacao.assinatura_lider ? (
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-800">Líder já assinou</p>
                  <p className="text-xs text-green-600">{programacao.assinatura_lider_nome} — {programacao.assinatura_lider_hora}</p>
                </div>
              </div>
            ) : isAdmin ? (
              <>
                <div>
                  <Label>Nome do líder</Label>
                  <Input value={nomeLider} onChange={e => setNomeLider(e.target.value)} placeholder="Nome do líder..." />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={onClose}>Fechar</Button>
                  <Button className="bg-green-600 hover:bg-green-700" onClick={handleAssinarLider}
                    disabled={!nomeLider || mutation.isPending}>
                    Assinar como Líder
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm text-amber-700">Aguardando assinatura do líder (somente admins podem assinar).</p>
              </div>
            )}

            {!programacao.assinatura_lider && (
              <DialogFooter>
                <Button variant="outline" onClick={onClose}>Fechar</Button>
              </DialogFooter>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}