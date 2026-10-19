/**
 * Como a meta aparece nas TVs. Funções puras, para a regra ser testada sem
 * navegador (scripts/test-meta-na-tela.mjs).
 *
 * SEM META, nada muda: o anel mostra a fração concluída do que foi lançado no
 * dia, como antes de a tabela existir.
 *
 * COM META, o anel mede o realizado contra a meta. No envase a meta é POR
 * SALA: o anel soma só as salas que TÊM meta (realizado e meta dessas salas),
 * e a legenda diz qual sala está sem meta — misturar a produção de uma sala
 * sem meta com a meta da outra daria uma porcentagem que não significa nada.
 */

const SALAS = ["Bio", "Industrial"];
const fmt = (n) => Number(n).toLocaleString("pt-BR");
const salasCom = (porSala) => SALAS.filter((s) => porSala?.[s] != null);

/** O anel do painel de envase (envases concluídos). */
export function anelEnvase({ envase, metas }) {
  const metaSala = metas?.envase?.envases;
  const comMeta = salasCom(metaSala);
  if (!comMeta.length) {
    return {
      usaMeta: false,
      valor: envase.concluidos,
      total: envase.lancados,
      legenda: envase.lancados > 0
        ? `${envase.em_andamento} em andamento · ${envase.lancados} lançados`
        : "sem lançamentos",
    };
  }
  const valor = comMeta.reduce((a, s) => a + (envase.por_sala?.[s]?.concluidos ?? 0), 0);
  const total = comMeta.reduce((a, s) => a + Number(metaSala[s]), 0);
  const partes = comMeta.map((s) => `${s} ${envase.por_sala?.[s]?.concluidos ?? 0}/${fmt(metaSala[s])}`);
  const semMeta = SALAS.filter((s) => !comMeta.includes(s)).map((s) => `${s} sem meta`);
  return { usaMeta: true, valor, total, legenda: [`meta ${fmt(total)} envases`, ...partes, ...semMeta].join(" · ") };
}

/** A pílula do número "Produção de hoje" (unidades). null = sem meta. */
export function pilulaProducao({ envase, metas }) {
  const metaSala = metas?.envase?.unidades;
  const comMeta = salasCom(metaSala);
  if (!comMeta.length) return null;
  const feito = comMeta.reduce((a, s) => a + Number(envase.por_sala?.[s]?.producao ?? 0), 0);
  const meta = comMeta.reduce((a, s) => a + Number(metaSala[s]), 0);
  const pct = Math.round((feito / meta) * 100);
  const semMeta = SALAS.filter((s) => !comMeta.includes(s));
  return {
    texto: `${pct}% da meta de ${fmt(meta)} un.${semMeta.length ? ` (${semMeta.join(", ")} sem meta)` : ""}`,
    tom: pct >= 100 ? "ok" : "atencao",
  };
}

/** Anel de check-out (pedidos) ou empilhadeira (linhas). */
export function anelSimples({ concluidos, total, meta, unidade, emAberto, rotuloAberto }) {
  if (meta == null) {
    return {
      usaMeta: false, valor: concluidos, total,
      legenda: total > 0 ? `${emAberto} ${rotuloAberto} · ${total} no dia` : `sem ${unidade}`,
    };
  }
  return {
    usaMeta: true, valor: concluidos, total: Number(meta),
    legenda: `meta ${fmt(meta)} ${unidade} · ${emAberto} ${rotuloAberto}`,
  };
}
