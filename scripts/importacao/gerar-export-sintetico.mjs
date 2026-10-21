/**
 * Gera um export SINTÉTICO no formato exato da Base44 para ensaiar o que o
 * export real de hoje não trouxe (empilhadeira, limpeza, recebimento, NF e
 * anexos). Copia os CSVs reais com dados e preenche as 14 entidades vazias.
 *
 * Exercita de propósito:
 *   - registros já assinados ("Completo") — a trava protect_status_completo;
 *   - nomes de operador por alias, desconhecidos e ids de operador da Base44;
 *   - anexos: PDF e PNG válidos, corrompido, grande demais, faltando, e um
 *     executável com extensão .png;
 *   - linhas que TÊM de cair na quarentena (domínio, data inexistente, FK).
 * Tudo leva o marcador SINT. Dados fictícios: nada sai dos CSVs para fora.
 *
 * Uso: node scripts/importacao/gerar-export-sintetico.mjs <export-real> <saida>
 *   cria <saida>/csv e <saida>/anexos
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { lerCsv } from '../lib/csv.mjs';

const [origem, saida] = process.argv.slice(2);
if (!origem || !saida) { console.error('uso: gerar-export-sintetico.mjs <export-real> <saida>'); process.exit(2); }
const dirCsv = path.join(saida, 'csv');
const dirAnexos = path.join(saida, 'anexos');
fs.rmSync(saida, { recursive: true, force: true });
fs.mkdirSync(dirCsv, { recursive: true });
fs.mkdirSync(dirAnexos, { recursive: true });

for (const f of fs.readdirSync(origem).filter((x) => x.endsWith('.csv'))) {
  if (fs.statSync(path.join(origem, f)).size > 0) fs.copyFileSync(path.join(origem, f), path.join(dirCsv, f));
}
const ops = lerCsv(path.join(origem, 'Operator_export.csv')).linhas;
const prods = lerCsv(path.join(origem, 'Product_export.csv')).linhas;
const opId = (nome) => ops.find((o) => o.nome === nome)?.id;
const id = (chave) => crypto.createHash('md5').update(`sint:${chave}`).digest('hex').slice(0, 24);
const ts = (dia, hora = '12:00:00') => `${dia}T${hora}.000000`;
const CONTROLE = ['id', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample'];

function escrever(entidade, campos, linhas) {
  const cab = [...campos, ...CONTROLE];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const corpo = linhas.map((l) => cab.map((c) => {
    const v = l[c] ?? (c === 'created_by_id' ? 'anonymous' : c === 'created_by' ? 'anonymous' : c === 'is_sample' ? 'false' : '');
    return q(Array.isArray(v) || (v && typeof v === 'object') ? JSON.stringify(v) : typeof v === 'boolean' ? String(v) : v);
  }).join(','));
  fs.writeFileSync(path.join(dirCsv, `${entidade}_export.csv`), [cab.map(q).join(','), ...corpo].join('\n'));
}
const base = (chave, dia) => ({ id: id(chave), created_date: ts(dia), updated_date: ts(dia, '13:00:00') });

// ── Empilhadeira ─────────────────────────────────────────────────────────────
const emp = { ...base('emp1', '2026-01-10'), nome: 'SINT Empilhadeira Elétrica 01', marca: 'SINT', modelo: 'X', numero_serie: 'S1', ativa: true,
  intervalo_manutencao_dias: 90, data_ultima_manutencao: '2026-09-01', data_proxima_manutencao: '2026-11-30', duracao_turno_horas: 8, observacoes: 'SINT' };
escrever('EmpilhadeiraConfig', ['nome', 'marca', 'modelo', 'numero_serie', 'ativa', 'intervalo_manutencao_dias', 'data_ultima_manutencao', 'data_proxima_manutencao', 'duracao_turno_horas', 'observacoes'], [emp]);
const progs = [1, 2, 3].map((n) => ({ ...base(`ep${n}`, `2026-10-0${n}`), data_programada: `2026-10-0${n}`, empilhadeira_id: emp.id, status: n === 3 ? 'Em Andamento' : 'Concluído', total_linhas: 3, linhas_concluidas: n === 3 ? 1 : 3, observacoes: `SINT programação ${n}`, criado_por: n === 1 ? 'Matheus' : 'Jorge' }));
escrever('EmpilhaProgramacao', ['data_programada', 'empilhadeira_id', 'status', 'total_linhas', 'linhas_concluidas', 'observacoes', 'criado_por'], progs);
const prod = prods[0];
const linhas = [];
for (const p of progs) for (let k = 1; k <= 3; k += 1) {
  const concluida = p.status === 'Concluído' || k === 1;
  linhas.push({ ...base(`el${p.id}${k}`, p.data_programada), programacao_id: p.id, tipo_linha: k === 2 ? 'Crítico' : 'Normal', numero_item: `SINT-IT${k}`, codigo_produto: prod.codigo,
    descricao_produto: `SINT ${prod.nome}`, lote: 'L1', deposito: 'ERM', rua_torre: 'R01-T01', quantidade: 10 * k, status: concluida ? 'Concluído' : 'Pendente',
    operador_empilhadeira: concluida ? (k === 3 ? 'Jorge' : 'Victor') : '', operador_ajudante: concluida && k === 1 ? 'Wilber' : '',
    hora_inicio: concluida ? '08:00' : '', hora_termino: concluida ? '08:30' : '', tempo_total: concluida ? '0:30' : '',
    assinatura_operador: concluida, assinatura_operador_nome: concluida ? 'Victor' : '', assinatura_operador_hora: concluida ? '08:31' : '',
    assinatura_lider: concluida && p.status === 'Concluído', assinatura_lider_nome: concluida && p.status === 'Concluído' ? 'Elder' : '', assinatura_lider_hora: concluida && p.status === 'Concluído' ? '09:00' : '',
    status_assinatura: concluida && p.status === 'Concluído' ? 'Completo' : concluida ? 'Parcial' : 'Pendente', observacoes: 'SINT' });
}
// Quarentena esperada: domínio inválido; e concluída com operador sem cadastro (CHECK).
linhas.push({ ...base('el-dominio', '2026-10-01'), programacao_id: progs[0].id, tipo_linha: 'Urgente', status: 'Pendente', descricao_produto: 'SINT domínio inválido', quantidade: 1, observacoes: 'SINT' });
linhas.push({ ...base('el-semop', '2026-10-01'), programacao_id: progs[0].id, tipo_linha: 'Normal', status: 'Concluído', operador_empilhadeira: 'Fulano Sem Cadastro', descricao_produto: 'SINT operador desconhecido', quantidade: 1, observacoes: 'SINT' });
escrever('EmpilhaLinha', ['programacao_id', 'tipo_linha', 'numero_item', 'codigo_produto', 'descricao_produto', 'lote', 'deposito', 'rua_torre', 'quantidade', 'status', 'operador_empilhadeira', 'operador_ajudante',
  'hora_inicio', 'hora_pausa', 'hora_retomada', 'hora_termino', 'tempo_total', 'tempo_pausado', 'assinatura_operador', 'assinatura_operador_nome', 'assinatura_operador_hora', 'assinatura_ajudante', 'assinatura_ajudante_nome',
  'assinatura_ajudante_hora', 'assinatura_lider', 'assinatura_lider_nome', 'assinatura_lider_hora', 'status_assinatura', 'observacoes'], linhas);
escrever('EmpilhaOcorrencia', ['programacao_id', 'linha_id', 'tipo', 'descricao', 'registrado_por', 'registrado_por_funcao', 'data', 'hora', 'notificado_lider', 'resolvido', 'resolucao'], [
  { ...base('eo1', '2026-10-01'), programacao_id: progs[0].id, linha_id: linhas[0].id, tipo: 'Amassado', descricao: 'SINT caixa amassada', registrado_por: 'Victor', registrado_por_funcao: 'Empilhador', data: '2026-10-01', hora: '08:10', notificado_lider: true, resolvido: true, resolucao: 'SINT trocada' },
  { ...base('eo2', '2026-10-02'), programacao_id: progs[1].id, tipo: 'Outro', descricao: 'SINT data inexistente', registrado_por: 'Victor', data: '2026-02-30', hora: '08:10' },
]);
escrever('EmpilhadeiraParada', ['empilhadeira_id', 'programacao_id', 'tipo', 'descricao', 'registrado_por', 'data', 'hora_inicio', 'hora_fim', 'tempo_total'], [
  { ...base('pa1', '2026-10-02'), empilhadeira_id: emp.id, programacao_id: progs[1].id, tipo: 'Quebra', descricao: 'SINT pneu', registrado_por: 'Maike', data: '2026-10-02', hora_inicio: '10:00', hora_fim: '10:40', tempo_total: '0:40' }]);
escrever('EmpilhadeiraManutencao', ['empilhadeira_id', 'data_manutencao', 'tipo', 'descricao', 'responsavel', 'proxima_prevista'], [
  { ...base('ma1', '2026-09-01'), empilhadeira_id: emp.id, data_manutencao: '2026-09-01', tipo: 'Preventiva', descricao: 'SINT revisão', responsavel: 'Técnico externo', proxima_prevista: '2026-11-30' }]);

// ── Limpeza ──────────────────────────────────────────────────────────────────
const locais = [1, 2].map((n) => ({ ...base(`ll${n}`, '2026-01-05'), nome: `SINT Sala ${n}`, tipo: 'Sala', descricao: 'SINT', ativo: true }));
escrever('LimpezaLocal', ['nome', 'tipo', 'descricao', 'ativo'], locais);
escrever('LimpezaProgramacao', ['local_id', 'local_nome', 'responsavel_id', 'responsavel_nome', 'responsaveis', 'assinaturas_responsaveis', 'data_prevista', 'hora_prevista', 'tipo_limpeza', 'observacoes', 'status',
  'data_realizada', 'hora_inicio', 'hora_fim', 'assinatura_responsavel', 'assinatura_responsavel_nome', 'assinatura_responsavel_hora', 'assinatura_lider', 'assinatura_lider_nome', 'assinatura_lider_hora', 'status_assinatura', 'criado_por'], [
  { ...base('lp1', '2026-10-01'), local_id: locais[0].id, local_nome: locais[0].nome, responsavel_id: opId('Matheus'), responsavel_nome: 'Matheus', responsaveis: [{ id: opId('Matheus'), nome: 'Matheus' }],
    assinaturas_responsaveis: [{ id: opId('Matheus'), nome: 'Matheus', hora: '09:10' }], data_prevista: '2026-10-01', hora_prevista: '08:00', tipo_limpeza: 'Lavagem', observacoes: 'SINT', status: 'Concluído',
    data_realizada: '2026-10-01', hora_inicio: '08:00', hora_fim: '09:00', assinatura_responsavel: true, assinatura_responsavel_nome: 'Matheus', assinatura_responsavel_hora: '09:10',
    assinatura_lider: true, assinatura_lider_nome: 'Elder', assinatura_lider_hora: '09:30', status_assinatura: 'Completo', criado_por: 'Elder' },
  { ...base('lp2', '2026-10-20'), local_id: locais[1].id, local_nome: locais[1].nome, responsaveis: [], assinaturas_responsaveis: [], data_prevista: '2026-10-22', tipo_limpeza: 'Varrição', status: 'Pendente', status_assinatura: 'Pendente', criado_por: 'Elder' },
]);

// ── Recebimento ──────────────────────────────────────────────────────────────
const forn = [1, 2].map((n) => ({ ...base(`rf${n}`, '2026-02-01'), nome: `SINT Fornecedor ${n}`, tipo: n === 1 ? 'Nacional' : 'Internacional', pais_origem: n === 1 ? 'Brasil' : 'Alemanha', observacoes: 'SINT', ativo: true }));
escrever('RecebimentoFornecedor', ['nome', 'tipo', 'pais_origem', 'observacoes', 'ativo'], forn);
const recs = [
  { ...base('rc1', '2026-10-01'), tipo: 'Nacional', numero_documento: 'SINT-DOC1', numero_nf: '1001', fornecedor_id: forn[0].id, fornecedor_nome: forn[0].nome, data_prevista: '2026-10-01', data_chegada: '2026-10-01',
    descricao: 'SINT', status: 'Concluído', prioridade: 'Alta', coordenador_id: opId('Alisson'), coordenador_nome: 'Alisson', datetime_inicio: '2026-10-01T11:00:00.000000', datetime_fim: '2026-10-01T12:30:00.000000',
    tempo_produtivo_minutos: 90, assinatura_coordenador: true, assinatura_coordenador_nome: 'Alisson', assinatura_coordenador_datetime: '2026-10-01T12:31:00.000000',
    assinatura_lider: true, assinatura_lider_nome: 'Elder', assinatura_lider_datetime: '2026-10-01T13:00:00.000000', status_assinatura: 'Completo' },
  { ...base('rc2', '2026-10-20'), tipo: 'Importação', numero_documento: 'SINT-DOC2', fornecedor_id: forn[1].id, fornecedor_nome: forn[1].nome, data_prevista: '2026-10-25', status: 'Agendado', prioridade: 'Normal', status_assinatura: 'Pendente' },
];
escrever('Recebimento', ['tipo', 'numero_documento', 'numero_nf', 'fornecedor_id', 'fornecedor_nome', 'data_prevista', 'data_chegada', 'descricao', 'status', 'prioridade', 'coordenador_id', 'coordenador_nome',
  'datetime_inicio', 'datetime_pausa', 'datetime_retomada', 'datetime_fim', 'tempo_produtivo_minutos', 'tempo_pausado_minutos', 'observacoes_finais', 'assinatura_coordenador', 'assinatura_coordenador_nome',
  'assinatura_coordenador_datetime', 'assinatura_lider', 'assinatura_lider_nome', 'assinatura_lider_datetime', 'status_assinatura'], recs);
const itens = [{ ...base('ri1', '2026-10-01'), recebimento_id: recs[0].id, produto_codigo: prod.codigo, produto_descricao: `SINT ${prod.nome}`, lote: 'L9', quantidade_prevista: 100, quantidade_recebida: 98, unidade: 'KG', status_item: 'Divergência de quantidade', observacoes: 'SINT' },
  { ...base('ri2', '2026-10-01'), recebimento_id: recs[0].id, produto_descricao: 'SINT item sem código', quantidade_prevista: 5, quantidade_recebida: 5, unidade: 'UN', status_item: 'OK' }];
escrever('RecebimentoItem', ['recebimento_id', 'produto_codigo', 'produto_descricao', 'lote', 'quantidade_prevista', 'quantidade_recebida', 'unidade', 'status_item', 'observacoes'], itens);
escrever('RecebimentoParticipante', ['recebimento_id', 'operator_id', 'operator_nome', 'funcao', 'assinou', 'assinatura_datetime'], [
  { ...base('rp1', '2026-10-01'), recebimento_id: recs[0].id, operator_id: opId('Alisson'), operator_nome: 'Alisson', funcao: 'Coordenador', assinou: true, assinatura_datetime: '2026-10-01T12:31:00.000000' },
  { ...base('rp2', '2026-10-01'), recebimento_id: recs[0].id, operator_id: opId('Lucas'), operator_nome: 'Lucas', funcao: 'Conferente', assinou: true, assinatura_datetime: '2026-10-01T12:32:00.000000' },
  { ...base('rp3', '2026-10-01'), recebimento_id: recs[0].id, operator_id: id('operador-que-nao-existe'), operator_nome: 'Fantasma', funcao: 'Auxiliar', assinou: false }, // FK → quarentena
]);
escrever('RecebimentoOcorrencia', ['recebimento_id', 'item_id', 'tipo', 'descricao', 'registrado_por', 'datetime_registro', 'resolvido', 'resolucao'], [
  { ...base('ro1', '2026-10-01'), recebimento_id: recs[0].id, item_id: itens[0].id, tipo: 'Divergência de quantidade', descricao: 'SINT faltaram 2', registrado_por: 'Alisson', datetime_registro: '2026-10-01T11:40:00.000000', resolvido: false }]);

// ── Notas fiscais + anexos ───────────────────────────────────────────────────
const pdfMinimo = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const png1x1 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');
fs.writeFileSync(path.join(dirAnexos, 'nf-valida.pdf'), pdfMinimo);
fs.writeFileSync(path.join(dirAnexos, 'nf-valida.png'), png1x1);
fs.writeFileSync(path.join(dirAnexos, 'nf-corrompida.pdf'), crypto.randomBytes(2048));
fs.writeFileSync(path.join(dirAnexos, 'nf-grande.pdf'), Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(21 * 1024 * 1024, 0x20)]));
fs.writeFileSync(path.join(dirAnexos, 'nf-executavel.png'), Buffer.concat([Buffer.from('MZ'), crypto.randomBytes(1024)]));
const nfs = [['nf-valida.pdf', 'Matheus'], ['nf-valida.png', 'Jorge'], ['nf-corrompida.pdf', 'Victor'], ['nf-grande.pdf', 'Victor'], ['nf-faltando.pdf', 'Victor'], ['nf-executavel.png', 'Victor']]
  .map(([arq, quem], n) => ({ ...base(`nf${n}`, `2025-0${n + 1}-15`), numero_nf: `SINT-${9000 + n}`, arquivo_url: arq, arquivo_nome: arq, arquivado_por_nome: quem, observacoes: 'SINT' }));
escrever('NotaFiscalArquivo', ['numero_nf', 'arquivo_url', 'arquivo_nome', 'arquivado_por_nome', 'observacoes'], nfs);

console.log(`export sintético em ${saida}: ${fs.readdirSync(dirCsv).length} CSVs, ${fs.readdirSync(dirAnexos).length} anexos`);
