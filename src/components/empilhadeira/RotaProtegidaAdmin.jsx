import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "@/utils";
import { ShieldAlert } from "lucide-react";

/**
 * Protege rotas que exigem role="admin".
 * Operadores são redirecionados para /Empilhadeira com mensagem.
 */
export default function RotaProtegidaAdmin({ children }) {
  const { user, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-amber-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user || user.role === "operator") {
    return <Navigate to={`${createPageUrl("Empilhadeira")}?acesso=restrito`} replace />;
  }

  return <>{children}</>;
}