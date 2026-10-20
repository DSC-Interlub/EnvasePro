/**
 * O painel da TV de empilhadeira — no formato que a RPC
 * `public.painel_televisao_empilha()` devolve.
 *
 * Esta função é o RECUO: quando o código novo for publicado antes da migration
 * (ou se a função sumir do banco), a TV não pode apagar. Ela calcula o mesmo
 * painel no navegador, a partir das linhas DO DIA — buscadas já filtradas, não
 * a tabela inteira como antes.
 *
 * As regras são as da tela antiga (src/pages/TelevisaoEmpilha.jsx até a
 * Etapa 2), com as duas correções declaradas na migration: sem o teto de 200
 * linhas, e a "última ocorrência" é a de hora mais recente. O teste
 * scripts/test-painel-empilha.mjs exige que esta função e a RPC devolvam o
 * mesmo.
 *
 * Sem dependências: roda no navegador e no Node (o teste a importa direto).
 */

export const TETO_OPERACOES = 60;

/** O dia de Brasília, "AAAA-MM-DD" — o mesmo que a RPC usa. */
export function hojeEmBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

const minutosDe = (texto) => {
  const m = /^\s*(\d+):(\d+)/.exec(texto || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function calcularPainelEmpilha(linhasHoje, ocorrenciasHoje, dia) {
  const ehCritica = (l) => l.tipo_linha === "Crítico";
  const concluidas = linhasHoje.filter((l) => l.status === "Concluído");
  const tempos = concluidas.map((l) => minutosDe(l.tempo_total)).filter((m) => m !== null);
  const abertas = ocorrenciasHoje.filter((o) => !o.resolvido);
  const ultima = [...abertas].sort((a, b) =>
    String(b.hora).localeCompare(String(a.hora)) || String(b.created_at).localeCompare(String(a.created_at)))[0];

  // Crítico → Avulso → Normal, depois hora de início, depois id: a mesma
  // ordem da RPC, para o recuo não embaralhar os cartões.
  const ordem = (l) => (l.tipo_linha === "Crítico" ? 0 : l.tipo_linha === "Avulso" ? 1 : 2);
  const hora = (l) => (l.hora_inicio ? String(l.hora_inicio) : "\uffff");
  const operacoes = linhasHoje
    .filter((l) => l.status === "Em Andamento")
    .sort((a, b) => (ordem(a) - ordem(b)) || hora(a).localeCompare(hora(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, TETO_OPERACOES)
    .map((l) => ({
      id: l.id, tipo_linha: l.tipo_linha, status: l.status, critica: ehCritica(l),
      operador_empilhadeira: l.operador_empilhadeira ?? null,
      operador_empilhadeira_id: l.operador_empilhadeira_id ?? null,
      operador_ajudante: l.operador_ajudante ?? null,
      descricao_produto: l.descricao_produto ?? null,
      codigo_produto: l.codigo_produto ?? null,
      numero_item: l.numero_item ?? null,
      rua_torre: l.rua_torre ?? null,
      deposito: l.deposito ?? null,
      quantidade: l.quantidade ?? null,
      hora_inicio: l.hora_inicio ?? null,
    }));

  return {
    dia,
    total: linhasHoje.length,
    concluidas: concluidas.length,
    em_andamento: linhasHoje.filter((l) => l.status === "Em Andamento").length,
    criticos_pendentes: linhasHoje.filter((l) => ehCritica(l) && l.status !== "Concluído").length,
    tempo_medio_min: tempos.length ? Math.round(tempos.reduce((s, m) => s + m, 0) / tempos.length) : 0,
    ocorrencias_abertas: abertas.length,
    ultima_ocorrencia: ultima ? { tipo: ultima.tipo ?? null, hora: ultima.hora ?? null } : null,
    operacoes,
    calculado_no: "navegador",
  };
}
