import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Info } from "lucide-react";

/**
 * O formulário de entrada — o MESMO na tela de login e no modal que reaparece
 * quando o token expira no meio do uso.
 *
 * O QUE SAIU, E POR QUÊ
 *
 *  - O "Preenchimento Rápido de E-mail", com os endereços das contas
 *    compartilhadas da fábrica escritos no código. Eles iam no bundle público
 *    — qualquer um que abrisse o JavaScript do site lia o login das contas de
 *    operação e de administração. Metade de uma credencial entregue de graça.
 *  - O texto "credenciais do Supabase": quem usa o sistema não sabe e não
 *    precisa saber o que é Supabase.
 *
 * MENSAGENS DE ERRO GENÉRICAS, de propósito. "E-mail ou senha inválidos"
 * para qualquer falha de credencial: dizer "esse e-mail não existe" ensinaria
 * a descobrir quais contas existem. As duas exceções não revelam nada sobre a
 * conta — limite de tentativas e falta de rede — e são as que a pessoa
 * consegue resolver sozinha.
 */
function mensagemDoErro(err) {
  const msg = String(err?.message || "").toLowerCase();
  const status = err?.status;

  if (status === 429 || /rate limit|too many|security purposes/.test(msg)) {
    return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
  }
  // O Auth só diz "banned" depois de a senha conferir, então isto não revela
  // se um e-mail existe para quem não sabe a senha.
  if (/banned/.test(msg)) {
    return "Esta conta está desativada. Fale com um administrador.";
  }
  if (/failed to fetch|network|networkerror|load failed/.test(msg)) {
    return "Não foi possível conectar ao servidor. Verifique a internet e tente de novo.";
  }
  return "E-mail ou senha inválidos.";
}

export default function FormularioLogin({ aviso }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const campoEmail = useRef(null);
  const campoSenha = useRef(null);

  // Foco no e-mail ao abrir: na tela da fábrica a pessoa chega e digita.
  useEffect(() => {
    const t = setTimeout(() => campoEmail.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const enviar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await login(email.trim(), senha);
    } catch (err) {
      setErro(mensagemDoErro(err));
      setSenha("");
      // Volta para a senha: o e-mail quase sempre está certo.
      setTimeout(() => campoSenha.current?.focus(), 0);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      {aviso && !erro && (
        <div role="status" className="flex items-start gap-2.5 rounded-token bg-atencao-suave px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 flex-none text-atencao" aria-hidden="true" />
          <p className="text-sm font-bold text-atencao">{aviso}</p>
        </div>
      )}

      {erro && (
        <div role="alert" className="flex items-start gap-2.5 rounded-token bg-erro-suave px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-erro" aria-hidden="true" />
          <p className="text-sm font-bold text-erro">{erro}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          ref={campoEmail}
          id="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={erro ? "true" : undefined}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          ref={campoSenha}
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          aria-invalid={erro ? "true" : undefined}
        />
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={enviando || !email.trim() || !senha}
      >
        {enviando ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
