import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MolduraTV, CartaoVidro, NumeroTV, MetaTV, StatusTV, ListaTV, PainelImportacoes } from "@/components/fluxo/tv";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Factory, Package, Clock, User, TrendingUp, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Warehouse, AlertTriangle, OctagonX, BarChart2, Droplets, Layers, Circle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatarData } from '@/lib/datas';

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

/* ===================== SLIDE 1: ENVASE ===================== */
/**
 * As listas de cada modulo, na gramatica de vidro da TV.
 *
 * O QUE MUDOU
 *
 * Cada slide tinha a sua lista, com cartao de gradiente colorido, borda
 * esquerda de 4px e texto de 10px. A 4 metros 10px nao se le, e um gradiente
 * por linha fazia a tela parecer um semaforo. Agora e `ListaTV`: linha de
 * vidro, texto principal de 28px, estado por ponto de cor MAIS a palavra.
 *
 * Os painels de KPI do mes sairam daqui: eles duplicavam o que os cartoes
 * grandes do topo ja mostram, e competiam com eles.
 *
 * NENHUM DADO MUDOU — as mesmas consultas, os mesmos campos.
 */
function SlideEnvase({ envaseRecords, loadingEnvase, getProductCertifications, getOperatorPhoto, markMaterialAsRetirado }) {
  return (
    <ListaTV
      titulo="Envase em andamento"
      contagem={`${envaseRecords.length} ${envaseRecords.length === 1 ? 'operação ativa' : 'operações ativas'}`}
      carregando={loadingEnvase}
      vazio="Nenhum envase em andamento agora"
      itens={envaseRecords.map((r) => ({
        id: r.id,
        tom: r.sala === 'Bio' ? 'ok' : 'neutro',
        foto: getOperatorPhoto(r.operador),
        principal: r.descricao_produto || 'Produto não especificado',
        secundario: `OP ${r.op || 'N/A'} · ${r.operador || 'sem operador'} · sala ${r.sala || '—'}`,
        etiquetas: (getProductCertifications(r.codigo_produto) || []).map((c) => c.name),
        direita: r.quantidade_produzida > 0 ? r.quantidade_produzida.toLocaleString('pt-BR') : null,
        direitaLegenda: r.quantidade_produzida > 0 ? 'produzido' : null,
        // A unica acao da TV: a sala Bio marca que o material foi retirado.
        // Mesma regra de antes — so aparece em linha Bio ja concluida.
        acao: r.sala === 'Bio' && r.termino && !r.material_retirado
          ? { rotulo: 'Material retirado', aoClicar: () => markMaterialAsRetirado.mutate(r.id) }
          : null,
      }))}
    />
  );
}

function SlideCheckout({ checkoutItems, loadingCheckout, getOperatorPhoto }) {
  return (
    <ListaTV
      titulo="Check-out em andamento"
      contagem={`${checkoutItems.length} ${checkoutItems.length === 1 ? 'item ativo' : 'itens ativos'}`}
      carregando={loadingCheckout}
      vazio="Nenhum check-out em andamento agora"
      itens={checkoutItems.map((i) => ({
        id: i.id,
        tom: i.critico ? 'erro' : 'neutro',
        foto: getOperatorPhoto(i.operador),
        principal: i.descricao_produto || i.codigo_produto || 'Item',
        secundario: `${i.operador || 'sem operador'}${i.status ? ` · ${i.status}` : ''}${i.critico ? ' · crítico' : ''}`,
        direita: i.quantidade > 0 ? Number(i.quantidade).toLocaleString('pt-BR') : null,
        direitaLegenda: i.quantidade > 0 ? 'unidades' : null,
      }))}
    />
  );
}

function SlideEmpilha({ empilhadeiraData, getOperatorPhoto }) {
  const linhas = empilhadeiraData.linhasAtivas || [];
  return (
    <ListaTV
      titulo="Movimentação em andamento"
      contagem={`${linhas.length} ${linhas.length === 1 ? 'linha ativa' : 'linhas ativas'}`}
      vazio="Nenhuma movimentação em andamento agora"
      itens={linhas.map((l) => ({
        id: l.id,
        tom: l.tipo_linha === 'Crítico' ? 'erro' : l.status === 'Pausado' ? 'atencao' : 'neutro',
        foto: getOperatorPhoto(l.operador_empilhadeira),
        principal: l.descricao_produto || l.codigo_produto || 'Linha',
        secundario: `${l.operador_empilhadeira || 'sem operador'}${l.status ? ` · ${l.status}` : ''}${l.tipo_linha ? ` · ${l.tipo_linha}` : ''}`,
        direita: l.quantidade > 0 ? Number(l.quantidade).toLocaleString('pt-BR') : null,
        direitaLegenda: l.quantidade > 0 ? 'unidades' : null,
      }))}
    />
  );
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

  // Quatro paineis: Envase, Check-out, Empilhadeira e Importacoes.
  const NUM_SLIDES = 4;

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

  const { data: allEnvaseRecords = [], isLoading: loadingEnvase } = useQuery({
    queryKey: ['envase-live'],
    queryFn: () => base44.entities.EnvaseRecord.list("-updated_date", 100),
    refetchInterval: 30000,
  });

  const { data: allCheckoutItems = [], isLoading: loadingCheckout } = useQuery({
    queryKey: ['checkout-live'],
    queryFn: () => base44.entities.CheckoutItem.list("-updated_date", 100),
    refetchInterval: 35000,
  });

  const { data: checkoutProgramacoes = [] } = useQuery({
    queryKey: ['checkout-programacoes-tv'],
    queryFn: () => base44.entities.CheckoutProgramacao.list(),
    refetchInterval: 60000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-tv'],
    queryFn: () => base44.entities.Product.list(),
    refetchInterval: 300000,
  });

  const { data: operators = [] } = useQuery({
    queryKey: ['operators-tv'],
    queryFn: () => base44.entities.Operator.list(),
    refetchInterval: 120000,
  });

  const { data: monthlyKpis = { total: 0, bio: 0, industrial: 0, totalRegistros: 0, bioRegistros: 0, industrialRegistros: 0 } } = useQuery({
    queryKey: ['monthly-kpis-tv'],
    queryFn: async () => {
      const currentMonth = format(new Date(), "yyyy-MM");
      const all = await base44.entities.EnvaseRecord.list("-data", 2000);
      const monthRecords = all.filter(r => {
        if (!r.data) return false;
        return r.data.startsWith(currentMonth);
      });
      const bioRecs = monthRecords.filter(r => r.sala === "Bio");
      const indRecs = monthRecords.filter(r => r.sala === "Industrial");
      return {
        total: monthRecords.reduce((s, r) => s + (r.quantidade_produzida || 0), 0),
        bio: bioRecs.reduce((s, r) => s + (r.quantidade_produzida || 0), 0),
        industrial: indRecs.reduce((s, r) => s + (r.quantidade_produzida || 0), 0),
        totalRegistros: monthRecords.length,
        bioRegistros: bioRecs.length,
        industrialRegistros: indRecs.length,
      };
    },
    refetchInterval: 120000,
  });


  const { data: todayStats = { envaseTotal: 0, envaseConcluidos: 0, checkoutConcluidos: 0, checkoutPendentes: 0 } } = useQuery({
    queryKey: ['today-stats'],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const allRecords = await base44.entities.EnvaseRecord.list();
      const todayRecords = allRecords.filter(r => r.data === today);
      const allProgramacoes = await base44.entities.CheckoutProgramacao.list();
      const todayProgramacoes = allProgramacoes.filter(p => p.data_programada === today);
      const todayProgramacaoIds = todayProgramacoes.map(p => p.id);
      const allCheckouts = await base44.entities.CheckoutItem.list();
      const todayCheckouts = allCheckouts.filter(item => todayProgramacaoIds.includes(item.programacao_id));
      return {
        envaseTotal: todayRecords.reduce((sum, r) => sum + (r.quantidade_produzida || 0), 0),
        envaseConcluidos: todayRecords.filter(r => r.termino).length,
        checkoutConcluidos: todayCheckouts.filter(item => item.status === "Concluído").length,
        checkoutPendentes: todayCheckouts.length,
      };
    },
    refetchInterval: 60000,
  });

  /* ---- Dados Empilhadeira ---- */
  const { data: empilhaProgramacoes = [] } = useQuery({
    queryKey: ['empilha-prog-tv'],
    queryFn: () => base44.entities.EmpilhaProgramacao.list("-data_programada"),
    refetchInterval: 60000,
  });

  const { data: empilhaLinhas = [] } = useQuery({
    queryKey: ['empilha-linhas-tv'],
    queryFn: () => base44.entities.EmpilhaLinha.list(),
    refetchInterval: 40000,
  });

  const { data: empilhaParadas = [] } = useQuery({
    queryKey: ['empilha-paradas-tv'],
    queryFn: () => base44.entities.EmpilhadeiraParada.list("-data"),
    refetchInterval: 45000,
  });

  const { data: empilhaOcorrencias = [] } = useQuery({
    queryKey: ['empilha-ocorr-tv'],
    queryFn: () => base44.entities.EmpilhaOcorrencia.list("-data"),
    refetchInterval: 50000,
  });

  const { data: empilhadeiras = [] } = useQuery({
    queryKey: ['empilhadeiras-tv'],
    queryFn: () => base44.entities.EmpilhadeiraConfig.list(),
    refetchInterval: 300000,
  });


  // Importacoes (SAP): voltou como o quarto painel do carrossel, a pedido do
  // dono. Mesma consulta de antes.
  const { data: importacoes = [], isLoading: loadingImportacoes } = useQuery({
    queryKey: ['importacoes-tv'],
    queryFn: () => base44.entities.SapPedido.list(),
    refetchInterval: 300000,
    initialData: [],
  });

  const markMaterialAsRetirado = useMutation({
    mutationFn: async (recordId) => base44.entities.EnvaseRecord.update(recordId, { material_retirado: true }),
    onSuccess: () => queryClient.invalidateQueries(['envase-live']),
  });

  const today = format(new Date(), "yyyy-MM-dd");

  const envaseRecords = allEnvaseRecords.filter(r => {
    if (!r.inicio) return false;
    if (r.sala === "Bio") { if (r.material_retirado) return false; }
    else { if (r.termino) return false; }
    return r.data === today;
  }).slice(0, 4);

  const todayProgramacoes = checkoutProgramacoes.filter(p => p.data_programada === today);
  const todayProgramacaoIds = todayProgramacoes.map(p => p.id);
  const checkoutItems = allCheckoutItems
    .filter(item => item.hora_inicio && !item.hora_termino && item.status === "Em Andamento" && todayProgramacaoIds.includes(item.programacao_id))
    .sort((a, b) => (b.hora_inicio || "").localeCompare(a.hora_inicio || ""))
    .slice(0, 2);

  const getProductCertifications = (codigoProduto) => {
    if (!products || !codigoProduto) return [];
    const product = products.find(p => p.codigo === codigoProduto);
    if (!product) return [];
    const certs = [];
    if (product.halal) certs.push({ name: 'HALAL' });
    if (product.kosher) certs.push({ name: 'KOSHER' });
    if (product.nsf_3h) certs.push({ name: 'NSF 3H' });
    if (product.nsf_h1) certs.push({ name: 'NSF H1' });
    return certs;
  };
  const getOperatorPhoto = (nome) => operators.find(op => op.nome === nome)?.foto_url || null;

  const todayProgIds = empilhaProgramacoes.filter(p => p.data_programada === today).map(p => p.id);
  const todayLinhas = empilhaLinhas.filter(l => todayProgIds.includes(l.programacao_id));
  const linhasAtivas = [
    ...todayLinhas.filter(l => l.tipo_linha === "Crítico" && l.status === "Em Andamento"),
    ...todayLinhas.filter(l => l.tipo_linha === "Avulso" && l.status === "Em Andamento"),
    ...todayLinhas.filter(l => (l.tipo_linha === "Normal" || !l.tipo_linha) && l.status === "Em Andamento"),
  ];
  const paradaAtiva = empilhaParadas.find(p => p.data === today && !p.hora_fim);
  const ocorrenciasAtivas = empilhaOcorrencias.filter(o => o.data === today && !o.resolvido);
  const temposMins = todayLinhas.filter(l => l.status === "Concluído" && l.tempo_total)
    .map(l => { const [h, m] = (l.tempo_total || "0:0").split(":").map(Number); return h * 60 + (m || 0); });
  const tempoMedio = temposMins.length > 0 ? Math.round(temposMins.reduce((a, b) => a + b, 0) / temposMins.length) : 0;
  const empilhadeiraAtiva = empilhadeiras.find(e => e.ativa);

  const empilhadeiraData = {
    linhasAtivas,
    empilhadeira: empilhadeiraAtiva,
    paradaAtiva,
    ocorrencias: ocorrenciasAtivas,
    kpis: {
      total: todayLinhas.length,
      concluidas: todayLinhas.filter(l => l.status === "Concluído").length,
      criticos: todayLinhas.filter(l => l.tipo_linha === "Crítico" && l.status !== "Concluído").length,
      tempoMedio,
    },
  };

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
  const emAndamentoEnvase = envaseRecords.length;
  const totalEnvaseHoje = todayStats.envaseConcluidos + emAndamentoEnvase;
  const totalCheckoutHoje = todayStats.checkoutConcluidos + todayStats.checkoutPendentes;

  const PAINEIS = [
    {
      modulo: 'Envase',
      titulo: 'Produção de hoje',
      meta: {
        rotulo: 'Concluídos',
        valor: todayStats.envaseConcluidos,
        total: totalEnvaseHoje,
        unidade: 'envases',
        legenda: totalEnvaseHoje > 0
          ? `${emAndamentoEnvase} em andamento · ${totalEnvaseHoje} lançados`
          : 'sem lançamentos',
      },
      numeros: [
        { rotulo: 'Produção de hoje', valor: todayStats.envaseTotal.toLocaleString('pt-BR'),
          pilula: `${monthlyKpis.totalRegistros} registros no mês`, pilulaTom: 'atencao' },
        { rotulo: 'Ocorrências abertas', valor: ocorrenciasAtivas.length, tom: 'erro',
          pilula: ocorrenciasAtivas.length > 0 ? 'precisa de atenção' : 'nenhuma aberta',
          pilulaTom: ocorrenciasAtivas.length > 0 ? 'erro' : 'atencao' },
      ],
      temLinhas: envaseRecords.length > 0,
      detalhe: (
        <SlideEnvase
          envaseRecords={envaseRecords}
          loadingEnvase={loadingEnvase}
          getProductCertifications={getProductCertifications}
          getOperatorPhoto={getOperatorPhoto}
          markMaterialAsRetirado={markMaterialAsRetirado}
          monthlyKpis={monthlyKpis}
        />
      ),
    },
    {
      modulo: 'Check-out',
      titulo: 'Expedição de hoje',
      meta: {
        rotulo: 'Concluídos',
        valor: todayStats.checkoutConcluidos,
        total: totalCheckoutHoje,
        unidade: 'pedidos',
        legenda: totalCheckoutHoje > 0
          ? `${todayStats.checkoutPendentes} pendentes · ${totalCheckoutHoje} no dia`
          : 'sem pedidos',
      },
      numeros: [
        { rotulo: 'Em andamento', valor: checkoutItems.length,
          pilula: `${todayStats.checkoutPendentes} pendentes`, pilulaTom: 'atencao' },
        { rotulo: 'Pedidos críticos', valor: checkoutItems.filter((i) => i.critico).length, tom: 'erro',
          pilula: checkoutItems.filter((i) => i.critico).length > 0 ? 'prioridade' : 'nenhum crítico',
          pilulaTom: checkoutItems.filter((i) => i.critico).length > 0 ? 'erro' : 'atencao' },
      ],
      temLinhas: checkoutItems.length > 0,
      detalhe: (
        <SlideCheckout
          checkoutItems={checkoutItems}
          loadingCheckout={loadingCheckout}
          getOperatorPhoto={getOperatorPhoto}
        />
      ),
    },
    {
      modulo: 'Empilhadeira',
      titulo: 'Movimentação de hoje',
      meta: {
        rotulo: 'Concluídas',
        valor: empilhadeiraData.kpis.concluidas,
        total: empilhadeiraData.kpis.total,
        unidade: 'linhas',
        legenda: empilhadeiraData.kpis.total > 0
          ? `${empilhadeiraData.kpis.total - empilhadeiraData.kpis.concluidas} em aberto · ${empilhadeiraData.kpis.total} no dia`
          : 'sem linhas',
      },
      numeros: [
        { rotulo: 'Tempo médio por linha',
          valor: empilhadeiraData.kpis.tempoMedio > 0 ? `${empilhadeiraData.kpis.tempoMedio}m` : '—',
          pilula: `${empilhadeiraData.linhasAtivas.length} em andamento`, pilulaTom: 'atencao' },
        { rotulo: 'Críticos pendentes', valor: empilhadeiraData.kpis.criticos, tom: 'erro',
          pilula: empilhadeiraData.kpis.criticos > 0 ? 'prioridade' : 'nenhum crítico',
          pilulaTom: empilhadeiraData.kpis.criticos > 0 ? 'erro' : 'atencao' },
      ],
      temLinhas: (empilhadeiraData.linhasAtivas || []).length > 0,
      detalhe: (
        <SlideEmpilha
          empilhadeiraData={empilhadeiraData}
          getOperatorPhoto={getOperatorPhoto}
        />
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
    ? Math.ceil((new Date(empilhadeiraAtiva.data_proxima_manutencao) - new Date()) / 86400000)
    : null;

  const situacoes = [
    {
      nome: 'Envase',
      situacao: emAndamentoEnvase > 0 ? `${emAndamentoEnvase} em andamento` : 'sem envase ativo',
      tom: emAndamentoEnvase > 0 ? 'ok' : 'neutro',
    },
    {
      nome: 'Check-out',
      situacao: todayStats.checkoutPendentes > 0
        ? `${todayStats.checkoutPendentes} pendentes` : 'tudo concluído',
      tom: todayStats.checkoutPendentes > 0 ? 'atencao' : 'ok',
    },
    {
      nome: empilhadeiraAtiva?.nome || 'Empilhadeira',
      situacao: empilhadeiraData.paradaAtiva ? 'parada agora'
        : diasAteManutencao != null && diasAteManutencao <= 7
          ? `manutenção em ${Math.max(0, diasAteManutencao)} dias`
          : 'operando',
      tom: empilhadeiraData.paradaAtiva ? 'erro'
        : diasAteManutencao != null && diasAteManutencao <= 7 ? 'atencao' : 'ok',
    },
    {
      nome: 'Ocorrências',
      situacao: ocorrenciasAtivas.length > 0
        ? `${ocorrenciasAtivas.length} aberta(s) hoje` : 'nenhuma aberta',
      tom: ocorrenciasAtivas.length > 0 ? 'erro' : 'ok',
    },
  ];

  // O prototipo mostra "turno [TURNO]", mas nao existe dado de turno no
  // sistema e a TV roda numa conta compartilhada: nao ha operador de turno a
  // exibir. Fica de fora em vez de inventar.
  return (
    <MolduraTV
      titulo={painel.titulo}
      modulo={painel.modulo}
      acoes={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoPlay((a) => !a)}
            aria-label={autoPlay ? 'Pausar rotação' : 'Retomar rotação'}
            className="press rounded-token border border-white/15 bg-cartao/5 px-3 py-2
                       text-sm font-bold text-texto-fraco hover:bg-cartao/10 hover:text-tinta"
          >
            {autoPlay ? 'Pausar' : 'Retomar'}
          </button>
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Painel">
            {PAINEIS.map((pnl, i) => (
              <button
                key={pnl.modulo}
                type="button"
                role="tab"
                aria-selected={i === slideIndex}
                aria-label={pnl.modulo}
                onClick={() => resetAutoPlay(i)}
                className={`press h-3 rounded-full transition-all ${
                  i === slideIndex ? 'w-8 bg-marca' : 'w-3 bg-cartao/25 hover:bg-cartao/40'}`}
              />
            ))}
          </div>
        </div>
      }
      rodape={situacoes.map((s, i) => (
        <StatusTV key={s.nome} nome={s.nome} situacao={s.situacao} tom={s.tom} atraso={0.45 + i * 0.05} />
      ))}
    >
      {/* Painel que monta a propria faixa de cima (Importacoes) */}
      {painel.proprio}

      {/* A faixa de cima e a do prototipo: anel da meta (1.25fr) + dois numeros */}
      {!painel.proprio && (
      <div
        className="grid min-h-0 flex-1 lg:grid-cols-[1.25fr_1fr_1fr]"
        style={{ gap: 'clamp(14px, 1.5vw, 28px)' }}
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
      )}

      {/*
        ESTA FAIXA NAO ESTA NO PROTOTIPO, e e uma decisao declarada.

        O prototipo mostra so agregado. Mas a lista de envases EM ANDAMENTO, com
        foto do operador e certificacao do produto, e o que a fabrica de fato
        olha na TV — tirar isso para ganhar fidelidade visual seria trocar
        funcao por aparencia. Fica aqui, com a mesma gramatica de vidro, e
        esta na lista de divergencias do relatorio.
      */}
      {painel.detalhe && painel.temLinhas && (
        <CartaoVidro atraso={0.35} className="min-h-0 flex-1 overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto" style={{ padding: 'clamp(14px, 1.5vw, 28px)' }}>
            {painel.detalhe}
          </div>
        </CartaoVidro>
      )}
    </MolduraTV>
  );
}
