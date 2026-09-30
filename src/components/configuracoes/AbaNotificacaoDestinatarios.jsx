import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Mail, Plus, Trash2, Power, AlertTriangle, CheckCircle2, UserCheck } from "lucide-react";
import { format } from "date-fns";

export default function AbaNotificacaoDestinatarios({ isAdmin = false }) {
  const queryClient = useQueryClient();
  const [novoEmail, setNovoEmail] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [erroForm, setErroForm] = useState("");
  const [sucessoForm, setSucessoForm] = useState("");

  const { data: destinatarios = [], isLoading } = useQuery({
    queryKey: ["notificacao-destinatarios"],
    queryFn: async () => {
      try {
        const res = await base44.entities.NotificacaoDestinatario.list("-created_date");
        return res || [];
      } catch (err) {
        console.warn("[AbaNotificacaoDestinatarios] Tabela ainda não criada ou inacessível:", err.message);
        return [];
      }
    },
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: (novo) => base44.entities.NotificacaoDestinatario.create(novo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificacao-destinatarios"] });
      setNovoEmail("");
      setNovoNome("");
      setErroForm("");
      setSucessoForm("Destinatário adicionado com sucesso!");
      setTimeout(() => setSucessoForm(""), 4000);
    },
    onError: (err) => {
      setErroForm(err.message || "Erro ao adicionar destinatário.");
    },
  });

  const toggleAtivoMutation = useMutation({
    mutationFn: ({ id, ativo }) => base44.entities.NotificacaoDestinatario.update(id, { ativo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificacao-destinatarios"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.NotificacaoDestinatario.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificacao-destinatarios"] });
    },
  });

  const handleAdicionar = (e) => {
    e.preventDefault();
    setErroForm("");
    const emailLimpo = novoEmail.trim().toLowerCase();
    if (!emailLimpo || !emailLimpo.includes("@") || !emailLimpo.includes(".")) {
      setErroForm("Informe um e-mail válido.");
      return;
    }

    if (destinatarios.some((d) => d.email.toLowerCase() === emailLimpo)) {
      setErroForm("Este e-mail já está cadastrado.");
      return;
    }

    createMutation.mutate({
      email: emailLimpo,
      nome: novoNome.trim() || null,
      ativo: true,
    });
  };

  const ativos = destinatarios.filter((d) => d.ativo);
  const semDestinatariosAtivos = !isLoading && ativos.length === 0;

  return (
    <div className="space-y-6">
      {/* Alerta quando não houver destinatários ativos */}
      {semDestinatariosAtivos && (
        <Alert variant="destructive" className="bg-amber-50 border-amber-300 text-amber-900 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-bold text-amber-900">Atenção: Nenhum destinatário ativo configurado</AlertTitle>
          <AlertDescription className="text-amber-800 text-sm mt-1">
            Quando um operador registrar uma ocorrência de empilhadeira com a opção <strong>"Notificar Líder"</strong>,
            o sistema <strong>não terá para quem enviar o alerta por e-mail</strong>. Cadastre ao menos um endereço de
            e-mail ativo abaixo para garantir a entrega das notificações.
          </AlertDescription>
        </Alert>
      )}

      {/* Formulário de Cadastro (exclusivo para Admins) */}
      {isAdmin && (
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" /> Novo Destinatário de Ocorrências
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Adicione e-mails da liderança ou equipe técnica que devem receber o resumo sempre que uma ocorrência for aberta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdicionar} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="nomeDest" className="text-xs text-slate-600">
                    Nome / Cargo (opcional)
                  </Label>
                  <Input
                    id="nomeDest"
                    placeholder="Ex: Coordenador de Logística"
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="emailDest" className="text-xs text-slate-600">
                    E-mail institucional *
                  </Label>
                  <Input
                    id="emailDest"
                    type="email"
                    placeholder="Ex: coordenador@interlub.com.br"
                    value={novoEmail}
                    onChange={(e) => setNovoEmail(e.target.value)}
                    required
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {erroForm && <p className="text-xs text-red-600 font-semibold">{erroForm}</p>}
              {sucessoForm && <p className="text-xs text-emerald-600 font-semibold">{sucessoForm}</p>}

              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 text-xs font-semibold"
              >
                {createMutation.isPending ? "Cadastrando..." : "Cadastrar Destinatário"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de Destinatários */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Mail className="w-4 h-4 text-purple-600" /> Destinatários Cadastrados
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {destinatarios.length} destinatário(s) cadastrado(s) • {ativos.length} ativo(s)
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-xs text-slate-500 py-4 text-center">Carregando destinatários...</p>
          ) : destinatarios.length === 0 ? (
            <div className="text-center py-8 text-slate-500 space-y-2">
              <Mail className="w-8 h-8 mx-auto text-slate-400" />
              <p className="text-sm font-semibold">Nenhum destinatário cadastrado.</p>
              <p className="text-xs text-slate-400">Utilize o formulário acima para adicionar e-mails.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {destinatarios.map((d) => (
                <div key={d.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {d.nome || d.email.split("@")[0]}
                      </p>
                      <Badge
                        variant="outline"
                        className={
                          d.ativo
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                            : "bg-slate-100 text-slate-500 border-slate-200 text-[10px]"
                        }
                      >
                        {d.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 font-mono truncate">{d.email}</p>
                    {d.created_at && (
                      <p className="text-[10px] text-slate-400">
                        Cadastrado em: {format(new Date(d.created_at), "dd/MM/yyyy HH:mm")}
                      </p>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleAtivoMutation.mutate({ id: d.id, ativo: !d.ativo })}
                        disabled={toggleAtivoMutation.isPending}
                        className="h-8 px-2 text-xs flex items-center gap-1"
                        title={d.ativo ? "Desativar notificações para este e-mail" : "Ativar notificações"}
                      >
                        <Power className={`w-3.5 h-3.5 ${d.ativo ? "text-amber-600" : "text-emerald-600"}`} />
                        {d.ativo ? "Desativar" : "Ativar"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(`Remover "${d.email}" da lista de alertas?`)) {
                            deleteMutation.mutate(d.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Excluir permanentemente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
