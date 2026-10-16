import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserCheck, Users, ShieldAlert } from 'lucide-react';

export default function SelecionarOperadorModal({ abertoManualmente = false, aoFechar = () => {} }) {
  const { user, isAuthenticated, currentOperator, selectOperator, isTvPage } = useAuth();
  const [operadores, setOperadores] = useState([]);
  const [loading, setLoading] = useState(true);

  // Deve abrir automaticamente se o usuário logado for da equipe operacional e não tiver operador selecionado
  const deveAbrirAutomatico = isAuthenticated && !isTvPage && !currentOperator && user?.role === 'operator';
  const aberto = abertoManualmente || deveAbrirAutomatico;

  useEffect(() => {
    if (aberto) {
      setLoading(true);
      // Vai pelo adaptador, NÃO direto pelo supabase.
      //
      // O adaptador é quem troca o caminho da foto por uma URL assinada
      // (resolverFotosOperadores). Consultando direto, `foto_url` chegava aqui
      // como caminho cru — `<img src="arquivo.png">` — e a foto não carregava.
      // Antes isso passava despercebido porque o banco guardava a URL pública
      // inteira; desde que o upload passou a gravar o caminho (que é o que faz
      // o bucket privado funcionar), consultar direto quebra a imagem.
      base44.entities.Operator
        .filter({ ativo: true }, 'nome')
        .then((data) => {
          if (data) setOperadores(data);
        })
        .catch(() => { /* lista vazia: o modal mostra o estado de vazio */ })
        .finally(() => setLoading(false));
    }
  }, [aberto]);

  if (!aberto) return null;

  const handleSelecionar = (op) => {
    selectOperator(op);
    aoFechar();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl bg-cartao shadow-cartao-alta border-borda overflow-hidden flex flex-col max-h-[90vh]">
        {/* O gradiente roxo-para-azul saiu: `to-indigo-800` nao era token do
            sistema, e o cabecalho colorido empurrava a LISTA DE OPERADORES —
            que e a unica coisa que importa aqui — para baixo da dobra no
            celular. O brilhinho do Sparkles tambem saiu: ele nao dizia nada e
            o leitor de tela anunciava "faiscas". */}
        <CardHeader className="bg-marca p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-painel bg-white/20">
              <Users className="h-7 w-7 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-2xl font-extrabold">
                Quem é você hoje?
              </CardTitle>
              <CardDescription className="text-marca-suave text-sm mt-0.5">
                Conta de Turno: <span className="font-semibold">{user?.email}</span>. Selecione seu nome para registrar suas atividades de produção com precisão.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-texto-fraco gap-3">
              <div className="w-8 h-8 border-4 border-marca border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm">Carregando operadores ativos...</p>
            </div>
          ) : operadores.length === 0 ? (
            <div className="py-8 text-center text-texto-fraco">
              <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-atencao" aria-hidden="true" />
              <p>Nenhum operador ativo cadastrado no sistema.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {operadores.map((op) => {
                const selecionado = currentOperator?.id === op.id;
                return (
                  <button
                    key={op.id}
                    onClick={() => handleSelecionar(op)}
                    className={`p-3.5 rounded-painel border text-left transition-all flex items-center gap-3 group hover:shadow-cartao ${
                      selecionado
                        ? 'border-marca bg-marca-suave/80 ring-2 ring-marca'
                        : 'border-borda hover:border-marca bg-fundo/50 hover:bg-cartao'
                    }`}
                  >
                    <div className="w-11 h-11 rounded-full bg-marca-suave text-marca font-bold flex items-center justify-center text-base shrink-0 overflow-hidden border border-marca-suave-2 group-hover:scale-105 transition-transform">
                      {op.foto_url ? (
                        <img src={op.foto_url} alt={op.nome} className="w-full h-full object-cover" />
                      ) : (
                        op.nome?.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-tinta text-sm truncate group-hover:text-marca">
                        {op.nome}
                      </p>
                      <p className="text-xs text-texto-fraco">
                        {op.sala ? `Sala: ${op.sala}` : 'Operação Geral'}
                      </p>
                    </div>
                    {selecionado && <UserCheck className="w-5 h-5 text-marca shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>

        {abertoManualmente && (
          <div className="p-4 bg-fundo border-t border-borda flex justify-end">
            <Button variant="outline" onClick={aoFechar}>
              Fechar
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
