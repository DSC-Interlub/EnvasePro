/**
 * Que faixa de datas o Dashboard precisa buscar no servidor.
 *
 * O Dashboard baixava TODOS os envases (4,5 MB no volume da Base44) a cada
 * abertura e filtrava no navegador. Esta função traduz os filtros da tela na
 * menor faixa que CONTÉM tudo o que o filtro do navegador deixaria passar; o
 * filtro do navegador continua o mesmo e roda em cima dela. Por isso os
 * gráficos recebem exatamente as mesmas linhas de antes
 * (scripts/test-dashboard-faixa.mjs prova).
 *
 * A regra espelha `combinaPeriodoEOperador` em src/pages/Dashboard.jsx:
 *  - sem mês escolhido, o navegador não filtra data nenhuma → busca tudo;
 *  - com mês e alguma data de início/fim, as datas MANDAM e o mês é ignorado;
 *  - com mês e sem datas, o mês inteiro.
 * Registro sem data nunca passa num filtro de data, e nunca vem numa faixa.
 *
 * @returns {null | { de: string|null, ate: string|null }} null = tudo
 */
export function faixaDoServidor(selectedMonth, startDate, endDate) {
  if (!selectedMonth) return null;
  if (startDate || endDate) return { de: startDate || null, ate: endDate || null };
  const [a, m] = selectedMonth.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { de: `${selectedMonth}-01`, ate: `${selectedMonth}-${String(ultimo).padStart(2, "0")}` };
}
