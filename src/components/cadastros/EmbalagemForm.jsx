import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Save } from "lucide-react";

export default function EmbalagemForm({ embalagem, onClose }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(embalagem || {
    codigo: "",
    descricao: "",
    conteudo: "",
    tipo: "",
    conteudo_ext: "",
    ultimos_4_digitos: ""
  });

  useEffect(() => {
    if (formData.codigo && formData.codigo.length >= 4) {
      const last4 = formData.codigo.slice(-4);
      setFormData(prev => ({ ...prev, ultimos_4_digitos: last4 }));
    }
  }, [formData.codigo]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (embalagem) {
        return base44.entities.Embalagem.update(embalagem.id, data);
      }
      return base44.entities.Embalagem.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embalagens'] });
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  return (
    <Card className="border-slate-200 shadow-lg">
      <CardHeader className="border-b border-slate-100">
        <div className="flex justify-between items-center">
          <CardTitle>{embalagem ? "Editar Embalagem" : "Nova Embalagem"}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="codigo">Código *</Label>
              <Input
                id="codigo"
                value={formData.codigo}
                onChange={(e) => setFormData(prev => ({ ...prev, codigo: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo *</Label>
              <Input
                id="tipo"
                value={formData.tipo}
                onChange={(e) => setFormData(prev => ({ ...prev, tipo: e.target.value }))}
                placeholder="Ex: Pote, Frasco, Bisnaga"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição *</Label>
            <Input
              id="descricao"
              value={formData.descricao}
              onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
              required
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="conteudo">Conteúdo (Quantidade) *</Label>
              <Input
                id="conteudo"
                type="number"
                value={formData.conteudo}
                onChange={(e) => setFormData(prev => ({ ...prev, conteudo: parseFloat(e.target.value) }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="conteudo_ext">Conteúdo Externo</Label>
              <Input
                id="conteudo_ext"
                value={formData.conteudo_ext}
                onChange={(e) => setFormData(prev => ({ ...prev, conteudo_ext: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ultimos_4_digitos">Últimos 4 Dígitos (Auto-preenchido)</Label>
            <Input
              id="ultimos_4_digitos"
              value={formData.ultimos_4_digitos}
              disabled
              className="bg-slate-100"
            />
            <p className="text-xs text-slate-500">
              Gerado automaticamente dos últimos 4 caracteres do código
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              <Save className="w-4 h-4 mr-2" />
              Salvar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}