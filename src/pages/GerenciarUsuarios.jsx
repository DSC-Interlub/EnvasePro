import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { useLocation } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Settings, Package, Box, Mail } from "lucide-react";
import GestaoUsuarios from "@/components/usuarios/GestaoUsuarios";
import AbaProgramacaoLimpeza from "@/components/limpeza/AbaProgramacaoLimpeza";
import AbaOperadores from "@/components/configuracoes/AbaOperadores";
import AbaProdutos from "@/components/configuracoes/AbaProdutos";
import AbaEmbalagens from "@/components/configuracoes/AbaEmbalagens";
import AbaNotificacaoDestinatarios from "@/components/configuracoes/AbaNotificacaoDestinatarios";

export default function GerenciarUsuarios() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const location = useLocation();

  // Detectar aba inicial pela query string ?aba=limpeza
  const abaInicial = new URLSearchParams(location.search).get("aba") || "usuarios";

  // Pré-busca para eliminar delay ao navegar nas abas
  useQuery({ queryKey: ["products"], queryFn: () => base44.entities.Product.list("codigo"), staleTime: 60000 });
  useQuery({ queryKey: ["embalagens"], queryFn: () => base44.entities.Embalagem.list("codigo"), staleTime: 60000 });
  useQuery({ queryKey: ["operators"], queryFn: () => base44.entities.Operator.list("nome"), staleTime: 60000 });

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-marca rounded-painel flex items-center justify-center">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-tinta">Configurações</h1>
            <p className="text-sm text-texto-fraco">Gerencie usuários, locais e programações de limpeza</p>
          </div>
        </div>

        <Tabs defaultValue={abaInicial}>
          <TabsList className="bg-cartao border border-borda flex-wrap h-auto gap-1">
            <TabsTrigger value="usuarios" className="flex items-center gap-2">
              <Users className="w-4 h-4" /> Usuários
            </TabsTrigger>
            <TabsTrigger value="operadores" className="flex items-center gap-2">
              <Users className="w-4 h-4" /> Operadores
            </TabsTrigger>
            <TabsTrigger value="produtos" className="flex items-center gap-2">
              <Package className="w-4 h-4" /> Produtos
            </TabsTrigger>
            <TabsTrigger value="embalagens" className="flex items-center gap-2">
              <Box className="w-4 h-4" /> Embalagens
            </TabsTrigger>
            <TabsTrigger value="limpeza" className="flex items-center gap-2">
              Programação de Limpeza
            </TabsTrigger>
            <TabsTrigger value="destinatarios" className="flex items-center gap-2">
              <Mail className="w-4 h-4" /> Alertas de Ocorrência
            </TabsTrigger>

          </TabsList>

          {/* ABA USUÁRIOS */}
          <TabsContent value="usuarios" className="mt-4">
            {/* Criar, editar, resetar senha, desativar e excluir contas.
                Tudo pelo servidor (/api/admin-usuarios); ver GestaoUsuarios. */}
            <GestaoUsuarios />
          </TabsContent>

          {/* ABA OPERADORES */}
          <TabsContent value="operadores" className="mt-4">
            <AbaOperadores />
          </TabsContent>

          {/* ABA PRODUTOS */}
          <TabsContent value="produtos" className="mt-4">
            <AbaProdutos />
          </TabsContent>

          {/* ABA EMBALAGENS */}
          <TabsContent value="embalagens" className="mt-4">
            <AbaEmbalagens />
          </TabsContent>

          {/* ABA PROGRAMAÇÃO DE LIMPEZA (inclui locais internamente) */}
          <TabsContent value="limpeza" className="mt-4">
            <AbaProgramacaoLimpeza currentUser={currentUser} isAdmin={isAdmin} />
          </TabsContent>

          {/* ABA DESTINATÁRIOS DE ALERTA DE OCORRÊNCIA */}
          <TabsContent value="destinatarios" className="mt-4">
            <AbaNotificacaoDestinatarios isAdmin={isAdmin} />
          </TabsContent>

        </Tabs>

      </div>
    </div>
  );
}