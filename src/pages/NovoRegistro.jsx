import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/fluxo";

import EnvaseForm from "../components/registro/EnvaseForm";

/**
 * Padrão Formulário do protótipo: cabeçalho com migalha, título de 38px e o
 * operador à direita — e o formulário entregando os próprios cartões.
 *
 * O cartão externo "Dados do Envase" SAIU de propósito. Ele embrulhava o
 * formulário inteiro num segundo quadro, então cada campo ficava dentro de
 * cartão dentro de cartão, e o título repetia o que o `<h1>` já dizia.
 */
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
    onError: () => {
      setError("Erro ao salvar registro. Verifique os campos obrigatórios.");
    }
  });

  const handleSubmit = () => {
    setError(null);
    // Apenas finalizar, não criar novo registro (já foi criado pelo auto-save)
    navigate(createPageUrl("Dashboard"));
  };

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="mx-auto flex max-w-[1180px] min-w-0 flex-col gap-4">
        <PageHeader
          migalha={[
            { rotulo: 'Envase' },
            { rotulo: 'Novo registro' },
          ]}
          titulo="Novo registro"
          legenda="Produto, quantidade e os dados da produção"
          acoes={
            <>
              <Button
                variant="outline"
                size="lg"
                onClick={() => navigate(createPageUrl("Dashboard"))}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar
              </Button>
            </>
          }
        />

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <EnvaseForm
          products={products}
          embalagens={embalagens}
          operators={operators}
          onSubmit={handleSubmit}
          isLoading={createRecordMutation.isPending}
        />
      </div>
    </div>
  );
}
