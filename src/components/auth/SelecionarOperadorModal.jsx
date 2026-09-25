import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserCheck, Users, ShieldAlert, Sparkles } from 'lucide-react';

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
      supabase
        .from('operators')
        .select('*')
        .eq('ativo', true)
        .order('nome')
        .then(({ data, error }) => {
          if (!error && data) {
            setOperadores(data);
          }
          setLoading(false);
        });
    }
  }, [aberto]);

  if (!aberto) return null;

  const handleSelecionar = (op) => {
    selectOperator(op);
    aoFechar();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl bg-white shadow-2xl border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <CardHeader className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Users className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                Quem é você hoje?
                <Sparkles className="w-5 h-5 text-amber-300" />
              </CardTitle>
              <CardDescription className="text-blue-100 text-sm mt-0.5">
                Conta de Turno: <span className="font-semibold">{user?.email}</span>. Selecione seu nome para registrar suas atividades de produção com precisão.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-3">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm">Carregando operadores ativos...</p>
            </div>
          ) : operadores.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              <ShieldAlert className="w-8 h-8 mx-auto text-amber-500 mb-2" />
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
                    className={`p-3.5 rounded-xl border text-left transition-all flex items-center gap-3 group hover:shadow-md ${
                      selecionado
                        ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-500'
                        : 'border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-white'
                    }`}
                  >
                    <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-base shrink-0 overflow-hidden border border-blue-200 group-hover:scale-105 transition-transform">
                      {op.foto_url ? (
                        <img src={op.foto_url} alt={op.nome} className="w-full h-full object-cover" />
                      ) : (
                        op.nome?.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 text-sm truncate group-hover:text-blue-700">
                        {op.nome}
                      </p>
                      <p className="text-xs text-slate-500">
                        {op.sala ? `Sala: ${op.sala}` : 'Operação Geral'}
                      </p>
                    </div>
                    {selecionado && <UserCheck className="w-5 h-5 text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>

        {abertoManualmente && (
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
            <Button variant="outline" onClick={aoFechar}>
              Fechar
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
