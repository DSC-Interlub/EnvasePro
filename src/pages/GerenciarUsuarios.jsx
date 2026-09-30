import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, ShieldAlert, Info, Settings, Package, Box, Mail } from "lucide-react";
import AbaProgramacaoLimpeza from "@/components/limpeza/AbaProgramacaoLimpeza";
import AbaOperadores from "@/components/configuracoes/AbaOperadores";
import AbaProdutos from "@/components/configuracoes/AbaProdutos";
import AbaEmbalagens from "@/components/configuracoes/AbaEmbalagens";
import AbaNotificacaoDestinatarios from "@/components/configuracoes/AbaNotificacaoDestinatarios";

export default function GerenciarUsuarios() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const queryClient = useQueryClient();
  const location = useLocation();

  // Detectar aba inicial pela query string ?aba=limpeza
  const abaInicial = new URLSearchParams(location.search).get("aba") || "usuarios";

  const [confirmModal, setConfirmModal] = useState(null);

  // Pré-busca para eliminar delay ao navegar nas abas
  useQuery({ queryKey: ["products"], queryFn: () => base44.entities.Product.list("codigo"), staleTime: 60000 });
  useQuery({ queryKey: ["embalagens"], queryFn: () => base44.entities.Embalagem.list("codigo"), staleTime: 60000 });
  useQuery({ queryKey: ["operators"], queryFn: () => base44.entities.Operator.list("nome"), staleTime: 60000 });


  const { data: users, isLoading } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await base44.functions.invoke("listarUsuarios", {});
      return res.data.users || [];
    },
    initialData: [],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, role }) => base44.functions.invoke("atualizarRoleUsuario", { userId: id, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
      setConfirmModal(null);
    },
  });

  const handleAlterarRole = (u) => {
    const novoRole = u.role === "admin" ? "operator" : "admin";
    if (u.id === currentUser?.id && u.role === "admin") return;
    setConfirmModal({ user: u, novoRole });
  };

  const roleLabel = (role) => role === "admin" ? "Admin" : "Operador";
  const roleBadge = (role) =>
    role === "admin"
      ? "bg-blue-100 text-blue-800 border-blue-200"
      : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
            <p className="text-sm text-slate-500">Gerencie usuários, locais e programações de limpeza</p>
          </div>
        </div>

        <Tabs defaultValue={abaInicial}>
          <TabsList className="bg-white border border-slate-200 flex-wrap h-auto gap-1">
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
          <TabsContent value="usuarios" className="space-y-4 mt-4">
            <Alert className="border-blue-200 bg-blue-50">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800 text-sm">
                <strong>Admin:</strong> Acesso total — criar programações, ver indicadores, assinar como líder, gerenciar configurações.<br />
                <strong>Operador:</strong> Executar linhas, registrar ocorrências, assinar como operador/ajudante.
              </AlertDescription>
            </Alert>
            <Card className="border-slate-200 shadow-md">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                  Usuários ({users.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex justify-center py-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">Nenhum usuário encontrado</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {users.map((u) => (
                      <div key={u.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {(u.full_name || u.email || "?")[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 text-sm">{u.full_name || "—"}</p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </div>
                          {u.id === currentUser?.id && (
                            <Badge className="bg-green-100 text-green-700 text-xs ml-1">Você</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={`border text-xs font-semibold ${roleBadge(u.role)}`}>
                            {u.role === "admin" && <ShieldAlert className="w-3 h-3 mr-1 inline" />}
                            {roleLabel(u.role || "operator")}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-8"
                            disabled={u.id === currentUser?.id && u.role === "admin"}
                            onClick={() => handleAlterarRole(u)}
                          >
                            Alterar role
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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

        {/* Modal de confirmação de role */}
        <Dialog open={!!confirmModal} onOpenChange={() => setConfirmModal(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar alteração de role</DialogTitle>
            </DialogHeader>
            {confirmModal && (
              <div className="py-4 space-y-3">
                <p className="text-slate-700">
                  Deseja alterar <strong>{confirmModal.user.full_name || confirmModal.user.email}</strong> de{" "}
                  <Badge className={`border ${roleBadge(confirmModal.user.role)}`}>{roleLabel(confirmModal.user.role || "operator")}</Badge>
                  {" "}para{" "}
                  <Badge className={`border ${roleBadge(confirmModal.novoRole)}`}>{roleLabel(confirmModal.novoRole)}</Badge>?
                </p>
                {confirmModal.novoRole === "admin" && (
                  <Alert className="border-blue-200 bg-blue-50">
                    <AlertDescription className="text-blue-700 text-sm">
                      Este usuário terá acesso total ao sistema.
                    </AlertDescription>
                  </Alert>
                )}
                {confirmModal.novoRole === "operator" && (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertDescription className="text-amber-700 text-sm">
                      Este usuário perderá acesso às telas administrativas.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmModal(null)}>Cancelar</Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => updateMutation.mutate({ id: confirmModal.user.id, role: confirmModal.novoRole })}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Salvando..." : "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}