import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, CheckCircle, Copy, History, KeyRound, Lock, Pencil, Power, ShieldAlert, Trash2, UserPlus, Users,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { formatarData } from "@/lib/datas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ChipsFiltro, EmptyState, ListaCard, SectionCard } from "@/components/fluxo";

/**
 * Gerenciar usuários — só administrador (a rota já é protegida, e o servidor
 * confere de novo: a tela não decide nada sozinha).
 *
 * Tudo passa por /api/admin-usuarios. A senha temporária de uma conta nova ou
 * resetada aparece UMA vez, num diálogo com botão de copiar; fechou, sumiu.
 * Senha existente não se vê: o sistema guarda só um código irreversível.
 */

const ROTULO_ACAO = {
  criar: "criou", editar: "editou", resetar_senha: "resetou a senha de", desativar: "desativou",
  reativar: "reativou", excluir: "excluiu", trocar_propria_senha: "trocou a própria senha", negado: "teve um pedido negado",
};

function Aviso({ tipo, children }) {
  const erro = tipo === "erro";
  return (
    <div role={erro ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-token px-4 py-3 ${erro ? "bg-erro-suave" : "bg-ok-suave"}`}>
      {erro
        ? <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-erro" aria-hidden="true" />
        : <CheckCircle className="mt-0.5 h-4 w-4 flex-none text-ok" aria-hidden="true" />}
      <p className={`text-sm font-bold ${erro ? "text-erro" : "text-ok"}`}>{children}</p>
    </div>
  );
}

/** Formulário de criar/editar. */
function DialogoConta({ conta, aberto, aoFechar, aoSalvar, salvando, erro }) {
  const nova = !conta;
  const [nome, setNome] = useState(conta?.nome || "");
  const [email, setEmail] = useState(conta?.email || "");
  const [papel, setPapel] = useState(conta?.papel || "operator");
  const [usoTv, setUsoTv] = useState(Boolean(conta?.uso_tv));

  const ok = nome.trim() && (!nova || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{nova ? "Novo usuário" : "Editar usuário"}</DialogTitle>
          <DialogDescription>
            {nova
              ? "A conta nasce com o e-mail confirmado e uma senha temporária, que a pessoa troca no primeiro acesso."
              : conta.email}
          </DialogDescription>
        </DialogHeader>
        <form
          id="form-conta"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok && !salvando) aoSalvar({ nome: nome.trim(), email: email.trim(), papel, uso_tv: papel === "operator" && usoTv });
          }}
        >
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <div className="space-y-2">
            <Label htmlFor="conta-nome">Nome</Label>
            <Input id="conta-nome" value={nome} maxLength={100} required onChange={(e) => setNome(e.target.value)} />
          </div>
          {nova && (
            <div className="space-y-2">
              <Label htmlFor="conta-email">E-mail</Label>
              <Input
                id="conta-email" type="email" inputMode="email" autoCapitalize="none" spellCheck={false}
                maxLength={254} required value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-tinta">Papel</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["operator", "Operador", "Executa as operações. Use também para as TVs."],
                ["admin", "Administrador", "Acesso total, inclusive a esta tela."],
              ].map(([v, rotulo, legenda]) => (
                <label
                  key={v}
                  className={`press flex min-h-[48px] cursor-pointer items-start gap-3 rounded-token border-2 px-4 py-3 ${papel === v ? "border-marca bg-marca-suave" : "border-borda bg-cartao"}`}
                >
                  <input type="radio" name="conta-papel" value={v} checked={papel === v} onChange={() => setPapel(v)} className="mt-1 h-4 w-4 accent-[var(--marca)]" />
                  <span>
                    <span className="block text-sm font-extrabold text-tinta">{rotulo}</span>
                    <span className="block text-xs font-semibold text-texto-fraco">{legenda}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {papel === "operator" && (
            <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-token bg-fundo px-4">
              <input type="checkbox" checked={usoTv} onChange={(e) => setUsoTv(e.target.checked)} className="h-4 w-4 accent-[var(--marca)]" />
              <span className="text-sm font-bold text-tinta">
                Uso em TV <span className="font-semibold text-texto-fraco">— só um rótulo para organizar; não muda o acesso</span>
              </span>
            </label>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" onClick={aoFechar}>Cancelar</Button>
          <Button type="submit" form="form-conta" size="lg" disabled={!ok || salvando}>
            {salvando ? "Salvando…" : nova ? "Criar usuário" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A senha temporária, mostrada uma única vez. */
function DialogoSenha({ dados, aoFechar }) {
  const [copiado, setCopiado] = useState(false);
  if (!dados) return null;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(dados.senha); setCopiado(true); } catch { setCopiado(false); }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Senha temporária</DialogTitle>
          <DialogDescription>{dados.email}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p
            data-senha-temporaria
            className="num select-all break-all rounded-token bg-fundo px-4 py-4 text-center font-mono text-xl font-extrabold tracking-wide text-tinta"
          >
            {dados.senha}
          </p>
          <Button type="button" size="lg" variant="outline" onClick={copiar} aria-label={copiado ? "Senha copiada" : "Copiar senha"}>
            <Copy className="h-4 w-4" aria-hidden="true" /> {copiado ? "Copiada" : "Copiar senha"}
          </Button>
          <div role="note" className="flex items-start gap-2.5 rounded-token bg-atencao-suave px-4 py-3">
            <Lock className="mt-0.5 h-4 w-4 flex-none text-atencao" aria-hidden="true" />
            <p className="text-sm font-bold text-atencao">
              Esta senha aparece só agora. Passe para a pessoa por um canal seguro; ela vai trocá-la no primeiro acesso.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" size="lg" onClick={aoFechar}>Já anotei</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmação simples (resetar, desativar, reativar) ou por digitação (excluir). */
function DialogoConfirmar({ pedido, aoFechar, aoConfirmar, enviando, erro }) {
  const [digitado, setDigitado] = useState("");
  if (!pedido) return null;
  const { conta, acao } = pedido;
  const textos = {
    resetar_senha: ["Resetar senha", "Uma senha temporária nova será gerada e mostrada uma vez. As sessões abertas desta conta são encerradas e ela terá de trocar a senha no próximo acesso.", "Resetar senha"],
    desativar: ["Desativar conta", "A conta não consegue mais entrar e as sessões abertas são encerradas. Dá para reativar depois.", "Desativar"],
    reativar: ["Reativar conta", "A conta volta a conseguir entrar com a senha que já tinha.", "Reativar"],
    excluir: ["Excluir conta", "A conta é apagada de vez. Isto não pode ser desfeito. O histórico de alterações continua registrando quem ela era.", "Excluir de vez"],
  }[acao];
  const porDigitacao = acao === "excluir";
  const liberado = !porDigitacao || digitado.trim().toLowerCase() === conta.email.toLowerCase();
  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{textos[0]}</DialogTitle>
          <DialogDescription>{conta.email}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <p className="text-sm font-semibold text-tinta-media">{textos[1]}</p>
          {porDigitacao && (
            <div className="space-y-2">
              <Label htmlFor="confirma-exclusao">Para confirmar, digite o e-mail da conta</Label>
              <Input
                id="confirma-exclusao" autoCapitalize="none" spellCheck={false} autoComplete="off"
                value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder={conta.email}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" onClick={aoFechar}>Cancelar</Button>
          <Button
            type="button" size="lg" variant={acao === "excluir" || acao === "desativar" ? "destructive" : "default"}
            disabled={!liberado || enviando}
            onClick={() => aoConfirmar(porDigitacao ? { confirmacao: digitado.trim() } : {})}
          >
            {enviando ? "Aguarde…" : textos[2]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GestaoUsuarios() {
  const { user: eu } = useAuth();
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState(null); // null fechado; {} nova; conta
  const [erroForm, setErroForm] = useState(null);
  const [pedido, setPedido] = useState(null);
  const [erroPedido, setErroPedido] = useState(null);
  const [senha, setSenha] = useState(null);
  const [aviso, setAviso] = useState(null);

  const lista = useQuery({
    queryKey: ["admin-usuarios"],
    queryFn: () => base44.functions.adminUsuarios("listar"),
    retry: false,
  });
  const historico = useQuery({
    queryKey: ["admin-usuarios-auditoria"],
    queryFn: () => base44.functions.adminUsuarios("auditoria"),
    retry: false,
    enabled: lista.isSuccess,
  });
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["admin-usuarios"] });
    qc.invalidateQueries({ queryKey: ["admin-usuarios-auditoria"] });
    qc.invalidateQueries({ queryKey: ["users-list"] });
  };

  const salvar = useMutation({
    mutationFn: (dados) => (editando?.id
      ? base44.functions.adminUsuarios("editar", { id: editando.id, ...dados })
      : base44.functions.adminUsuarios("criar", dados)),
    onSuccess: (r, dados) => {
      const nova = !editando?.id;
      setEditando(null);
      setErroForm(null);
      if (nova && r.senha_temporaria) setSenha({ email: r.usuario.email, senha: r.senha_temporaria });
      setAviso(nova ? `Conta de ${dados.email} criada.` : "Alterações salvas.");
      recarregar();
    },
    onError: (e) => setErroForm(e.message),
  });

  const executar = useMutation({
    mutationFn: ({ conta, acao, extra }) => base44.functions.adminUsuarios(acao, { id: conta.id, ...extra }),
    onSuccess: (r, { conta, acao }) => {
      setPedido(null);
      setErroPedido(null);
      if (r.senha_temporaria) setSenha({ email: conta.email, senha: r.senha_temporaria });
      setAviso({
        resetar_senha: `Senha de ${conta.email} resetada.`, desativar: `${conta.email} desativada.`,
        reativar: `${conta.email} reativada.`, excluir: `${conta.email} excluída.`,
      }[acao]);
      recarregar();
    },
    onError: (e) => setErroPedido(e.message),
  });

  const usuarios = lista.data?.usuarios || [];
  const contagem = useMemo(() => ({
    todos: usuarios.length,
    admin: usuarios.filter((u) => u.papel === "admin").length,
    operator: usuarios.filter((u) => u.papel === "operator" && !u.uso_tv).length,
    tv: usuarios.filter((u) => u.uso_tv).length,
    desativados: usuarios.filter((u) => !u.ativo).length,
  }), [usuarios]);
  const visiveis = usuarios.filter((u) => {
    if (filtro === "admin" && u.papel !== "admin") return false;
    if (filtro === "operator" && (u.papel !== "operator" || u.uso_tv)) return false;
    if (filtro === "tv" && !u.uso_tv) return false;
    if (filtro === "desativados" && u.ativo) return false;
    const b = busca.trim().toLowerCase();
    return !b || u.email.toLowerCase().includes(b) || (u.nome || "").toLowerCase().includes(b);
  });

  const semConfiguracao = lista.error?.codigo === "SEM_CONFIGURACAO";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div role="note" className="flex items-start gap-2.5 rounded-token bg-marca-suave px-4 py-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-marca" aria-hidden="true" />
        <p className="text-sm font-semibold text-marca">
          <strong>Ninguém consegue ver a senha de uma conta</strong>: o sistema guarda só um código que não se desfaz.
          Para quem esqueceu, use <strong>Resetar senha</strong>.
        </p>
      </div>

      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {lista.error && <Aviso tipo="erro">{lista.error.message}</Aviso>}

      <ListaCard
        chips={(
          <ChipsFiltro
            rotulo="Filtrar usuários"
            valor={filtro}
            aoEscolher={setFiltro}
            opcoes={[
              { valor: "todos", rotulo: "Todos", contagem: contagem.todos },
              { valor: "admin", rotulo: "Administradores", contagem: contagem.admin },
              { valor: "operator", rotulo: "Operadores", contagem: contagem.operator },
              { valor: "tv", rotulo: "TV", contagem: contagem.tv },
              { valor: "desativados", rotulo: "Desativados", contagem: contagem.desativados },
            ]}
          />
        )}
        busca={busca}
        aoBuscar={setBusca}
        placeholderBusca="Nome ou e-mail"
        rotuloBusca="Buscar usuário por nome ou e-mail"
        acoesTopo={(
          <Button size="lg" onClick={() => { setErroForm(null); setEditando({}); }} disabled={semConfiguracao || lista.isLoading}>
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Novo usuário
          </Button>
        )}
      >
        {lista.isLoading ? (
          <EmptyState carregando />
        ) : visiveis.length === 0 ? (
          <EmptyState icone={Users} titulo={usuarios.length ? "Nenhum usuário neste filtro" : "Nenhum usuário"} />
        ) : (
          <ul className="divide-y divide-borda" aria-label="Usuários">
            {visiveis.map((u) => {
              const souEu = u.id === eu?.id;
              return (
                <li key={u.id} data-usuario={u.email} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span aria-hidden="true" className={`flex h-10 w-10 flex-none items-center justify-center rounded-full text-sm font-extrabold ${u.ativo ? "bg-marca-suave text-marca" : "bg-fundo text-texto-apagado"}`}>
                    {(u.nome || u.email || "?")[0].toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block text-sm font-extrabold text-tinta">
                      {u.nome || "—"} {souEu && <span className="ml-1 text-xs font-bold text-ok">(você)</span>}
                    </span>
                    <span className="block text-xs font-semibold text-texto-fraco [overflow-wrap:anywhere]">{u.email}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant={u.papel === "admin" ? "info" : "secondary"} ponto={false}>{u.papel === "admin" ? "Administrador" : "Operador"}</Badge>
                      {u.uso_tv && <Badge variant="secondary" ponto={false}>Uso em TV</Badge>}
                      {!u.ativo && <Badge variant="erro">Desativada</Badge>}
                      {u.trocar_senha && u.ativo && <Badge variant="atencao">Senha temporária</Badge>}
                      <span className="text-xs font-semibold text-texto-apagado">
                        {u.ultimo_acesso ? `último acesso ${formatarData(u.ultimo_acesso, "dd/MM/yyyy HH:mm")}` : "nunca entrou"}
                      </span>
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <Button variant="outline" size="lg" aria-label={`Editar ${u.email}`} onClick={() => { setErroForm(null); setEditando(u); }}>
                      <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
                    </Button>
                    {!souEu && (
                      <>
                        <Button variant="outline" size="lg" aria-label={`Resetar a senha de ${u.email}`} onClick={() => { setErroPedido(null); setPedido({ conta: u, acao: "resetar_senha" }); }}>
                          <KeyRound className="h-4 w-4" aria-hidden="true" /> Resetar senha
                        </Button>
                        <Button
                          variant="outline" size="lg" aria-label={`${u.ativo ? "Desativar" : "Reativar"} ${u.email}`}
                          onClick={() => { setErroPedido(null); setPedido({ conta: u, acao: u.ativo ? "desativar" : "reativar" }); }}
                        >
                          <Power className="h-4 w-4" aria-hidden="true" /> {u.ativo ? "Desativar" : "Reativar"}
                        </Button>
                        <Button variant="outline" size="lg" className="text-erro" aria-label={`Excluir ${u.email}`} onClick={() => { setErroPedido(null); setPedido({ conta: u, acao: "excluir" }); }}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir
                        </Button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </ListaCard>

      <SectionCard titulo="Histórico de alterações" legenda="Quem fez o quê, em qual conta e quando — as 100 mais recentes" icone={History} atraso={0.1}>
        {historico.isLoading ? (
          <EmptyState carregando />
        ) : !(historico.data?.registros || []).length ? (
          <EmptyState icone={History} titulo="Nada registrado ainda" />
        ) : (
          <ul className="flex flex-col gap-1.5" aria-label="Histórico de alterações">
            {historico.data.registros.map((r) => (
              <li key={r.id} className="flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-0.5 rounded-token bg-fundo px-4 py-2 text-sm">
                <span className="num font-bold text-texto-fraco">{formatarData(r.criado_em, "dd/MM/yyyy HH:mm")}</span>
                <span className="min-w-0 flex-1 font-semibold text-tinta [overflow-wrap:anywhere]">
                  <strong>{r.ator_email}</strong> {ROTULO_ACAO[r.acao] || r.acao}
                  {r.alvo_email && r.acao !== "trocar_propria_senha" && <> <strong>{r.alvo_email}</strong></>}
                  {r.acao === "negado" && r.detalhes?.tentou ? ` (${r.detalhes.tentou})` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {editando && (
        <DialogoConta
          key={editando.id || "nova"}
          conta={editando.id ? editando : null}
          aberto
          aoFechar={() => setEditando(null)}
          aoSalvar={(dados) => salvar.mutate(dados)}
          salvando={salvar.isPending}
          erro={erroForm}
        />
      )}
      <DialogoConfirmar
        key={pedido ? `${pedido.conta.id}-${pedido.acao}` : "nada"}
        pedido={pedido}
        aoFechar={() => setPedido(null)}
        aoConfirmar={(extra) => executar.mutate({ ...pedido, extra })}
        enviando={executar.isPending}
        erro={erroPedido}
      />
      <DialogoSenha dados={senha} aoFechar={() => setSenha(null)} />
    </div>
  );
}
