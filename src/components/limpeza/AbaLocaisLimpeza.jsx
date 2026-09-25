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
    "Sala": "bg-blue-100 text-blue-700",
    "Galpão": "bg-amber-100 text-amber-700",
    "Banheiro": "bg-purple-100 text-purple-700",
    "Área externa": "bg-green-100 text-green-700",
    "Corredor": "bg-slate-100 text-slate-700",
    "Outro": "bg-gray-100 text-gray-700",
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
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
          >
            {mostrarInativos ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {mostrarInativos ? "Ocultar inativos" : "Mostrar inativos"}
          </button>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleNovo}>
          <Plus className="w-4 h-4 mr-2" /> Novo Local
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="border-b border-slate-100 py-3 px-4">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-500" />
            Locais cadastrados ({listaFiltrada.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {listaFiltrada.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <MapPin className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p>Nenhum local cadastrado</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {listaFiltrada.map(local => (
                <div key={local.id} className={`flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors ${local.ativo === false ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 text-sm">{local.nome}</span>
                        <Badge className={`text-xs ${tipoColor[local.tipo] || "bg-gray-100 text-gray-700"}`}>{local.tipo}</Badge>
                        {local.ativo === false && <Badge className="text-xs bg-red-100 text-red-600">Inativo</Badge>}
                      </div>
                      {local.descricao && <p className="text-xs text-slate-500 mt-0.5">{local.descricao}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => handleEditar(local)}>
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