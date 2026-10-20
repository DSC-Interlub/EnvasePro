import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle, Circle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { semAvisarDuranteTroca } from "@/lib/sessaoRevogada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REGRAS_SENHA, problemaDaSenha } from "@/lib/politicaSenha";

/**
 * Trocar a própria senha — no primeiro acesso (obrigatório) e pelo menu.
 *
 * A troca passa pelo servidor (/api/admin-usuarios, ação trocar_minha_senha):
 * ele confere a senha atual, grava a nova e apaga o "trocar no primeiro
 * acesso" do app_metadata, que o próprio usuário não consegue escrever.
 *
 * Gravar a senha nova encerra TODAS as sessões da conta e invalida os JWT já
 * emitidos — as OUTRAS abas e aparelhos caem. O servidor devolve uma sessão
 * NOVA para quem trocou, e esta aba passa a usá-la: a pessoa continua logada.
 * (Se a sessão nova não vier, volta ao login com o aviso.)
 */
export default function FormularioTrocarSenha({ rotuloAtual = "Senha atual", aoConcluir }) {
  const { sairComAviso } = useAuth();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [feito, setFeito] = useState(false);
  const campoAtual = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => campoAtual.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const problema = nova ? problemaDaSenha(nova) : null;
  const naoConfere = confirma && confirma !== nova;
  const pronto = atual && nova && !problema && confirma === nova && nova !== atual;

  const enviar = async (e) => {
    e.preventDefault();
    if (!pronto || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      // Durante a troca, a sessão desta aba é revogada junto com as outras:
      // um 401 de uma chamada em voo é esperado e não pode deslogar.
      const resposta = await semAvisarDuranteTroca(async () => {
        const r = await base44.functions.adminUsuarios("trocar_minha_senha", { senha_atual: atual, senha_nova: nova });
        if (r.sessao) await supabase.auth.setSession(r.sessao);
        return r;
      });
      setAtual(""); setNova(""); setConfirma("");
      if (!resposta.sessao) {
        await sairComAviso("Senha trocada. Entre com a senha nova.");
        return;
      }
      setFeito(true);
      aoConcluir?.();
    } catch (err) {
      setErro(err.message || "Não foi possível trocar a senha.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      {erro && (
        <div role="alert" className="flex items-start gap-2.5 rounded-token bg-erro-suave px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-erro" aria-hidden="true" />
          <p className="text-sm font-bold text-erro">{erro}</p>
        </div>
      )}
      {feito && (
        <div role="status" className="flex items-start gap-2.5 rounded-token bg-ok-suave px-4 py-3">
          <CheckCircle className="mt-0.5 h-4 w-4 flex-none text-ok" aria-hidden="true" />
          <p className="text-sm font-bold text-ok">Senha trocada. As outras sessões desta conta foram encerradas.</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="senha-atual">{rotuloAtual}</Label>
        <Input
          ref={campoAtual} id="senha-atual" type="password" autoComplete="current-password"
          required value={atual} onChange={(e) => setAtual(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="senha-nova">Senha nova</Label>
        <Input
          id="senha-nova" type="password" autoComplete="new-password" required
          value={nova} onChange={(e) => setNova(e.target.value)}
          aria-invalid={problema ? "true" : undefined}
          aria-describedby="senha-regras"
        />
        <ul id="senha-regras" className="grid gap-1 pt-1" aria-label="Requisitos da senha">
          {REGRAS_SENHA.map((r) => {
            const ok = r.ok(nova);
            return (
              <li key={r.id} className={`flex items-center gap-2 text-xs font-bold ${ok ? "text-ok" : "text-texto-fraco"}`}>
                {ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5" aria-hidden="true" />}
                <span>{r.texto}<span className="sr-only">{ok ? " — atendido" : " — falta"}</span></span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2">
        <Label htmlFor="senha-confirma">Repita a senha nova</Label>
        <Input
          id="senha-confirma" type="password" autoComplete="new-password" required
          value={confirma} onChange={(e) => setConfirma(e.target.value)}
          aria-invalid={naoConfere ? "true" : undefined}
        />
        {naoConfere && <p className="text-xs font-bold text-erro">As duas senhas não são iguais.</p>}
        {nova && atual && nova === atual && <p className="text-xs font-bold text-erro">A senha nova tem de ser diferente da atual.</p>}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={!pronto || enviando}>
        {enviando ? "Salvando…" : "Trocar senha"}
      </Button>
    </form>
  );
}
