import React, { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Save, Upload, User } from "lucide-react";

const operatorSchema = z.object({
  nome: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres"),
  // Matrícula é OPCIONAL: os 14 operadores reais em produção não têm matrícula
  // preenchida, e exigi-la impediria editar qualquer um deles.
  matricula: z.string().trim().optional().default(""),
  sala: z.enum(["Bio", "Industrial", "Ambas"], {
    errorMap: () => ({ message: "Selecione uma sala válida (Bio, Industrial ou Ambas)" })
  }),
  ativo: z.boolean().default(true),
  foto_url: z.string().optional().default("")
});

export default function OperatorForm({ operator, onClose }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(operatorSchema),
    defaultValues: {
      nome: operator?.nome || "",
      matricula: operator?.matricula || "",
      sala: operator?.sala || "",
      ativo: operator?.ativo !== undefined ? operator.ativo : true,
      foto_url: operator?.foto_url || ""
    }
  });

  const fotoUrl = watch("foto_url");

  // Prévia do upload recém-feito. Guardada separada de propósito: no banco vai o
  // CAMINHO do arquivo, não a URL assinada, que expira em 24h e é credencial.
  // A leitura (resolverFotosOperadores) assina o caminho de novo a cada consulta.
  const [previewUrl, setPreviewUrl] = useState(null);

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
      const result = await base44.integrations.Core.UploadFile({ file, bucket: 'fotos-operadores' });
      // Grava o CAMINHO, não a URL assinada: a assinada expira em 24h e ficaria
      // guardada no banco (e nos backups) como credencial válida.
      setValue("foto_url", result.file_path || result.file_url, { shouldValidate: true });
      setPreviewUrl(result.file_url || null);
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert('Erro ao fazer upload da foto');
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = (data) => {
    saveMutation.mutate(data);
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome Completo *</Label>
            <Input
              id="nome"
              {...register("nome")}
              placeholder="Ex.: Lucas Araujo"
            />
            {errors.nome && (
              <p className="text-xs text-red-600 font-medium">{errors.nome.message}</p>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="matricula">Matrícula</Label>
              <Input
                id="matricula"
                {...register("matricula")}
                placeholder="Ex.: 3804"
              />
              {errors.matricula && (
                <p className="text-xs text-red-600 font-medium">{errors.matricula.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sala">Sala *</Label>
              <Controller
                name="sala"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a sala" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bio">Bio</SelectItem>
                      <SelectItem value="Industrial">Industrial</SelectItem>
                      <SelectItem value="Ambas">Ambas</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.sala && (
                <p className="text-xs text-red-600 font-medium">{errors.sala.message}</p>
              )}
            </div>
          </div>

          {/* Upload de Foto */}
          <div className="space-y-2">
            <Label htmlFor="foto">Foto do Operador</Label>
            <div className="flex items-center gap-4">
              {(previewUrl || fotoUrl) ? (
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-slate-200">
                  <img
                    src={previewUrl || fotoUrl}
                    alt="Foto do operador"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
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
            <Controller
              name="ativo"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="ativo"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="ativo" className="cursor-pointer">
              Operador ativo
            </Label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saveMutation.isPending || uploading}>
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}