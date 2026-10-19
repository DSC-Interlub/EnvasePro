/**
 * O painel geral (/Painel) — no formato que a RPC `public.painel_geral()`
 * devolve. É o RECUO para quando a função ainda não existe no banco.
 *
 * Regras e as sete correções: migration 20261019000003_painel_geral.sql.
 * O teste scripts/test-painel-geral.mjs exige o mesmo objeto da RPC.
 *
 * Sem dependências: roda no navegador e no Node.
 */

/** Data de Brasília ("AAAA-MM-DD") de um instante ISO. */
export function diaEmBrasilia(instante) {
  if (!instante) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(instante));
}

/** Segunda-feira da semana de `dia` e o domingo seguinte. */
export function limitesDaSemana(dia) {
  const d = new Date(`${dia}T12:00:00Z`);
  const recuo = (d.getUTCDay() + 6) % 7; // segunda = 0
  const seg = new Date(d.getTime() - recuo * 86400000);
  const dom = new Date(seg.getTime() + 6 * 86400000);
  const iso = (x) => x.toISOString().slice(0, 10);
  return { semana: iso(seg), semanaFim: iso(dom) };
}

/** O Math.round do JS — o mesmo que floor(x + 0.5) na função SQL. */
const mediaNota = (lista) => (lista.length
  ? Math.round(lista.reduce((s, c) => s + (Number(c.nota_final) || 0), 0) / lista.length)
  : null);
const soma = (lista) => lista.reduce((s, r) => s + (Number(r.quantidade_produzida) || 0), 0);
const porId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const instante = (t) => (t ? Date.parse(t) : 0);

/**
 * Cada lista já vem filtrada pelo que a regra precisa (o adaptador filtra no
 * banco); esta função só conta e ordena.
 */
export function calcularPainelGeral({
  dia,
  envaseSemana,         // envase_records com data entre segunda e hoje
  checkoutHoje,          // checkout_itens das programações de hoje
  checkoutConcluidosSemana, // checkout_itens Concluído, atualizados desde segunda (Brasília)
  linhasConcluidasSemana,   // empilha_linhas Concluído, atualizadas desde segunda
  empilhaAtivasHoje,     // empilha_linhas Em Andamento das programações de hoje
  linhasSemAssinatura,   // contagem: empilha Concluído sem assinatura do líder
  recebimentos,          // recebimentos: os criados na semana + os em andamento + os concluídos sem líder
  participantes,         // recebimento_participantes dos recebimentos em andamento
  checklistsSemana,      // checklist_recebimentos criados desde segunda (Brasília)
  limpezas,              // limpeza_programacoes: as da semana + as atrasadas + as aguardando líder
  nfsSemana,             // contagem de NFs criadas desde segunda
  nfsSemArquivo3dias,    // contagem
  ocorrenciasEmpilha,    // empilha_ocorrencias não resolvidas
  ocorrenciasRecebimento,// recebimento_ocorrencias não resolvidas
  paradasHoje,           // empilhadeira_paradas de hoje
  empilhadeiras,         // empilhadeira_configs
}) {
  const { semana, semanaFim } = limitesDaSemana(dia);
  const envaseHoje = envaseSemana.filter((r) => r.data === dia);
  const ckHoje = checklistsSemana.filter((c) => diaEmBrasilia(c.created_at) === dia);
  const limpHoje = limpezas.filter((l) => l.data_prevista === dia);
  const limpSemana = limpezas.filter((l) => l.data_prevista >= semana && l.data_prevista <= semanaFim);

  const envaseAtivo = envaseHoje.filter((r) => r.inicio
    && (r.sala === "Bio" ? r.material_retirado !== true : r.termino == null));
  const checkoutAtivo = checkoutHoje.filter((i) =>
    i.hora_inicio && i.hora_termino == null && i.status === "Em Andamento");
  const recAtivo = recebimentos.filter((r) => r.status === "Em andamento");
  const ordemLinha = (l) => (l.tipo_linha === "Crítico" ? 0 : l.tipo_linha === "Avulso" ? 1 : 2);
  const hora = (t) => (t ? String(t) : "￿");
  const parada = [...paradasHoje].filter((p) => p.hora_fim == null)
    .sort((a, b) => instante(b.created_at) - instante(a.created_at))[0];

  const limiteManut = new Date(`${dia}T12:00:00Z`);
  limiteManut.setUTCDate(limiteManut.getUTCDate() + 7);
  const diaLimite = limiteManut.toISOString().slice(0, 10);

  const ocorrencias = [
    ...[...ocorrenciasEmpilha].sort((a, b) => (instante(b.created_at) - instante(a.created_at)) || porId(a, b))
      .map((o) => ({ ...o, modulo: "Empilhadeira" })),
    ...[...ocorrenciasRecebimento].sort((a, b) => (instante(b.created_at) - instante(a.created_at)) || porId(a, b))
      .map((o) => ({ ...o, modulo: "Recebimento" })),
  ].slice(0, 5).map((o) => ({
    id: o.id, modulo: o.modulo, tipo: o.tipo ?? null, descricao: o.descricao ?? null,
    registrado_por: o.registrado_por ?? null, created_at: o.created_at ?? null,
  }));

  return {
    dia,
    semana_inicio: semana,
    hoje: {
      envases: envaseHoje.length,
      envases_concluidos: envaseHoje.filter((r) => r.termino != null).length,
      producao: soma(envaseHoje),
      checklists: ckHoje.length,
      nota_media: mediaNota(ckHoje),
      limpezas: limpHoje.length,
      limpezas_concluidas: limpHoje.filter((l) => l.status === "Concluído").length,
    },
    semana: {
      envases: envaseSemana.length,
      producao: soma(envaseSemana),
      checkouts_concluidos: checkoutConcluidosSemana.length,
      linhas_movimentadas: linhasConcluidasSemana.length,
      recebimentos: recebimentos.filter((r) => diaEmBrasilia(r.created_at) >= semana).length,
      checklists: checklistsSemana.length,
      nota_media: mediaNota(checklistsSemana),
      limpezas: limpSemana.length,
      limpezas_concluidas: limpSemana.filter((l) => l.status === "Concluído").length,
      nfs: nfsSemana,
    },
    pendencias: {
      assinaturas: linhasSemAssinatura
        + limpezas.filter((l) => l.status === "Concluído" && l.assinatura_responsavel === true && l.assinatura_lider !== true).length
        + recebimentos.filter((r) => r.status === "Concluído" && r.assinatura_lider !== true).length,
      ocorrencias: ocorrenciasEmpilha.length + ocorrenciasRecebimento.length,
      limpezas_atrasadas: limpezas.filter((l) => l.data_prevista < dia && l.status !== "Concluído").length,
      checklists_reprovados_hoje: ckHoje.filter((c) => (Number(c.nota_final) || 0) < 0).length,
      nfs_sem_arquivo_3dias: nfsSemArquivo3dias,
      manutencao: empilhadeiras.filter((e) => e.data_proxima_manutencao && e.data_proxima_manutencao <= diaLimite).length,
    },
    ao_vivo: {
      envase: {
        total: envaseAtivo.length,
        itens: [...envaseAtivo].sort((a, b) => (instante(b.updated_at) - instante(a.updated_at)) || porId(a, b))
          .slice(0, 4).map((r) => ({
            id: r.id, operador: r.operador ?? null, operator_id: r.operator_id ?? null, sala: r.sala ?? null,
            descricao_produto: r.descricao_produto ?? null, quantidade_produzida: r.quantidade_produzida ?? null,
            inicio: r.inicio ?? null, atualizado: r.updated_at ?? null,
          })),
      },
      checkout: {
        total: checkoutAtivo.length,
        criticos: checkoutHoje.filter((i) => i.critico === true && i.status !== "Concluído").length,
        itens: [...checkoutAtivo].sort((a, b) => String(b.hora_inicio).localeCompare(String(a.hora_inicio)) || porId(a, b))
          .slice(0, 4).map((i) => ({
            id: i.id, numero_pedido: i.numero_pedido ?? null, cliente: i.cliente ?? null,
            operador: i.operador ?? null, operator_id: i.operator_id ?? null, critico: i.critico ?? null,
            data_entrega: i.data_entrega ?? null, hora_inicio: i.hora_inicio ?? null,
          })),
      },
      empilha: {
        total: empilhaAtivasHoje.length,
        parada: parada ? { tipo: parada.tipo ?? null, hora_inicio: parada.hora_inicio ?? null } : null,
        itens: [...empilhaAtivasHoje]
          .sort((a, b) => (ordemLinha(a) - ordemLinha(b)) || hora(a.hora_inicio).localeCompare(hora(b.hora_inicio)) || porId(a, b))
          .slice(0, 4).map((l) => ({
            id: l.id, operador_empilhadeira: l.operador_empilhadeira ?? null,
            operador_empilhadeira_id: l.operador_empilhadeira_id ?? null, tipo_linha: l.tipo_linha ?? null,
            numero_item: l.numero_item ?? null, descricao_produto: l.descricao_produto ?? null,
            codigo_produto: l.codigo_produto ?? null, hora_inicio: l.hora_inicio ?? null,
          })),
      },
      recebimento: {
        total: recAtivo.length,
        itens: [...recAtivo].sort((a, b) => (instante(b.created_at) - instante(a.created_at)) || porId(a, b))
          .slice(0, 4).map((r) => {
            const parts = participantes.filter((p) => p.recebimento_id === r.id)
              .sort((a, b) => (instante(b.created_at) - instante(a.created_at)) || porId(a, b));
            return {
              id: r.id, tipo: r.tipo ?? null, prioridade: r.prioridade ?? null,
              numero_documento: r.numero_documento ?? null, fornecedor_nome: r.fornecedor_nome ?? null,
              datetime_inicio: r.datetime_inicio ?? null, criado: r.created_at ?? null,
              participantes: parts.length,
              primeiro: parts[0] ? { id: parts[0].operator_id ?? null, nome: parts[0].operator_nome ?? null } : null,
            };
          }),
      },
    },
    ocorrencias,
    calculado_no: "navegador",
  };
}
