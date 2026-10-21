import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MolduraTV, NumeroTV, MetaTV, StatusTV, PainelImportacoes, GradeOperacoes, usePainelTV, u,
} from "@/components/fluxo/tv";
import { format } from "date-fns";
import { formatarData, paraData } from '@/lib/datas';

/* ===================== UTILITÁRIOS ===================== */
function calcElapsed(startTime) {
  if (!startTime) return "—";
  const now = new Date();
  const [h, m] = startTime.split(':');
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(h), parseInt(m));
  const diff = now - start;
  if (diff < 0) return "0h 00m";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

/** "08:10:00" -> "08:10" */
const hhmm = (t) => (t ? String(t).slice(0, 5) : null);

/* ===================== AS OPERAÇÕES DE CADA MÓDULO =====================
 *
 * O que cada cartão mostra, campo a campo, comparado com a TV ANTERIOR ao
 * módulo 1 (git 4ccc811^) — inventário completo no PR:
 *
 *  ENVASE: foto + nome do operador (grande), sala, produto, OP, quantidade
 *    produzida, certificações COM logo, tempo decorrido + "desde HH:MM", e o
 *    "PRONTO" da sala Bio aguardando retirada, com o botão de retirar.
 *    Tempo decorrido, "desde" e os logos tinham sumido na reconstrução.
 *
 *  CHECK-OUT: foto + nome, número do pedido, cliente, data de entrega,
 *    "CRÍTICO", tempo decorrido. A reconstrução tinha trocado pedido e
 *    cliente por `descricao_produto`/`quantidade` — colunas que NÃO EXISTEM
 *    em checkout_itens — e a linha mostrava só "Item".
 *
 *  EMPILHADEIRA: foto + nome do empilhador, AJUDANTE, produto, item,
 *    rua/torre, depósito, quantidade, "CRÍTICO", tempo decorrido. Ajudante,
 *    rua/torre, depósito, item e tempo tinham sumido.
 *
 * NOVO, pedido pelo dono: o alerta de atraso. Só onde há dado para isso — no
 * check-out, pela data de entrega. Envase e empilhadeira não têm prazo
 * gravado em lugar nenhum, então não há "atrasado" a calcular; inventar um
 * limite de tempo seria regra de negócio nova.
 */
function operacoesEnvase(records, { getOperatorPhoto, getProductCertifications, markMaterialAsRetirado }) {
  return records.map((r) => {
    const pronto = r.sala === 'Bio' && r.termino && !r.material_retirado;
    const qtd = Number(r.quantidade_produzida) > 0 ? `${Number(r.quantidade_produzida).toLocaleString('pt-BR')} un. produzidas` : null;
    return {
      id: r.id,
      tom: pronto ? 'ok' : 'neutro',
      foto: getOperatorPhoto(r.operator_id, r.operador),
      operador: r.operador,
      verbo: pronto ? 'Terminou — aguardando retirada' : 'Envasando',
      principal: r.descricao_produto || 'Produto não especificado',
      detalhe: [r.codigo_produto, qtd].filter(Boolean).join(' · ') || null,
      etiquetas: [
        { texto: `OP ${r.op || '—'}` },
        { texto: `Sala ${r.sala || '—'}`, tom: r.sala === 'Bio' ? 'ok' : undefined },
      ],
      certificacoes: getProductCertifications(r),
      tempo: calcElapsed(r.inicio),
      desde: hhmm(r.inicio),
      alerta: pronto ? { texto: 'PRONTO', tom: 'ok' } : null,
      // A única ação da TV: a sala Bio marca que o material foi retirado.
      // Mesma regra de antes — só em linha Bio já concluída.
      acao: pronto ? { rotulo: 'Material retirado', aoClicar: () => markMaterialAsRetirado.mutate(r.id) } : null,
    };
  });
}

function operacoesCheckout(itens, { getOperatorPhoto, hoje }) {
  return itens.map((i) => {
    const atrasada = i.data_entrega && i.data_entrega < hoje;
    const entregaHoje = i.data_entrega === hoje;
    return {
      id: i.id,
      tom: i.critico || atrasada ? 'erro' : 'neutro',
      foto: getOperatorPhoto(i.operator_id, i.operador),
      operador: i.operador,
      verbo: 'Em check-out',
      principal: `Pedido ${i.numero_pedido || '—'}`,
      detalhe: i.cliente || null,
      etiquetas: i.data_entrega ? [{ texto: `entrega ${formatarData(i.data_entrega, 'dd/MM')}` }] : [],
      tempo: calcElapsed(i.hora_inicio),
      desde: hhmm(i.hora_inicio),
      alerta: i.critico ? { texto: 'CRÍTICO', tom: 'erro' }
        : atrasada ? { texto: 'ENTREGA ATRASADA', tom: 'erro' }
        : entregaHoje ? { texto: 'ENTREGA HOJE', tom: 'atencao' }
        : null,
    };
  });
}

function operacoesEmpilha(linhas, { getOperatorPhoto }) {
  return linhas.map((l) => {
    const critica = l.tipo_linha === 'Crítico';
    const pausada = l.status === 'Pausado';
    return {
      id: l.id,
      tom: critica ? 'erro' : pausada ? 'atencao' : 'neutro',
      foto: getOperatorPhoto(l.operador_empilhadeira_id, l.operador_empilhadeira),
      operador: l.operador_empilhadeira,
      verbo: `${pausada ? 'Pausado' : 'Movimentando'}${l.operador_ajudante ? ` · com ${l.operador_ajudante}` : ''}`,
      principal: l.descricao_produto || l.codigo_produto || 'Linha',
      detalhe: [
        l.numero_item ? `Item ${l.numero_item}` : null,
        l.rua_torre ? `Rua/torre ${l.rua_torre}` : null,
        l.deposito ? `Depósito ${l.deposito}` : null,
        Number(l.quantidade) > 0 ? `${Number(l.quantidade).toLocaleString('pt-BR')} un.` : null,
      ].filter(Boolean).join(' · ') || null,
      etiquetas: l.tipo_linha && !critica ? [{ texto: l.tipo_linha }] : [],
      tempo: calcElapsed(l.hora_inicio),
      desde: hhmm(l.hora_inicio),
      alerta: critica ? { texto: 'CRÍTICO', tom: 'erro' } : pausada ? { texto: 'PAUSADA', tom: 'atencao' } : null,
    };
  });
}

export default function Televisao() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [slideIndex, setSlideIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const autoPlayRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Cinco paineis: Envase, Check-out, Empilhadeira, Mes e Importacoes.
  const NUM_SLIDES = 5;

  useEffect(() => {
    if (autoPlay) {
      autoPlayRef.current = setInterval(() => setSlideIndex(i => (i + 1) % NUM_SLIDES), 30000);
    }
    return () => clearInterval(autoPlayRef.current);
  }, [autoPlay, slideIndex]);

  const resetAutoPlay = (idx) => {
    setSlideIndex(idx);
    clearInterval(autoPlayRef.current);
    if (autoPlay) {
      autoPlayRef.current = setInterval(() => setSlideIndex(i => (i + 1) % NUM_SLIDES), 30000);
    }
  };

  // Envase, check-out, empilhadeira e mês vêm prontos do banco —
  // public.painel_televisao() (Etapa 2). Antes eram 11 consultas com oito
  // intervalos diferentes, três delas baixando tabelas inteiras a cada minuto.
  // Se a função ainda não existir no banco, o adaptador calcula o mesmo painel
  // no navegador (src/lib/painelTelevisao.js).
  const { painel: dados, atualizacao } = usePainelTV("principal", () => base44.functions.painelTelevisao());

  // Só para a FOTO. Muda raramente e a URL assinada vale 24 h.
  const { data: operators = [] } = useQuery({
    queryKey: ['operators-tv'],
    queryFn: () => base44.entities.Operator.list(),
    refetchInterval: 30 * 60000,
  });

  // Importacoes (SAP): outra fonte, muda uma vez por importação. Fica fora do
  // painel, com recarga longa.
  const { data: importacoes = [], isLoading: loadingImportacoes } = useQuery({
    queryKey: ['importacoes-tv'],
    queryFn: () => base44.entities.SapPedido.list(),
    refetchInterval: 10 * 60000,
    initialData: [],
  });

  const markMaterialAsRetirado = useMutation({
    mutationFn: async (recordId) => base44.entities.EnvaseRecord.update(recordId, { material_retirado: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['painel-tv', 'principal'] }),
  });

  const today = dados?.dia || format(new Date(), "yyyy-MM-dd");
  const envase = dados?.envase ?? { producao_dia: 0, concluidos: 0, lancados: 0, em_andamento: 0, operacoes: [] };
  const checkout = dados?.checkout ?? { total_dia: 0, concluidos: 0, pendentes: 0, em_andamento: 0, criticos: 0, operacoes: [] };
  const empilha = dados?.empilha ?? {
    total: 0, concluidas: 0, criticos_pendentes: 0, tempo_medio_min: 0, em_andamento: 0,
    ocorrencias_abertas: 0, parada_ativa: false, empilhadeira: null, operacoes: [],
  };
  const mes = dados?.mes ?? {
    total: 0, bio: 0, industrial: 0, registros: 0, bio_registros: 0, industrial_registros: 0, oleo: 0, graxa: 0, pasta: 0,
  };

  const envaseRecords = envase.operacoes;
  const checkoutItems = checkout.operacoes;
  const linhasAtivas = empilha.operacoes;

  // Os selos vêm da RPC, já resolvidos pelo produto de cada operação — a TV
  // não baixa mais o catálogo inteiro (1.599 produtos) para isso.
  const getProductCertifications = (r) => {
    const certs = [];
    // Com o logo, como a TV antiga: o selo é reconhecido pela imagem antes
    // de o nome ser lido.
    if (r.halal) certs.push({ nome: 'HALAL', logo: '/certificacoes/halal.png' });
    if (r.kosher) certs.push({ nome: 'KOSHER', logo: '/certificacoes/kosher.png' });
    if (r.nsf_3h) certs.push({ nome: 'NSF 3H', logo: '/certificacoes/nsf.png' });
    if (r.nsf_h1) certs.push({ nome: 'NSF H1', logo: '/certificacoes/nsf.png' });
    return certs;
  };
  // Pelo id primeiro: o nome falha com homônimos (CLAUDE.md §6).
  const getOperatorPhoto = (id, nome) =>
    (operators.find(op => op.id === id) || operators.find(op => op.nome === nome))?.foto_url || null;

  const ocorrenciasAbertas = empilha.ocorrencias_abertas;
  const empilhadeiraAtiva = empilha.empilhadeira;
  const tempoMedio = empilha.tempo_medio_min;

  const prevSlide = () => resetAutoPlay((slideIndex - 1 + NUM_SLIDES) % NUM_SLIDES);
  const nextSlide = () => resetAutoPlay((slideIndex + 1) % NUM_SLIDES);

  // ---------------------------------------------------------------------
  // O que cada slide mostra.
  //
  // A estrutura e a do prototipo TV-fabrica.html: anel da meta + dois numeros
  // gigantes + quatro cartoes de status no rodape.
  //
  // SOBRE A "META": o prototipo mostra "meta 150", e NAO EXISTE campo de meta
  // em lugar nenhum do banco (conferido em todas as colunas de public). Em vez
  // de inventar um numero, o anel mostra o que e real: a fracao CONCLUIDA do
  // que foi lancado hoje. Se o dono quiser meta de verdade, ela precisa de
  // coluna — esta anotado no relatorio.
  // ---------------------------------------------------------------------
  const emAndamentoEnvase = envase.em_andamento;
  // Correção 3 da migration: "lançados" conta cada envase uma vez. Antes era
  // concluídos + em andamento, e o Bio terminado aguardando retirada entrava
  // nos dois.
  const totalEnvaseHoje = envase.lancados;
  // Correção 2: o total do dia é o total; antes somava concluídos + total.
  const totalCheckoutHoje = checkout.total_dia;

  // Óleo, graxa e pasta: a categoria vem de products.categoria, agora
  // somada no banco (mes.oleo / mes.graxa / mes.pasta).
  const PAINEIS = [
    {
      modulo: 'Envase',
      titulo: 'Produção de hoje',
      meta: {
        rotulo: 'Concluídos',
        valor: envase.concluidos,
        total: totalEnvaseHoje,
        unidade: 'envases',
        legenda: totalEnvaseHoje > 0
          ? `${emAndamentoEnvase} em andamento · ${totalEnvaseHoje} lançados`
          : 'sem lançamentos',
      },
      numeros: [
        { rotulo: 'Produção de hoje', valor: Number(envase.producao_dia).toLocaleString('pt-BR'),
          pilula: `${mes.registros} registros no mês`, pilulaTom: 'atencao' },
        { rotulo: 'Ocorrências abertas', valor: ocorrenciasAbertas, tom: 'erro',
          pilula: ocorrenciasAbertas > 0 ? 'precisa de atenção' : 'nenhuma aberta',
          pilulaTom: ocorrenciasAbertas > 0 ? 'erro' : 'atencao' },
      ],
      tituloOperacoes: 'Envase em andamento',
      contagemOperacoes: `${envase.em_andamento} ${envase.em_andamento === 1 ? 'operação' : 'operações'}`,
      operacoes: operacoesEnvase(envaseRecords, { getOperatorPhoto, getProductCertifications, markMaterialAsRetirado }),
    },
    {
      modulo: 'Check-out',
      titulo: 'Expedição de hoje',
      meta: {
        rotulo: 'Concluídos',
        valor: checkout.concluidos,
        total: totalCheckoutHoje,
        unidade: 'pedidos',
        legenda: totalCheckoutHoje > 0
          ? `${checkout.pendentes} pendentes · ${totalCheckoutHoje} no dia`
          : 'sem pedidos',
      },
      numeros: [
        { rotulo: 'Em andamento', valor: checkout.em_andamento,
          pilula: `${checkout.pendentes} pendentes`, pilulaTom: 'atencao' },
        { rotulo: 'Pedidos críticos', valor: checkout.criticos, tom: 'erro',
          pilula: checkout.criticos > 0 ? 'prioridade' : 'nenhum crítico',
          pilulaTom: checkout.criticos > 0 ? 'erro' : 'atencao' },
      ],
      tituloOperacoes: 'Check-out em andamento',
      contagemOperacoes: `${checkout.em_andamento} ${checkout.em_andamento === 1 ? 'pedido' : 'pedidos'}`,
      operacoes: operacoesCheckout(checkoutItems, { getOperatorPhoto, hoje: today }),
    },
    {
      modulo: 'Empilhadeira',
      titulo: 'Movimentação de hoje',
      meta: {
        rotulo: 'Concluídas',
        valor: empilha.concluidas,
        total: empilha.total,
        unidade: 'linhas',
        legenda: empilha.total > 0
          ? `${empilha.total - empilha.concluidas} em aberto · ${empilha.total} no dia`
          : 'sem linhas',
      },
      numeros: [
        { rotulo: 'Tempo médio por linha',
          valor: tempoMedio > 0 ? `${tempoMedio}m` : '—',
          pilula: `${empilha.em_andamento} em andamento`, pilulaTom: 'atencao' },
        { rotulo: 'Críticos pendentes', valor: empilha.criticos_pendentes, tom: 'erro',
          pilula: empilha.criticos_pendentes > 0 ? 'prioridade' : 'nenhum crítico',
          pilulaTom: empilha.criticos_pendentes > 0 ? 'erro' : 'atencao' },
      ],
      tituloOperacoes: 'Movimentação em andamento',
      contagemOperacoes: `${empilha.em_andamento} ${empilha.em_andamento === 1 ? 'linha' : 'linhas'}`,
      operacoes: operacoesEmpilha(linhasAtivas, { getOperatorPhoto }),
    },
    {
      // OS NUMEROS DO MES, de volta. A TV anterior ao modulo 1 os mostrava no
      // topo do painel de envase; a reconstrucao tirou-os dizendo que
      // "duplicavam os cartoes grandes" — mas os cartoes grandes mostram o
      // DIA. Voltam como painel proprio, porque nao cabem ao lado das
      // operacoes sem espremer o que a fabrica le.
      modulo: 'Mês',
      titulo: 'Produção do mês',
      proprio: (
        <div
          className="grid min-h-0 flex-1"
          style={{
            gap: u(1.3),
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
          }}
        >
          <NumeroTV rotulo="Produção total" valor={Number(mes.total).toLocaleString('pt-BR')}
            pilula={`${mes.registros} registros`} atraso={0.05} />
          <NumeroTV rotulo="Sala Bio" valor={Number(mes.bio).toLocaleString('pt-BR')} tom="ok"
            pilula={`${mes.bio_registros} registros`} atraso={0.1} />
          <NumeroTV rotulo="Sala Industrial" valor={Number(mes.industrial).toLocaleString('pt-BR')}
            pilula={`${mes.industrial_registros} registros`} atraso={0.15} />
          <NumeroTV rotulo="Óleo" valor={Number(mes.oleo).toLocaleString('pt-BR')} pilula="unidades no mês" atraso={0.2} />
          <NumeroTV rotulo="Graxa" valor={Number(mes.graxa).toLocaleString('pt-BR')} pilula="unidades no mês" atraso={0.25} />
          <NumeroTV rotulo="Pasta" valor={Number(mes.pasta).toLocaleString('pt-BR')} pilula="unidades no mês" atraso={0.3} />
        </div>
      ),
    },
    {
      modulo: 'Importações',
      titulo: 'Importações previstas',
      // Este painel nao usa anel nem os dois numeros padrao: a propria
      // PainelImportacoes monta a faixa de cima inteira, porque o conteudo
      // (data da proxima chegada) nao cabe na forma "anel + dois numeros".
      proprio: <PainelImportacoes pedidos={importacoes} carregando={loadingImportacoes} />,
    },
  ];

  const painel = PAINEIS[slideIndex] || PAINEIS[0];

  // Rodape: quatro situacoes, cada uma com ponto de cor E texto.
  const diasAteManutencao = empilhadeiraAtiva?.data_proxima_manutencao
    ? Math.ceil((paraData(empilhadeiraAtiva.data_proxima_manutencao) - new Date()) / 86400000)
    : null;

  const situacoes = [
    {
      nome: 'Envase',
      situacao: emAndamentoEnvase > 0 ? `${emAndamentoEnvase} em andamento` : 'sem envase ativo',
      tom: emAndamentoEnvase > 0 ? 'ok' : 'neutro',
    },
    {
      nome: 'Check-out',
      situacao: checkout.pendentes > 0
        ? `${checkout.pendentes} pendentes` : 'tudo concluído',
      tom: checkout.pendentes > 0 ? 'atencao' : 'ok',
    },
    {
      nome: empilhadeiraAtiva?.nome || 'Empilhadeira',
      situacao: empilha.parada_ativa ? 'parada agora'
        : diasAteManutencao != null && diasAteManutencao <= 7
          ? `manutenção em ${Math.max(0, diasAteManutencao)} dias`
          : 'operando',
      tom: empilha.parada_ativa ? 'erro'
        : diasAteManutencao != null && diasAteManutencao <= 7 ? 'atencao' : 'ok',
    },
    {
      nome: 'Ocorrências',
      situacao: ocorrenciasAbertas > 0
        ? `${ocorrenciasAbertas} aberta(s) hoje` : 'nenhuma aberta',
      tom: ocorrenciasAbertas > 0 ? 'erro' : 'ok',
    },
  ];

  // O prototipo mostra "turno [TURNO]", mas nao existe dado de turno no
  // sistema e a TV roda numa conta compartilhada: nao ha operador de turno a
  // exibir. Fica de fora em vez de inventar.
  return (
    <MolduraTV
      titulo={painel.titulo}
      modulo={painel.modulo}
      atualizacao={atualizacao}
      acoes={
        <div className="flex items-center" style={{ gap: u(0.8) }}>
          <button
            type="button"
            onClick={() => setAutoPlay((a) => !a)}
            aria-label={autoPlay ? 'Pausar rotação' : 'Retomar rotação'}
            className="press rounded-full border border-white/15 bg-cartao/5 font-bold text-texto-fraco
                       hover:bg-cartao/10 hover:text-tinta"
            style={{ padding: `${u(0.5)} ${u(1)}`, fontSize: u(0.95) }}
          >
            {autoPlay ? 'Pausar' : 'Retomar'}
          </button>
          <div className="flex items-center" style={{ gap: u(0.45) }} role="tablist" aria-label="Painel">
            {PAINEIS.map((pnl, i) => (
              <button
                key={pnl.modulo}
                type="button"
                role="tab"
                aria-selected={i === slideIndex}
                aria-label={pnl.modulo}
                onClick={() => resetAutoPlay(i)}
                className="press rounded-full transition-all"
                style={{
                  height: u(0.65),
                  width: i === slideIndex ? u(2) : u(0.65),
                  background: i === slideIndex ? 'rgb(var(--marca))' : 'rgb(255 255 255 / .25)',
                }}
              />
            ))}
          </div>
        </div>
      }
      rodape={situacoes.map((s, i) => (
        <StatusTV key={s.nome} nome={s.nome} situacao={s.situacao} tom={s.tom} atraso={0.45 + i * 0.05} />
      ))}
    >
      {/* Painel que monta o proprio miolo (Importacoes) */}
      {painel.proprio}

      {!painel.proprio && (painel.operacoes.length > 0 ? (
        /*
          COM OPERACOES EM ANDAMENTO: elas sao o centro.

          A versao anterior punha o anel e os dois numeros GIGANTES em cima e
          espremia a lista numa faixa embaixo; numa tela baixa os numeros
          transbordavam e cobriam a lista. Mas quem esta fazendo o que, em
          cada linha, e o que a fabrica realmente le na TV. Agora: operacoes em
          2/3, anel e numeros compactos em 1/3.
        */
        <div
          className="grid min-h-0 flex-1"
          style={{ gap: u(1.3), gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}
        >
          <GradeOperacoes
            titulo={painel.tituloOperacoes}
            contagem={painel.contagemOperacoes}
            itens={painel.operacoes}
          />

          <div
            className="grid min-h-0 min-w-0"
            style={{ gap: u(1.3), gridTemplateRows: 'minmax(0, 1.15fr) minmax(0, 1fr)' }}
          >
            <MetaTV
              compacto
              rotulo={painel.meta.rotulo}
              valor={painel.meta.valor}
              meta={painel.meta.total}
              unidade={painel.meta.unidade}
              legenda={painel.meta.legenda}
            />
            <div
              className="grid min-h-0 min-w-0"
              style={{ gap: u(1.3), gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
            >
              {painel.numeros.map((n, i) => (
                <NumeroTV key={n.rotulo} compacto {...n} atraso={0.15 + i * 0.1} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* SEM OPERACOES: o layout grande do prototipo — anel + dois numeros. */
        <div
          className="grid min-h-0 flex-1"
          style={{
            gap: u(1.3),
            gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr)',
          }}
        >
          <MetaTV
            rotulo={painel.meta.rotulo}
            valor={painel.meta.valor}
            meta={painel.meta.total}
            unidade={painel.meta.unidade}
            legenda={painel.meta.legenda}
          />
          {painel.numeros.map((n, i) => (
            <NumeroTV key={n.rotulo} {...n} atraso={0.15 + i * 0.15} />
          ))}
        </div>
      ))}
    </MolduraTV>
  );
}
