/**
 * Os indicadores da empilhadeira num período — no formato que a RPC
 * `public.indicadores_empilhadeira(de, ate)` devolve.
 *
 * As contas são as que viviam DENTRO de src/components/empilhadeira/
 * BlocosIndicadores.jsx (o componente agora só desenha). Mudou só o que está
 * declarado na migration 20261019000004_indicadores_empilhadeira.sql:
 * desempates em ordem alfabética, parada sem tipo rotulada "Sem tipo",
 * período invertido devolve vazio em vez de derrubar a tela.
 *
 * É também o RECUO, quando a função não existe no banco. O teste
 * scripts/test-indicadores-empilha.mjs exige o mesmo objeto da RPC.
 *
 * Sem dependências: roda no navegador e no Node.
 */

/** "X:MM" → minutos; "X min" → X. A regra de antes, linha a linha. */
export function minutosDe(str) {
  if (!str) return 0;
  if (str.includes("min")) return parseInt(str) || 0;
  const [h, m] = str.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** O parseInt das paradas: "45" → 45, "1:30" → 1, lixo → 0. */
const minutosParada = (t) => parseInt(t) || 0;

const media = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const porNome = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Os dias de `de` a `ate`, inclusive, "AAAA-MM-DD". Vazio se invertido. */
export function diasDoPeriodo(de, ate) {
  if (!de || !ate || de > ate) return [];
  const dias = [];
  for (let d = new Date(`${de}T12:00:00Z`); d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}

/**
 * @param {object} p
 * @param {string} p.de, p.ate          "AAAA-MM-DD"
 * @param {object[]} p.programacoes     empilha_programacoes do período
 * @param {object[]} p.linhas           empilha_linhas dessas programações
 * @param {object[]} p.paradas          empilhadeira_paradas do período
 * @param {object[]} p.ocorrencias      empilha_ocorrencias do período
 * @param {number|null} p.duracaoTurnoHoras  da empilhadeira ativa
 */
export function calcularIndicadoresEmpilha({ de, ate, programacoes, linhas, paradas, ocorrencias, duracaoTurnoHoras }) {
  const turnoHoras = Number(duracaoTurnoHoras) || 8;
  const turnoMin = turnoHoras * 60;
  const dias = diasDoPeriodo(de, ate);
  const diaDaProg = new Map(programacoes.map((p) => [p.id, p.data_programada]));
  const noPeriodo = linhas.filter((l) => {
    const d = diaDaProg.get(l.programacao_id);
    return d && d >= de && d <= ate;
  });
  const ehNormal = (l) => l.tipo_linha === "Normal" || !l.tipo_linha;
  const concluidas = noPeriodo.filter((l) => l.status === "Concluído");
  const comTempo = concluidas.filter((l) => l.tempo_total);

  // ── produção
  const porTipo = ["Normal", "Crítico", "Avulso"].map((tipo) => {
    const ts = comTempo.filter((l) => (tipo === "Normal" ? ehNormal(l) : l.tipo_linha === tipo)).map((l) => minutosDe(l.tempo_total));
    return { tipo, media: media(ts), count: ts.length };
  });
  const porDia = dias.map((dia) => {
    const ls = noPeriodo.filter((l) => diaDaProg.get(l.programacao_id) === dia);
    return {
      dia,
      Normal: ls.filter(ehNormal).length,
      Crítico: ls.filter((l) => l.tipo_linha === "Crítico").length,
      Avulso: ls.filter((l) => l.tipo_linha === "Avulso").length,
    };
  });

  // ── operadores
  const ranking = (campo, aceita) => {
    const acc = new Map();
    for (const l of concluidas) {
      const nome = l[campo];
      if (!nome || !aceita(nome)) continue;
      const r = acc.get(nome) || { total: 0, mins: [] };
      r.total += 1;
      if (l.tempo_total) r.mins.push(minutosDe(l.tempo_total));
      acc.set(nome, r);
    }
    return [...acc].map(([nome, r]) => ({ nome, total: r.total, media: media(r.mins) }))
      .sort((a, b) => (b.total - a.total) || porNome(a.nome, b.nome));
  };

  // ── paradas
  const tipoParada = (p) => p.tipo || "Sem tipo";
  const paradaPorTipo = new Map();
  for (const p of paradas) paradaPorTipo.set(tipoParada(p), (paradaPorTipo.get(tipoParada(p)) || 0) + minutosParada(p.tempo_total));
  const minutosParados = paradas.reduce((a, p) => a + minutosParada(p.tempo_total), 0);

  // ── ocorrências
  const ocorrPorTipo = new Map();
  const quemRegistrou = new Map();
  for (const o of ocorrencias) {
    const t = o.tipo || "Outro";
    ocorrPorTipo.set(t, (ocorrPorTipo.get(t) || 0) + 1);
    if (o.registrado_por) quemRegistrou.set(o.registrado_por, (quemRegistrou.get(o.registrado_por) || 0) + 1);
  }

  // ── OEE simplificado
  const oeeDias = dias.map((dia) => {
    const produtivo = comTempo.filter((l) => diaDaProg.get(l.programacao_id) === dia)
      .reduce((a, l) => a + minutosDe(l.tempo_total), 0);
    const parado = paradas.filter((p) => p.data === dia).reduce((a, p) => a + minutosParada(p.tempo_total), 0);
    const aproveitamento = turnoMin > 0 ? Math.min(100, Math.round((produtivo / turnoMin) * 100)) : 0;
    return { dia, aproveitamento, produtivo, parado };
  });

  const pares = (m) => [...m].map(([name, value]) => ({ name, value })).sort((a, b) => porNome(a.name, b.name));

  return {
    de, ate,
    duracao_turno_horas: turnoHoras,
    producao: {
      total: noPeriodo.length,
      normal: noPeriodo.filter(ehNormal).length,
      critico: noPeriodo.filter((l) => l.tipo_linha === "Crítico").length,
      avulso: noPeriodo.filter((l) => l.tipo_linha === "Avulso").length,
      concluidas: concluidas.length,
      tempo_medio: media(comTempo.map((l) => minutosDe(l.tempo_total))),
      por_tipo: porTipo,
      por_dia: porDia,
    },
    operadores: {
      empilhadores: ranking("operador_empilhadeira", () => true),
      ajudantes: ranking("operador_ajudante", (n) => n !== "nenhum"),
    },
    paradas: {
      total: paradas.length,
      minutos: minutosParados,
      por_tipo: pares(paradaPorTipo),
      por_dia: dias.map((dia) => {
        const ps = paradas.filter((p) => p.data === dia);
        return { dia, paradas: ps.length, tempo: ps.reduce((a, p) => a + minutosParada(p.tempo_total), 0) };
      }),
    },
    ocorrencias: {
      total: ocorrencias.length,
      resolvidas: ocorrencias.filter((o) => o.resolvido).length,
      por_tipo: pares(ocorrPorTipo),
      ranking: [...quemRegistrou].map(([nome, total]) => ({ nome, total }))
        .sort((a, b) => (b.total - a.total) || porNome(a.nome, b.nome)),
    },
    oee: {
      dias: oeeDias,
      medio: oeeDias.length ? Math.round(oeeDias.reduce((a, d) => a + d.aproveitamento, 0) / oeeDias.length) : 0,
    },
    calculado_no: "navegador",
  };
}
