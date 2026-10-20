import React from "react";
import { KeyRound } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/fluxo";
import FormularioTrocarSenha from "@/components/auth/FormularioTrocarSenha";
import { useAuth } from "@/lib/AuthContext";

/** "Alterar minha senha" — para qualquer conta, pelo menu. */
export default function AlterarSenha() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="mx-auto flex min-w-0 max-w-[560px] flex-col gap-4">
        <PageHeader
          migalha={[{ rotulo: "Minha conta" }, { rotulo: "Alterar senha" }]}
          titulo="Alterar minha senha"
          legenda={user?.email}
        />
        <SectionCard titulo="Senha nova" legenda="Ao trocar, as outras sessões desta conta (outras abas e aparelhos) são encerradas; esta continua" icone={KeyRound} atraso={0.05}>
          <FormularioTrocarSenha />
        </SectionCard>
      </div>
    </div>
  );
}
