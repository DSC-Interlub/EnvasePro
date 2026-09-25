import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Save, CheckCircle } from "lucide-react";

export default function ProductForm({ product, onClose }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(product || {
    codigo: "",
    nome: "",
    unidade_medida: "",
    consistencia: "",
    nsf_3h: false,
    nsf_h1: false,
    halal: false,
    kosher: false
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (product) {
        return base44.entities.Product.update(product.id, data);
      }
      return base44.entities.Product.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
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
          <CardTitle>{product ? "Editar Produto" : "Novo Produto"}</CardTitle>
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
              <Label htmlFor="unidade_medida">Unidade de Medida</Label>
              <Input
                id="unidade_medida"
                value={formData.unidade_medida}
                onChange={(e) => setFormData(prev => ({ ...prev, unidade_medida: e.target.value }))}
                placeholder="Ex: L, KG, ML"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nome">Nome do Produto *</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="consistencia">Consistência *</Label>
            <Input
              id="consistencia"
              value={formData.consistencia}
              onChange={(e) => setFormData(prev => ({ ...prev, consistencia: e.target.value }))}
              placeholder="Ex: 2, x, 0-00, 100-320"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="categoria">Categoria</Label>
            <Select
              value={formData.categoria || ""}
              onValueChange={(value) => setFormData(prev => ({ ...prev, categoria: value }))}
            >
              <SelectTrigger id="categoria">
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Graxa">Graxa</SelectItem>
                <SelectItem value="Óleo">Óleo</SelectItem>
                <SelectItem value="Pasta">Pasta</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Certificações */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <Label className="text-base font-semibold">Certificações</Label>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <Checkbox
                  id="nsf_3h"
                  checked={formData.nsf_3h}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, nsf_3h: checked }))}
                />
                <label
                  htmlFor="nsf_3h"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4 text-blue-600" />
                  NSF 3H
                </label>
              </div>

              <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <Checkbox
                  id="nsf_h1"
                  checked={formData.nsf_h1}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, nsf_h1: checked }))}
                />
                <label
                  htmlFor="nsf_h1"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  NSF H1
                </label>
              </div>

              <div className="flex items-center space-x-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                <Checkbox
                  id="halal"
                  checked={formData.halal}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, halal: checked }))}
                />
                <label
                  htmlFor="halal"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4 text-purple-600" />
                  HALAL
                </label>
              </div>

              <div className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <Checkbox
                  id="kosher"
                  checked={formData.kosher}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, kosher: checked }))}
                />
                <label
                  htmlFor="kosher"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4 text-slate-600" />
                  KOSHER
                </label>
              </div>
            </div>
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