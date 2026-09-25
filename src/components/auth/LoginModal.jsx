import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Mail, Factory, ShieldCheck, AlertCircle } from 'lucide-react';

export default function LoginModal() {
  const { login, loginModalAberto, setLoginModalAberto } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  if (!loginModalAberto) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErro(null);
    try {
      await login(email, password);
    } catch (err) {
      setErro(err.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const preencherCredenciais = (em, pass) => {
    setEmail(em);
    setPassword(pass);
    setErro(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white shadow-2xl border-slate-200">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
            <Lock className="w-6 h-6 text-blue-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-800">Acesso ao EnvasePro</CardTitle>
          <CardDescription>
            Entre com suas credenciais do Supabase para acessar as operações.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {erro && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="usuario@interlub.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 font-semibold" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar no Sistema'}
            </Button>

            <div className="pt-3 border-t border-slate-100 space-y-2">
              <p className="text-xs text-center text-slate-500 font-medium">Acesso Rápido de Turno:</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs flex items-center gap-1.5 border-blue-200 hover:bg-blue-50"
                  onClick={() => preencherCredenciais('operacoes.equipe@interlub.com', 'Interlub@Operacoes2026')}
                >
                  <Factory className="w-3.5 h-3.5 text-blue-600" />
                  Operações (Fábrica)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs flex items-center gap-1.5 border-slate-200 hover:bg-slate-50"
                  onClick={() => preencherCredenciais('pcp-brasil@interlub.com', 'Interlub@Pcp2026!')}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-700" />
                  PCP (Admin)
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
