import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Save, Upload, User } from "lucide-react";

export default function OperatorForm({ operator, onClose }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(operator || {
    nome: "",
    matricula: "",
    sala: "",
    ativo: true,
    foto_url: ""
  });
  const [uploading, setUploading] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (operator) {
        return base44.entities.Operator.update(operator.id, data);
      }
      return base44.entities.Operator.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operators'] });
      onClose();
    },
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      setFormData(prev => ({ ...prev, foto_url: result.file_url }));
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert('Erro ao fazer upload da foto');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  return (
    <Card className="border-slate-200 shadow-lg">
      <CardHeader className="border-b border-slate-100">
        <div className="flex justify-between items-center">
          <CardTitle>{operator ? "Editar Operador" : "Novo Operador"}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome Completo *</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
              required
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="matricula">Matrícula</Label>
              <Input
                id="matricula"
                value={formData.matricula}
                onChange={(e) => setFormData(prev => ({ ...prev, matricula: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sala">Sala *</Label>
              <Select
                value={formData.sala}
                onValueChange={(value) => setFormData(prev => ({ ...prev, sala: value }))}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a sala" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bio">Bio</SelectItem>
                  <SelectItem value="Industrial">Industrial</SelectItem>
                  <SelectItem value="Ambas">Ambas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Upload de Foto */}
          <div className="space-y-2">
            <Label htmlFor="foto">Foto do Operador</Label>
            <div className="flex items-center gap-4">
              {formData.foto_url && (
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-slate-200">
                  <img 
                    src={formData.foto_url} 
                    alt={formData.nome}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              {!formData.foto_url && (
                <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center border-2 border-slate-200">
                  <User className="w-10 h-10 text-slate-400" />
                </div>
              )}
              <div className="flex-1">
                <Input
                  id="foto"
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="cursor-pointer"
                />
                {uploading && <p className="text-xs text-blue-600 mt-1">Fazendo upload...</p>}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="ativo"
              checked={formData.ativo}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, ativo: checked }))}
            />
            <Label htmlFor="ativo" className="cursor-pointer">
              Operador ativo
            </Label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saveMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}