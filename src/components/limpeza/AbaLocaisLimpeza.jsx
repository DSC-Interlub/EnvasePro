import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MapPin, Plus, Pencil, Eye, EyeOff } from "lucide-react";
import ModalLimpezaLocal from "./ModalLimpezaLocal";

export default function AbaLocaisLimpeza() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const { data: locais } = useQuery({
    queryKey: ["limpeza-locais"],
    queryFn: () => base44.entities.LimpezaLocal.list("nome"),
    initialData: [],
  });

  const { data: programacoes } = useQuery({
    queryKey: ["limpeza-programacoes"],
    queryFn: () => base44.entities.LimpezaProgramacao.list(),
    initialData: [],
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, ativo }) => base44.entities.LimpezaLocal.update(id, { ativo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["limpeza-locais"] }),
  });

  const tipoColor = {
    "Sala": "bg-marca-suave text-marca",
    "Galpão": "bg-atencao-suave text-atencao",
    "Banheiro": "bg-marca-suave text-marca",
    "Área externa": "bg-ok-suave text-ok",
    "Corredor": "bg-fundo text-tinta-media",
    "Outro": "bg-fundo text-tinta-media",
  };

  const temProgramacoes = (id) => programacoes.some(p => p.local_id === id);
  const listaFiltrada = mostrarInativos ? locais : locais.filter(l => l.ativo !== false);

  const handleEditar = (local) => {
    setEditando(local);
    setModalOpen(true);
  };

  const handleNovo = () => {
    setEditando(null);
    setModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMostrarInativos(!mostrarInativos)}
            className="flex items-center gap-2 text-sm text-texto-fraco hover:text-tinta-media"
          >
            {mostrarInativos ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {mostrarInativos ? "Ocultar inativos" : "Mostrar inativos"}
          </button>
        </div>
        <Button className="bg-marca hover:bg-marca-forte" onClick={handleNovo}>
          <Plus className="w-4 h-4 mr-2" /> Novo Local
        </Button>
      </div>

      <Card className="border-borda">
        <CardHeader className="border-b border-borda py-3 px-4">
          <CardTitle className="text-sm font-semibold text-tinta-media flex items-center gap-2">
            <MapPin className="w-4 h-4 text-marca" />
            Locais cadastrados ({listaFiltrada.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {listaFiltrada.length === 0 ? (
            <div className="text-center py-10 text-texto-apagado">
              <MapPin className="w-10 h-10 mx-auto mb-2 text-texto-apagado" />
              <p>Nenhum local cadastrado</p>
            </div>
          ) : (
            <div className="divide-y divide-borda">
              {listaFiltrada.map(local => (
                <div key={local.id} className={`flex items-center justify-between px-4 py-3 hover:bg-fundo transition-colors ${local.ativo === false ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-tinta text-sm">{local.nome}</span>
                        <Badge className={`text-xs ${tipoColor[local.tipo] || "bg-fundo text-tinta-media"}`}>{local.tipo}</Badge>
                        {local.ativo === false && <Badge className="text-xs bg-erro-suave text-erro">Inativo</Badge>}
                      </div>
                      {local.descricao && <p className="text-xs text-texto-fraco mt-0.5">{local.descricao}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button aria-label="Editar" size="sm" variant="ghost" onClick={() => handleEditar(local)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Switch
                      checked={local.ativo !== false}
                      onCheckedChange={(v) => {
                        if (!v && temProgramacoes(local.id)) {
                          // Apenas desativar, não excluir
                        }
                        toggleMutation.mutate({ id: local.id, ativo: v });
                      }}
                      title={temProgramacoes(local.id) ? "Este local tem programações — apenas desativar" : ""}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ModalLimpezaLocal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditando(null); }}
        local={editando}
      />
    </div>
  );
}