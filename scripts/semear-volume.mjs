/**
 * scripts/semear-volume.mjs — carrega o banco LOCAL no volume da Base44
 *
 * POR QUE
 *
 * A medição de bytes da Etapa 2 (docs/ETAPA2-INDICADORES.md §1) foi invalidada
 * por ter sido feita com banco quase vazio: com 14 linhas, baixar a tabela
 * inteira custa quase nada e qualquer otimização "não muda nada". O tráfego
 * da TV cresce com o número de registros; para medir, o banco precisa ter o
 * volume que a fábrica tem.
 *
 * O volume é o do export da Base44 (docs/ETAPA2 §1): 5.884 envases, 7.874
 * itens de check-out, 36 checklists. Empilhadeira e recebimento não têm
 * número no export; usamos uma estimativa proporcional e a declaramos.
 *
 * Os dados são SINTÉTICOS (nada vem dos CSVs reais de exports-base44/, que
 * são intocáveis) e levam o marcador VOL nos campos de texto, para sair
 * inteiros com `--limpar`. Incluem as operações de HOJE, em andamento, para
 * as telas de TV terem o que mostrar.
 *
 * Uso: node scripts/semear-volume.mjs           (carrega)
 *      node scripts/semear-volume.mjs --limpar  (apaga só o que leva VOL)
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('semear-volume');

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

const MARCA = 'VOL';
const VOLUME = {
  envases: 5884,
  checkoutItens: 7874,
  checklists: 36,
  // Estimativas — o export não traz estes dois. Proporção usada: uma linha de
  // empilhadeira por ~2 envases, um recebimento por ~2 dias úteis.
  empilhaLinhas: 3000,
  recebimentos: 130,
  dias: 260,
};

function diaLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function diaMenos(n) { const d = new Date(); d.setDate(d.getDate() - n); return diaLocal(d); }
const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const agoraMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

// Gerador determinístico: a mesma carga em toda execução, para que medições
// de dias diferentes sejam comparáveis.
let semente = 42;
const aleatorio = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
const escolher = (lista) => lista[Math.floor(aleatorio() * lista.length)];

async function emLotes(tabela, linhas, tamanho = 500) {
  const ids = [];
  for (let i = 0; i < linhas.length; i += tamanho) {
    const { data, error } = await svc.from(tabela).insert(linhas.slice(i, i + tamanho)).select('id');
    if (error) throw new Error(`${tabela} (lote ${i / tamanho + 1}): ${error.message}`);
    ids.push(...data.map((r) => r.id));
  }
  return ids;
}

async function limpar() {
  console.log('Apagando o que leva o marcador VOL…');
  // Ordem das chaves estrangeiras: filhos primeiro.
  const passos = [
    // Recebimento apaga os filhos (participantes, ocorrências) em cascata.
    ['recebimentos', 'numero_documento'],
    ['checklist_recebimentos', 'numero_lote'],
    ['limpeza_programacoes', 'observacoes'],
    ['nota_fiscal_arquivos', 'numero_nf'],
    ['empilha_linhas', 'numero_item'],
    ['checkout_itens', 'numero_pedido'],
    ['envase_records', 'op'],
    ['empilha_ocorrencias', 'descricao'],
    ['empilhadeira_paradas', 'descricao'],
    ['empilha_programacoes', 'observacoes'],
    ['checkout_programacoes', 'observacoes'],
  ];
  for (const [tabela, coluna] of passos) {
    const { error, count } = await svc.from(tabela).delete({ count: 'exact' }).like(coluna, `${MARCA}%`);
    console.log(`  ${tabela.padEnd(24)} ${error ? `ERRO ${error.message}` : `${count ?? 0} removida(s)`}`);
  }
}

async function carregar() {
  await limpar();
  const { data: ops } = await svc.from('operators').select('id, nome').eq('ativo', true);
  const { data: prods } = await svc.from('products').select('codigo, nome');
  const { data: emp } = await svc.from('empilhadeira_configs').select('id').limit(1).single();
  if (!ops?.length || !prods?.length || !emp) throw new Error('faltam operadores, produtos ou empilhadeira no banco local');

  const t0 = Date.now();

  /* ── envase ─────────────────────────────────────────────────────────── */
  const envases = [];
  for (let i = 0; i < VOLUME.envases; i += 1) {
    const diasAtras = Math.floor((i / VOLUME.envases) * VOLUME.dias);
    const op = escolher(ops);
    const prod = escolher(prods);
    const inicio = 420 + Math.floor(aleatorio() * 540);
    const hoje = diasAtras === 0;
    envases.push({
      sala: aleatorio() < 0.5 ? 'Bio' : 'Industrial',
      data: diaMenos(diasAtras),
      op: `${MARCA}-${String(i).padStart(5, '0')}`,
      operador: op.nome, operator_id: op.id,
      codigo_produto: prod.codigo, descricao_produto: prod.nome,
      quantidade_produzida: 50 + Math.floor(aleatorio() * 900),
      inicio: hhmm(hoje ? Math.max(0, agoraMin() - 20 - (i % 50)) : inicio),
      // Hoje: metade ainda em andamento.
      termino: hoje && i % 2 === 0 ? null : hhmm(inicio + 30 + Math.floor(aleatorio() * 90)),
      material_retirado: !hoje,
    });
  }
  await emLotes('envase_records', envases);
  console.log(`  envase_records       ${envases.length}`);

  /* ── check-out ──────────────────────────────────────────────────────── */
  const progs = Array.from({ length: VOLUME.dias }, (_, d) => ({
    data_programada: diaMenos(d), observacoes: `${MARCA} programação`,
  }));
  const progIds = await emLotes('checkout_programacoes', progs);
  const itens = [];
  for (let i = 0; i < VOLUME.checkoutItens; i += 1) {
    const d = Math.floor((i / VOLUME.checkoutItens) * VOLUME.dias);
    const op = escolher(ops);
    const hoje = d === 0;
    const andamento = hoje && i % 3 === 0;
    itens.push({
      programacao_id: progIds[d],
      numero_pedido: `${MARCA}-PV-${i}`,
      cliente: `Cliente ${i % 400}`,
      data_entrega: diaMenos(Math.max(0, d - 2)),
      operador: op.nome, operator_id: op.id,
      status: andamento ? 'Em Andamento' : hoje && i % 3 === 1 ? 'Pendente' : 'Concluído',
      hora_inicio: andamento || !hoje ? hhmm(480 + (i % 400)) : null,
      hora_termino: andamento || (hoje && i % 3 === 1) ? null : hhmm(520 + (i % 400)),
      critico: i % 17 === 0,
    });
  }
  // Pendente não pode ter operador gravado? Não: o CHECK exige operador
  // quando status <> 'Pendente', e Pendente aceita os dois.
  await emLotes('checkout_itens', itens);
  console.log(`  checkout_itens       ${itens.length}`);

  /* ── empilhadeira ───────────────────────────────────────────────────── */
  const eprogs = Array.from({ length: VOLUME.dias }, (_, d) => ({
    data_programada: diaMenos(d), empilhadeira_id: emp.id, observacoes: `${MARCA} programação`,
  }));
  const eprogIds = await emLotes('empilha_programacoes', eprogs);
  const linhas = [];
  for (let i = 0; i < VOLUME.empilhaLinhas; i += 1) {
    const d = Math.floor((i / VOLUME.empilhaLinhas) * VOLUME.dias);
    const op = escolher(ops);
    const hoje = d === 0;
    const andamento = hoje && i % 2 === 0;
    const minutos = 8 + (i % 40);
    linhas.push({
      programacao_id: eprogIds[d],
      tipo_linha: i % 9 === 0 ? 'Crítico' : i % 5 === 0 ? 'Avulso' : 'Normal',
      numero_item: `${MARCA}-${i}`,
      codigo_produto: escolher(prods).codigo,
      descricao_produto: escolher(prods).nome,
      deposito: escolher(['EPB', 'EPI', 'ERM']),
      rua_torre: `R${i % 12}-T${i % 5}`,
      quantidade: 10 + (i % 90),
      status: andamento ? 'Em Andamento' : 'Concluído',
      operador_empilhadeira: op.nome, operador_empilhadeira_id: op.id,
      // Ajudante em 1 de 4 linhas; 'nenhum' em algumas, que o ranking ignora.
      operador_ajudante: i % 4 === 0 ? ops[(i + 3) % ops.length].nome : i % 9 === 0 ? 'nenhum' : null,
      hora_inicio: hhmm(hoje ? Math.max(0, agoraMin() - 10 - (i % 30)) : 480 + (i % 300)),
      hora_termino: andamento ? null : hhmm(480 + (i % 300) + minutos),
      tempo_total: andamento ? null : `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`,
    });
  }
  await emLotes('empilha_linhas', linhas);
  console.log(`  empilha_linhas       ${linhas.length}`);

  const ocorr = Array.from({ length: 60 }, (_, i) => ({
    data: diaMenos(Math.floor(i / 3)),
    hora: hhmm(500 + i * 7),
    tipo: escolher(['Problema', 'Amassado', 'Produto errado', 'Equipamento', 'Outro']),
    descricao: `${MARCA} ocorrência ${i}`,
    registrado_por: escolher(ops).nome,
    resolvido: i > 5,
  }));
  // Paradas, todas FECHADAS (as TVs mostram "parada agora" só com uma
  // aberta). Algumas sem tipo e com tempo_total em formatos diferentes ("45",
  // "1:30", "20 min"), que é o que a regra de conversão precisa enfrentar.
  const paradas = Array.from({ length: 130 }, (_, i) => ({
    empilhadeira_id: emp.id,
    tipo: i % 13 === 0 ? null : escolher(['Quebra', 'Manutenção', 'Aguardando operador', 'Falta de material', 'Outro']),
    descricao: `${MARCA} parada ${i}`,
    registrado_por: escolher(ops).nome,
    data: diaMenos(Math.floor(i * 2)),
    hora_inicio: hhmm(540 + (i % 200)),
    hora_fim: hhmm(560 + (i % 200)),
    tempo_total: i % 11 === 0 ? '1:30' : i % 7 === 0 ? '20 min' : String(5 + (i % 50)),
  }));
  const rp = await svc.from('empilhadeira_paradas').insert(paradas);
  if (rp.error) throw new Error(`paradas: ${rp.error.message}`);
  console.log(`  empilhadeira_paradas ${paradas.length}`);

  const r = await svc.from('empilha_ocorrencias').insert(ocorr);
  if (r.error) console.log(`  empilha_ocorrencias  pulado: ${r.error.message}`);
  else console.log(`  empilha_ocorrencias  ${ocorr.length}`);

  await carregarPainelGeral(ops);

  console.log(`\nCarga em ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
}

/* ── o que só o /Painel mostra ──────────────────────────────────────────────
 * Recebimento, checklist, limpeza e nota fiscal. Sem eles o painel geral teria
 * metade dos indicadores em zero, e paridade com zero não prova nada.
 * Volumes: 130 recebimentos e 36 checklists (export da Base44 / estimativa
 * acima), duas limpezas por dia, uma NF a cada ~2 dias.
 */
async function carregarPainelGeral(ops) {
  const agora = new Date();
  const isoMenos = (min) => new Date(agora.getTime() - min * 60000).toISOString();

  const recebimentos = Array.from({ length: VOLUME.recebimentos }, (_, i) => {
    const d = Math.floor((i / VOLUME.recebimentos) * VOLUME.dias);
    const hoje = d === 0;
    const andamento = hoje && i < 3;
    return {
      tipo: escolher(['Importação', 'Nacional', 'Devolução', 'Material auxiliar']),
      numero_documento: `${MARCA}-REC-${i}`,
      fornecedor_nome: `Fornecedor ${i % 25}`,
      data_prevista: diaMenos(d), data_chegada: diaMenos(d),
      status: andamento ? 'Em andamento' : hoje ? 'Agendado' : i % 17 === 5 ? 'Cancelado' : 'Concluído',
      // Tempos para os indicadores; uma parte SEM tempo, que a média ignora.
      tempo_produtivo_minutos: !andamento && !hoje && i % 10 !== 3 ? 30 + (i % 90) + (i % 4) * 0.5 : null,
      tempo_pausado_minutos: !andamento && !hoje && i % 5 === 0 ? 10 + (i % 7) : null,
      prioridade: i % 11 === 0 ? 'Urgente' : i % 7 === 0 ? 'Alta' : 'Normal',
      datetime_inicio: andamento ? isoMenos(25 + i * 10) : hoje ? null : new Date(`${diaMenos(d)}T11:00:00Z`).toISOString(),
      datetime_fim: andamento || hoje ? null : new Date(`${diaMenos(d)}T12:30:00Z`).toISOString(),
      // Uma em cada quatro concluídas ainda sem a assinatura do líder.
      assinatura_lider: !andamento && !hoje && i % 4 !== 0,
    };
  });
  const recIds = await emLotes('recebimentos', recebimentos);
  const participantes = recIds.flatMap((id, i) => [
    { recebimento_id: id, operator_id: ops[i % ops.length].id, operator_nome: ops[i % ops.length].nome, funcao: 'Coordenador' },
    { recebimento_id: id, operator_id: ops[(i + 1) % ops.length].id, operator_nome: ops[(i + 1) % ops.length].nome, funcao: 'Conferente' },
  ]);
  await emLotes('recebimento_participantes', participantes);
  const recOcorr = Array.from({ length: 24 }, (_, i) => ({
    recebimento_id: recIds[i * 5],
    tipo: escolher(['Avaria', 'Divergência de quantidade', 'Produto errado', 'Atraso']),
    descricao: `${MARCA} ocorrência de recebimento ${i}`,
    registrado_por: escolher(ops).nome,
    resolvido: i % 3 !== 0,
  }));
  await emLotes('recebimento_ocorrencias', recOcorr);
  console.log(`  recebimentos         ${recIds.length} (+${participantes.length} participantes, ${recOcorr.length} ocorrências)`);

  // Checklists: as respostas decidem a nota (a trigger calcula). Alguns
  // reprovados (nota < 0), três de hoje.
  const sn = (v) => (v ? 'Sim' : 'Não');
  const checklists = Array.from({ length: VOLUME.checklists }, (_, i) => {
    const ruim = i % 5 === 0;
    return {
      pedido_disponivel_etapa5: sn(!ruim), numero_pedido_compras: `PC-${i}`,
      nome_fornecedor: `Fornecedor ${i % 25}`, descricao_material: 'Material de teste',
      data_entrega: diaMenos(i < 3 ? 0 : i * 2), entrega_conforme_prevista: sn(!ruim),
      numero_nota_fiscal: `NF-${i}`, material_recebimento: 'Embalagem',
      quantidade_recebida: 100 + i, unidade_medida: 'UN', numero_lote: `${MARCA}-LOTE-${i}`,
      quantidade_conforme_nf: sn(!ruim), amostragem_inspecionada: ruim ? 'Não' : 'Sim',
      condicoes_gerais_conformes: ruim ? 'Não' : 'Sim', spray_conforme_feps: 'N/A',
      acompanha_certificado_analise: ruim ? 'Não' : 'Sim', acompanha_ficha_emergencia: ruim ? 'Não' : 'Sim',
      acompanha_fispq: ruim ? 'Não' : 'Sim',
    };
  });
  const ckIds = await emLotes('checklist_recebimentos', checklists);
  // created_at acompanha a data de entrega, para "hoje" e "semana" terem
  // conteúdo. É dado sintético local: a trava de imutabilidade de created_at
  // não vale para service_role.
  for (let i = 0; i < ckIds.length; i += 1) {
    const quando = i < 3 ? isoMenos(60 + i * 30) : new Date(`${diaMenos(i * 2)}T14:00:00Z`).toISOString();
    const { error } = await svc.from('checklist_recebimentos').update({ created_at: quando }).eq('id', ckIds[i]);
    if (error) throw new Error(`checklist created_at: ${error.message}`);
  }
  console.log(`  checklist_recebim.   ${ckIds.length}`);

  const { data: locais } = await svc.from('limpeza_locais').select('id, nome');
  const limpezas = [];
  for (let d = -14; d < VOLUME.dias; d += 1) {
    for (const [k, local] of locais.slice(0, 2).entries()) {
      const futura = d < 0;
      const hoje = d === 0;
      const atrasada = !futura && !hoje && (d + k) % 23 === 0;
      const aguardaLider = !futura && !hoje && !atrasada && (d + k) % 9 === 0;
      limpezas.push({
        local_id: local.id, local_nome: local.nome,
        data_prevista: diaMenos(d),
        tipo_limpeza: escolher(['Varrição', 'Lavagem', 'Desinfecção']),
        status: futura || atrasada ? 'Pendente' : hoje ? (k === 0 ? 'Concluído' : 'Pendente') : 'Concluído',
        assinatura_responsavel: !futura && !atrasada && !(hoje && k !== 0),
        assinatura_lider: !futura && !atrasada && !hoje && !aguardaLider,
        observacoes: `${MARCA} limpeza`,
      });
    }
  }
  await emLotes('limpeza_programacoes', limpezas);
  console.log(`  limpeza_programacoes ${limpezas.length}`);

  const nfs = Array.from({ length: 120 }, (_, i) => ({
    numero_nf: `${MARCA}-NF-${i}`,
    arquivo_url: i % 6 === 0 ? null : `teste/${MARCA}-nf-${i}.pdf`,
    arquivado_por_nome: escolher(ops).nome,
    data_arquivo: diaMenos(Math.floor(i * 2.1)),
  }));
  const nfIds = await emLotes('nota_fiscal_arquivos', nfs);
  for (let i = 0; i < nfIds.length; i += 1) {
    const { error } = await svc.from('nota_fiscal_arquivos')
      .update({ created_at: new Date(`${diaMenos(Math.floor(i * 2.1))}T13:00:00Z`).toISOString() }).eq('id', nfIds[i]);
    if (error) throw new Error(`nf created_at: ${error.message}`);
  }
  console.log(`  nota_fiscal_arquivos ${nfIds.length}`);
}

if (process.argv.includes('--limpar')) await limpar();
else await carregar();
