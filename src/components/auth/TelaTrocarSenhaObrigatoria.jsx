import React from "react";
import { KeyRound, LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import FormularioTrocarSenha from "./FormularioTrocarSenha";

/**
 * Primeiro acesso com senha temporária: a conta só usa o sistema depois de
 * escolher a própria senha. Toma a tela inteira, como o login.
 *
 * A senha temporária foi vista pelo administrador que criou ou resetou a
 * conta; trocar é o que garante que só a pessoa sabe a senha dela.
 */
export default function TelaTrocarSenhaObrigatoria() {
  const { user, logout } = useAuth();

  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo p-4">
      <div className="entra cartao-fluxo w-full max-w-[460px] p-8 sm:p-10">
        <div className="mb-6 flex flex-col items-center text-center">
          <span aria-hidden="true" className="mb-4 flex h-14 w-14 items-center justify-center rounded-painel bg-marca-suave text-marca">
            <KeyRound className="h-7 w-7" />
          </span>
          <h1 className="text-[24px] font-extrabold leading-tight text-tinta">Crie a sua senha</h1>
          <p className="mt-2 text-sm font-semibold text-texto-fraco">
            Você entrou com uma senha temporária ({user?.email}). Para continuar, escolha uma senha
            que só você saiba.
          </p>
        </div>

        <FormularioTrocarSenha rotuloAtual="Senha temporária" />

        <Button type="button" variant="ghost" size="lg" className="mt-3 w-full" onClick={logout}>
          <LogOut className="h-4 w-4" aria-hidden="true" /> Sair sem trocar
        </Button>
      </div>
    </main>
  );
}
