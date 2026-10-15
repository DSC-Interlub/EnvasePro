import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/fluxo";
import { useCurrentOperator } from "@/lib/AuthContext";

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
  const { currentOperator } = useCurrentOperator();

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

  const iniciais = (currentOperator?.nome || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

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
              {currentOperator?.nome && (
                // No celular a barra superior do app ja mostra o operador do
                // turno; repetir aqui gastava uma linha inteira de uma tela de
                // 390px com a mesma informacao.
                <span className="hidden min-h-[48px] items-center gap-2.5 rounded-full bg-cartao
                                 pl-1.5 pr-4 text-sm font-bold text-tinta shadow-cartao sm:flex">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 items-center justify-center rounded-full
                               bg-marca-suave text-[13px] font-extrabold text-marca"
                  >
                    {iniciais}
                  </span>
                  {currentOperator.nome}
                </span>
              )}
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
