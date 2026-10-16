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

  const preencherEmail = (em) => {
    setEmail(em);
    setPassword('');
    setErro(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-cartao shadow-cartao-alta border-borda">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-12 h-12 bg-marca-suave rounded-full flex items-center justify-center mb-3">
            <Lock className="w-6 h-6 text-marca" />
          </div>
          <CardTitle className="text-2xl font-bold text-tinta">Acesso ao EnvasePro</CardTitle>
          <CardDescription>
            Entre com suas credenciais do Supabase para acessar as operações.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {erro && (
              <div className="p-3 bg-erro-suave border border-erro rounded-token flex items-center gap-2 text-sm text-erro">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-texto-apagado" />
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
                <Lock className="w-4 h-4 absolute left-3 top-3 text-texto-apagado" />
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

            <Button type="submit" className="w-full bg-marca hover:bg-marca-forte font-semibold" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar no Sistema'}
            </Button>

            <div className="pt-3 border-t border-borda space-y-2">
              <p className="text-xs text-center text-texto-fraco font-medium">Preenchimento Rápido de E-mail:</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs flex items-center gap-1.5 border-marca-suave-2 hover:bg-marca-suave"
                  onClick={() => preencherEmail('operacoes.equipe@interlub.com')}
                >
                  <Factory className="w-3.5 h-3.5 text-marca" />
                  Operações (Fábrica)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs flex items-center gap-1.5 border-borda hover:bg-fundo"
                  onClick={() => preencherEmail('pcp-brasil@interlub.com')}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-tinta-media" />
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
