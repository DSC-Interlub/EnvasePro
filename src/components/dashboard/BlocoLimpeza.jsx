import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Sparkles, Calendar, Play, CheckCircle, PenLine, Settings } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SectionCard, StatusPill, ChipsFiltro, EmptyState } from "@/components/fluxo";
import ModalAssinaturaLimpeza from "../limpeza/ModalAssinaturaLimpeza";

const hoje = () => format(new Date(), "yyyy-MM-dd");
const agora = () => format(new Date(), "HH:mm");

function calcStatus(p) {
  if (p.status === "Concluído" || p.status === "Em Andamento") return p.status;
  if (p.data_prevista < hoje() && p.status === "Pendente") return "Atrasado";
  return p.status;
}

/**
 * Lista de limpezas agrupada por data.
 *
 * O que mudou: as quatro paletas de status escritas à mão (`yellow-100`,
 * `green-100`, `red-100` e a da marca) viraram `StatusPill`, que é o mesmo
 * componente de situação do resto do sistema; e os três botões de ação, que
 * eram só ícone sem nome acessível nenhum, ganharam `aria-label` — um leitor de
 * tela anunciava "botão" três vezes seguidas e pronto.
 *
 * As regras de quando cada botão aparece não mudaram.
 */
function ListaLimpeza({ itens, isAdmin, handleIniciar, handleConcluir, setModalAssinatura }) {
  const porData = itens.reduce((acc, p) => {
    const d = p.data_prevista;
    if (!acc[d]) acc[d] = [];
    acc[d].push(p);
    return acc;
  }, {});
  const datas = Object.keys(porData).sort();

  if (itens.length === 0) {
    return (
      <EmptyState
        icone={Sparkles}
        titulo="Nenhuma limpeza nesta categoria"
        legenda="Ajuste o período ou o filtro."
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {datas.map((data) => (
        <div key={data} className="min-w-0">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-texto-fraco">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            {format(new Date(data + "T00:00:00"), "EEEE, dd/MM", { locale: ptBR })}
            {data === hoje() && (
              <span className="rounded-full bg-marca-suave px-2 py-0.5 text-[11px] font-extrabold text-marca">
                Hoje
              </span>
            )}
          </p>

          <ul className="flex flex-col gap-2">
            {porData[data].map((p) => {
              const status = calcStatus(p);
              const atrasado = status === "Atrasado";
              const ehHoje = data === hoje();
              const aguardaLider = p.status === "Concluído" && p.assinatura_responsavel && !p.assinatura_lider;

              return (
                <li
                  key={p.id}
                  className={`flex min-h-[56px] items-center gap-3 rounded-token px-4 py-2.5
                              ${atrasado ? "bg-erro-suave" : ehHoje ? "bg-marca-suave" : "bg-fundo"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="truncate font-extrabold text-tinta">{p.local_nome}</span>
                      <StatusPill estado={status} />
                      {aguardaLider && (
                        <span className="rounded-full bg-atencao-suave px-2 py-0.5 text-[11px] font-extrabold text-atencao">
                          aguarda líder
                        </span>
                      )}
                      {p.status_assinatura === "Completo" && (
                        <span className="rounded-full bg-ok-suave px-2 py-0.5 text-[11px] font-extrabold text-ok">
                          assinado
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs font-semibold text-texto-fraco">
                      {p.responsavel_nome} · {p.tipo_limpeza}
                    </p>
                  </div>

                  {isAdmin && (
                    <div className="flex flex-none gap-1.5">
                      {status !== "Concluído" && status !== "Em Andamento" && (
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label={`Iniciar a limpeza de ${p.local_nome}`}
                          onClick={() => handleIniciar(p)}
                        >
                          <Play className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      {status !== "Concluído" && (
                        <Button
                          size="icon"
                          aria-label={`Concluir a limpeza de ${p.local_nome}`}
                          className="bg-ok text-white hover:bg-ok"
                          onClick={() => handleConcluir(p)}
                        >
                          <CheckCircle className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      {aguardaLider && (
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label={`Assinar como líder a limpeza de ${p.local_nome}`}
                          onClick={() => setModalAssinatura(p.id)}
                        >
                          <PenLine className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function BlocoLimpeza({ currentUser, isAdmin }) {
  const queryClient = useQueryClient();
  const semIni = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const semFim = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  const [dataInicio, setDataInicio] = useState(semIni);
  const [dataFim, setDataFim] = useState(semFim);
  const [modalAssinatura, setModalAssinatura] = useState(null);

  // Só o período escolhido (Etapa 2). Antes: todas as programações de todo
  // o histórico — 406 KB no volume carregado — para mostrar uma semana. Tudo
  // abaixo já trabalhava só com o período. A chave começa com
  // "limpeza-programacoes", então as invalidações de sempre continuam valendo.
  const { data: programacoes } = useQuery({
    queryKey: ["limpeza-programacoes", dataInicio, dataFim],
    queryFn: () => base44.functions.limpezasDaFaixa(dataInicio, dataFim),
    initialData: [],
    enabled: Boolean(dataInicio && dataFim),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LimpezaProgramacao.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["limpeza-programacoes"] }),
  });

  const filtradas = programacoes.filter(p => p.data_prevista >= dataInicio && p.data_prevista <= dataFim);

  const pendentes = filtradas.filter(p => calcStatus(p) === "Pendente");
  const emAndamento = filtradas.filter(p => calcStatus(p) === "Em Andamento");
  const atrasadas = filtradas.filter(p => calcStatus(p) === "Atrasado");
  const concluidas = filtradas.filter(p => calcStatus(p) === "Concluído");
  const aguardandoLider = filtradas.filter(p => p.status === "Concluído" && p.assinatura_responsavel && !p.assinatura_lider);

  const handleIniciar = (p) => {
    updateMutation.mutate({ id: p.id, data: { status: "Em Andamento", hora_inicio: agora() } });
  };

  const handleConcluir = (p) => {
    const now = agora();
    updateMutation.mutate({
      id: p.id,
      data: {
        status: "Concluído",
        hora_fim: now,
        data_realizada: hoje(),
        ...(!p.hora_inicio ? { hora_inicio: now } : {}),
      }
    }, {
      onSuccess: () => setModalAssinatura(p.id),
    });
  };

  const getProg = (id) => programacoes.find(p => p.id === id);

  /* ──────────────────────────────────────────────────────────────────────
     Abas -> chips.
     Eram cinco `<TabsContent>`, cada um renderizando o MESMO `<ListaLimpeza>`
     com um array diferente: cinco cópias do mesmo JSX, cinco lugares para
     corrigir. Agora é um chip por faixa e uma lista só.
     ────────────────────────────────────────────────────────────────────── */
  const [faixa, setFaixa] = useState("todas");
  const LISTAS = {
    todas: filtradas,
    pendentes,
    andamento: emAndamento,
    atrasadas,
    concluidas,
  };
  const CHIPS = [
    { valor: "todas", rotulo: "Todas", contagem: filtradas.length },
    { valor: "pendentes", rotulo: "Pendentes", contagem: pendentes.length },
    { valor: "andamento", rotulo: "Em andamento", contagem: emAndamento.length },
    { valor: "atrasadas", rotulo: "Atrasadas", contagem: atrasadas.length },
    { valor: "concluidas", rotulo: "Concluídas", contagem: concluidas.length },
  ];

  const ATALHOS = [
    ["Semana", () => [semIni, semFim]],
    ["Hoje", () => [hoje(), hoje()]],
    ["Mês", () => {
      const d = new Date();
      return [
        format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd"),
        format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd"),
      ];
    }],
  ];

  return (
    <SectionCard
      titulo="Limpeza"
      legenda={`${format(new Date(dataInicio + "T00:00:00"), "dd/MM")} a ${format(new Date(dataFim + "T00:00:00"), "dd/MM")}`}
      icone={Sparkles}
      atraso={0.1}
      acoes={
        <>
          {ATALHOS.map(([rotulo, calcular]) => (
            <Button
              key={rotulo}
              size="lg"
              variant="outline"
              onClick={() => {
                const [ini, fim] = calcular();
                setDataInicio(ini);
                setDataFim(fim);
              }}
            >
              {rotulo}
            </Button>
          ))}
          {isAdmin && (
            <Link to="/GerenciarUsuarios?aba=limpeza">
              <Button size="lg" variant="outline">
                <Settings className="h-4 w-4" aria-hidden="true" />
                Programar
              </Button>
            </Link>
          )}
        </>
      }
    >
      {/* Resumo do período. "Aguard. líder" virou "Aguardando líder": a
          abreviação economizava quatro caracteres num cartão de 180px. */}
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2.5 md:grid-cols-5">
        {[
          { rotulo: "Total", valor: filtradas.length, cor: "text-tinta" },
          { rotulo: "Concluídas", valor: concluidas.length, cor: "text-ok" },
          { rotulo: "Pendentes", valor: pendentes.length, cor: "text-atencao" },
          { rotulo: "Atrasadas", valor: atrasadas.length, cor: "text-erro" },
          { rotulo: "Aguardando líder", valor: aguardandoLider.length, cor: "text-atencao" },
        ].map((k) => (
          <div key={k.rotulo} className="min-w-0 rounded-token bg-fundo px-4 py-3">
            <p className="truncate text-xs font-bold text-texto-fraco">{k.rotulo}</p>
            <p className={`num text-2xl font-extrabold ${k.cor}`}>{k.valor}</p>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <ChipsFiltro rotulo="Filtrar limpezas" opcoes={CHIPS} valor={faixa} aoEscolher={setFaixa} />
      </div>

      <ListaLimpeza
        itens={LISTAS[faixa]}
        isAdmin={isAdmin}
        handleIniciar={handleIniciar}
        handleConcluir={handleConcluir}
        setModalAssinatura={setModalAssinatura}
      />

      {modalAssinatura && (
        <ModalAssinaturaLimpeza
          open={!!modalAssinatura}
          onClose={() => setModalAssinatura(null)}
          programacao={getProg(modalAssinatura)}
          currentUser={currentUser}
          isAdmin={isAdmin}
        />
      )}
    </SectionCard>
  );
}
