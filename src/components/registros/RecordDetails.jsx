import React from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Edit, Package, CheckCircle } from "lucide-react";
import { format } from "date-fns";

export default function RecordDetails({ record, onClose, onEdit }) {
  const queryClient = useQueryClient();

  const marcarRetiradoMutation = useMutation({
    mutationFn: () => base44.entities.EnvaseRecord.update(record.id, { material_retirado: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envase-records'] });
      queryClient.invalidateQueries({ queryKey: ['envase-live'] });
      onClose();
    },
  });

  const handleMarcarRetirado = () => {
    if (confirm("Confirmar que o material foi retirado da sala?")) {
      marcarRetiradoMutation.mutate();
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle className="text-2xl font-bold text-tinta">
              Detalhes do Registro
            </DialogTitle>
            <div className="flex gap-2">
              {record.sala === "Bio" && record.termino && !record.material_retirado && (
                <Button
                  onClick={handleMarcarRetirado}
                  className="bg-ok hover:bg-ok"
                  disabled={marcarRetiradoMutation.isPending}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Material Retirado
                </Button>
              )}
              <Button variant="outline" onClick={onEdit}>
                <Edit className="w-4 h-4 mr-2" />
                Editar
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Status do Material (Bio) */}
          {record.sala === "Bio" && (
            <div className="p-4 bg-marca-suave rounded-token border border-marca-suave-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-tinta mb-1">Status do Material</h3>
                  <p className="text-sm text-marca">
                    {record.material_retirado ? (
                      <span className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Material já foi retirado da sala
                      </span>
                    ) : record.termino ? (
                      <span className="flex items-center gap-2 text-atencao">
                        <Package className="w-4 h-4" />
                        Material pronto aguardando retirada
                      </span>
                    ) : (
                      "Material em produção"
                    )}
                  </p>
                </div>
                {record.material_retirado && (
                  <Badge className="bg-ok text-white">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Retirado
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Informações Básicas */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-tinta-media mb-3">Informações Básicas</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-texto-fraco">Data:</span>
                  <span className="font-semibold">{format(new Date(record.data), "dd/MM/yyyy")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-texto-fraco">Sala:</span>
                  <Badge variant={record.sala === "Bio" ? "default" : "secondary"}>{record.sala}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-texto-fraco">OP:</span>
                  <span className="font-mono font-semibold">{record.op}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-texto-fraco">Operador:</span>
                  <span className="font-semibold">{record.operador}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-tinta-media mb-3">Produto</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-texto-fraco">Código:</span>
                  <span className="font-mono font-semibold">{record.codigo_produto}</span>
                </div>
                <div>
                  <span className="text-texto-fraco block mb-1">Descrição:</span>
                  <span className="font-semibold">{record.descricao_produto}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-texto-fraco">Consistência:</span>
                  <span className="font-semibold">{record.consistencia}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}