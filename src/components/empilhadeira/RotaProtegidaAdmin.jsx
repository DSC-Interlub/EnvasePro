import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "@/utils";

/**
 * Protege rotas que exigem role="admin".
 * Operadores são redirecionados para /Empilhadeira com aviso.
 *
 * POR QUE ESPERA `perfilCarregado`
 *
 * Quando a sessão resolve, o `AuthContext` monta o usuário com
 * `role: 'operator'` como valor inicial **seguro**, e só depois
 * `carregarPerfilUsuario` lê o papel de verdade em `user_profiles`.
 *
 * Decidir permissão nessa janela trata **um admin como operador**. Não é
 * teórico: ao proteger as telas de catálogo, esta guarda passou a expulsar o
 * admin de todas elas, porque disparava antes de o papel chegar. O sintoma era
 * um redirecionamento para `/Empilhadeira?acesso=restrito` logo após o login.
 *
 * A espera é só enquanto houver sessão. Sem sessão não há papel a aguardar, e
 * o redirecionamento acontece na hora.
 */
export default function RotaProtegidaAdmin({ children }) {
  const { user, isAuthenticated, isLoadingAuth, perfilCarregado } = useAuth();

  const aguardando = isLoadingAuth || (isAuthenticated && !perfilCarregado);

  if (aguardando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div
          className="w-8 h-8 border-4 border-slate-200 border-t-amber-600 rounded-full animate-spin"
          role="status"
          aria-label="Verificando permissão"
        ></div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return <Navigate to={`${createPageUrl("Empilhadeira")}?acesso=restrito`} replace />;
  }

  return <>{children}</>;
}
