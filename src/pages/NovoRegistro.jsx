import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

import EnvaseForm from "../components/registro/EnvaseForm";

export default function NovoRegistro() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    staleTime: Infinity,
  });

  const { data: embalagens = [] } = useQuery({
    queryKey: ['embalagens'],
    queryFn: () => base44.entities.Embalagem.list(),
    staleTime: Infinity,
  });

  const { data: operators = [] } = useQuery({
    queryKey: ['operators'],
    queryFn: () => base44.entities.Operator.filter({ ativo: true }),
    staleTime: Infinity,
  });

  const createRecordMutation = useMutation({
    mutationFn: (data) => base44.entities.EnvaseRecord.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envase-records'] });
      queryClient.invalidateQueries({ queryKey: ['envase-live'] });
      navigate(createPageUrl("Dashboard"));
    },
    onError: (error) => {
      setError("Erro ao salvar registro. Verifique os campos obrigatórios.");
    }
  });

  const handleSubmit = (formData) => {
    setError(null);
    // Apenas finalizar, não criar novo registro (já foi criado pelo auto-save)
    navigate(createPageUrl("Dashboard"));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(createPageUrl("Dashboard"))}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Novo Registro de Envase - Operações Interlub</h1>
            <p className="text-slate-600 mt-1">Preencha os dados da produção</p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-xl font-bold text-slate-900">
              Dados do Envase
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <EnvaseForm
              products={products}
              embalagens={embalagens}
              operators={operators}
              onSubmit={handleSubmit}
              isLoading={createRecordMutation.isPending}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}