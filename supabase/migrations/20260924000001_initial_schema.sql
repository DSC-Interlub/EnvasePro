-- ============================================================================
-- MIGRATION: 20260924000001_initial_schema.sql
-- PROJETO: EnvasePro (Interlub)
-- DESCRIÇÃO: Schema completo das 23 tabelas, enums, sequences, triggers,
--            rastreabilidade de operadores, RLS e Storage.
-- CONFORMIDADE: Lições 1 a 10 do Projeto TechControl
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TIPOS ENUM PERSONALIZADOS
-- ============================================================================

CREATE TYPE public.user_role AS ENUM ('admin', 'operator');
CREATE TYPE public.sala_tipo AS ENUM ('Bio', 'Industrial');
CREATE TYPE public.sala_operador AS ENUM ('Bio', 'Industrial', 'Ambas');
CREATE TYPE public.produto_categoria AS ENUM ('Graxa', 'Óleo', 'Pasta');
CREATE TYPE public.status_padrao AS ENUM ('Pendente', 'Em Andamento', 'Concluído');
CREATE TYPE public.status_linha_empilha AS ENUM ('Pendente', 'Em Andamento', 'Pausado', 'Concluído');
CREATE TYPE public.tipo_linha_empilha AS ENUM ('Normal', 'Crítico', 'Avulso');
CREATE TYPE public.tipo_ocorrencia_empilha AS ENUM ('Problema', 'Amassado', 'Produto errado', 'Equipamento', 'Outro');
CREATE TYPE public.funcao_registro_ocorrencia AS ENUM ('Empilhador', 'Ajudante', 'Líder');
CREATE TYPE public.tipo_parada_empilha AS ENUM ('Quebra', 'Manutenção', 'Aguardando operador', 'Falta de material', 'Outro');
CREATE TYPE public.tipo_manutencao AS ENUM ('Preventiva', 'Corretiva', 'Revisão Geral');
CREATE TYPE public.tipo_local_limpeza AS ENUM ('Sala', 'Galpão', 'Banheiro', 'Área externa', 'Corredor', 'Outro');
CREATE TYPE public.tipo_limpeza AS ENUM ('Varrição', 'Lavagem', 'Desinfecção', 'Limpeza geral', 'Outro');
CREATE TYPE public.status_limpeza AS ENUM ('Pendente', 'Em Andamento', 'Concluído', 'Atrasado');
CREATE TYPE public.status_assinatura AS ENUM ('Pendente', 'Parcial', 'Completo');
CREATE TYPE public.tipo_fornecedor AS ENUM ('Nacional', 'Internacional', 'Ambos');
CREATE TYPE public.tipo_recebimento AS ENUM ('Importação', 'Nacional', 'Devolução', 'Material auxiliar', 'Outro');
CREATE TYPE public.status_recebimento AS ENUM ('Agendado', 'Em andamento', 'Pausado', 'Concluído', 'Cancelado');
CREATE TYPE public.prioridade_recebimento AS ENUM ('Normal', 'Alta', 'Urgente');
CREATE TYPE public.status_item_recebimento AS ENUM ('Pendente conferência', 'OK', 'Divergência de quantidade', 'Avaria', 'Recusado');
CREATE TYPE public.funcao_participante_recebimento AS ENUM ('Coordenador', 'Conferente', 'Auxiliar');
CREATE TYPE public.tipo_ocorrencia_recebimento AS ENUM ('Avaria', 'Divergência de quantidade', 'Produto errado', 'Atraso', 'Problema de documento', 'Problema de acesso', 'Outro');
CREATE TYPE public.resposta_checklist AS ENUM ('Sim', 'Não');
CREATE TYPE public.resposta_checklist_na AS ENUM ('Sim', 'Não', 'N/A');
CREATE TYPE public.material_recebimento_tipo AS ENUM ('Spray', 'Rótulo', 'Embalagem', 'Produto Interlub', 'Matéria Prima (Terceiros)');
CREATE TYPE public.unidade_medida_checklist AS ENUM ('KG', 'LT', 'PC', 'UN', 'MILHEIRO', 'M³');

-- ============================================================================
-- 2. SEQUENCES E FUNÇÃO GERADORA DE PROTOCOLOS (Lição 4)
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS public.seq_checklist_recebimento START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_recebimento_protocolo START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_envase_protocolo START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_checkout_prog START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_empilha_prog START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_nf_arquivo_protocolo START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.gerar_protocolo(prefixo TEXT, nome_sequence TEXT)
RETURNS TEXT AS $$
DECLARE
  proximo_val BIGINT;
  ano_atual TEXT;
BEGIN
  EXECUTE format('SELECT nextval(%L)', nome_sequence) INTO proximo_val;
  ano_atual := to_char(CURRENT_DATE, 'YYYY');
  RETURN prefixo || '-' || ano_atual || '-' || LPAD(proximo_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ============================================================================
-- 3. PERFIS DE USUÁRIO (auth.users + user_profiles)
-- ============================================================================

CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role public.user_role NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'operator')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 4. CADASTROS MESTRES (Product, Embalagem, Operator)
-- ============================================================================

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  unidade_medida TEXT,
  consistencia TEXT NOT NULL,
  categoria public.produto_categoria,
  nsf_3h BOOLEAN NOT NULL DEFAULT false,
  nsf_h1 BOOLEAN NOT NULL DEFAULT false,
  halal BOOLEAN NOT NULL DEFAULT false,
  kosher BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.embalagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  conteudo NUMERIC(12, 3) NOT NULL,
  tipo TEXT,
  conteudo_ext TEXT,
  ultimos_4_digitos TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  matricula TEXT,
  sala public.sala_operador NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  foto_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. MÓDULO ENVASE (operator_id NOT NULL Obrigatório)
-- ============================================================================

CREATE TABLE public.envase_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo TEXT NOT NULL UNIQUE DEFAULT public.gerar_protocolo('ENV', 'public.seq_envase_protocolo'),
  sala public.sala_tipo NOT NULL,
  data DATE NOT NULL,
  mes INTEGER,
  ano INTEGER,
  op TEXT,
  operador TEXT NOT NULL,
  operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE RESTRICT,
  codigo_produto TEXT NOT NULL REFERENCES public.products(codigo) ON UPDATE CASCADE,
  descricao_produto TEXT,
  consistencia TEXT,
  codigo_embalagem TEXT REFERENCES public.embalagens(codigo) ON UPDATE CASCADE,
  descricao_embalagem TEXT,
  multiplo NUMERIC(12, 3),
  quantidade_produzida NUMERIC(12, 3) NOT NULL,
  inicio TIME,
  termino TIME,
  tempo_produtivo TEXT,
  quantidade_embalagens NUMERIC(12, 3),
  tempo_por_embalagem TEXT,
  dificuldade_codigo SMALLINT CHECK (dificuldade_codigo IN (0, 1, 2, 3)) DEFAULT 0,
  dificuldade_tipo TEXT,
  lote_embalagem TEXT,
  lotes_tampa TEXT,
  observacoes TEXT,
  material_retirado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. MÓDULO CHECK-OUT (Rastreabilidade Obrigatória)
-- ============================================================================

CREATE TABLE public.checkout_programacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_programacao TEXT NOT NULL UNIQUE DEFAULT public.gerar_protocolo('CKO', 'public.seq_checkout_prog'),
  data_programada DATE NOT NULL,
  total_pedidos INTEGER DEFAULT 0,
  pedidos_concluidos INTEGER DEFAULT 0,
  status public.status_padrao NOT NULL DEFAULT 'Pendente',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.checkout_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programacao_id UUID NOT NULL REFERENCES public.checkout_programacoes(id) ON DELETE CASCADE,
  numero_pedido TEXT NOT NULL,
  data_entrega DATE,
  cliente TEXT NOT NULL,
  operador TEXT,
  operator_id UUID REFERENCES public.operators(id) ON DELETE RESTRICT,
  hora_inicio TIME,
  hora_termino TIME,
  tempo_total TEXT,
  critico BOOLEAN NOT NULL DEFAULT false,
  data_saida DATE,
  finalizado_fora_do_prazo BOOLEAN NOT NULL DEFAULT false,
  data_finalizacao_real DATE,
  motivo_atraso TEXT,
  status public.status_padrao NOT NULL DEFAULT 'Pendente',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_checkout_item_operador_obrigatorio 
    CHECK (status = 'Pendente' OR operator_id IS NOT NULL)
);

-- ============================================================================
-- 7. MÓDULO EMPILHADEIRA (Operador Obrigatório / Ajudante Opcional)
-- ============================================================================

CREATE TABLE public.empilhadeira_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  marca TEXT,
  modelo TEXT,
  numero_serie TEXT,
  ativa BOOLEAN NOT NULL DEFAULT true,
  intervalo_manutencao_dias INTEGER NOT NULL,
  data_ultima_manutencao DATE,
  data_proxima_manutencao DATE,
  duracao_turno_horas NUMERIC(4, 1) NOT NULL DEFAULT 8.0,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.empilha_programacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_programacao TEXT NOT NULL UNIQUE DEFAULT public.gerar_protocolo('EMP', 'public.seq_empilha_prog'),
  data_programada DATE NOT NULL,
  empilhadeira_id UUID NOT NULL REFERENCES public.empilhadeira_configs(id) ON DELETE RESTRICT,
  status public.status_padrao NOT NULL DEFAULT 'Pendente',
  total_linhas INTEGER DEFAULT 0,
  linhas_concluidas INTEGER DEFAULT 0,
  observacoes TEXT,
  criado_por TEXT,
  criado_por_id UUID REFERENCES public.operators(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.empilha_linhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programacao_id UUID NOT NULL REFERENCES public.empilha_programacoes(id) ON DELETE CASCADE,
  tipo_linha public.tipo_linha_empilha NOT NULL DEFAULT 'Normal',
  numero_item TEXT,
  codigo_produto TEXT REFERENCES public.products(codigo) ON UPDATE CASCADE,
  descricao_produto TEXT,
  lote TEXT,
  deposito TEXT,
  rua_torre TEXT,
  quantidade NUMERIC(12, 3),
  status public.status_linha_empilha NOT NULL DEFAULT 'Pendente',
  operador_empilhadeira TEXT,
  operador_empilhadeira_id UUID REFERENCES public.operators(id) ON DELETE RESTRICT,
  operador_ajudante TEXT,
  operador_ajudante_id UUID REFERENCES public.operators(id) ON DELETE SET NULL, -- Ajudante é opcional
  hora_inicio TIME,
  hora_pausa TIME,
  hora_retomada TIME,
  hora_termino TIME,
  tempo_total TEXT,
  tempo_pausado TEXT,
  assinatura_operador BOOLEAN NOT NULL DEFAULT false,
  assinatura_operador_nome TEXT,
  assinatura_operador_hora TIME,
  assinatura_ajudante BOOLEAN NOT NULL DEFAULT false,
  assinatura_ajudante_nome TEXT,
  assinatura_ajudante_hora TIME,
  assinatura_lider BOOLEAN NOT NULL DEFAULT false,
  assinatura_lider_nome TEXT,
  assinatura_lider_hora TIME,
  status_assinatura public.status_assinatura NOT NULL DEFAULT 'Pendente',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_empilha_linha_operador_obrigatorio 
    CHECK (status = 'Pendente' OR operador_empilhadeira_id IS NOT NULL)
);

CREATE TABLE public.empilha_ocorrencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programacao_id UUID REFERENCES public.empilha_programacoes(id) ON DELETE SET NULL,
  linha_id UUID REFERENCES public.empilha_linhas(id) ON DELETE SET NULL,
  tipo public.tipo_ocorrencia_empilha,
  descricao TEXT NOT NULL,
  registrado_por TEXT NOT NULL,
  registrado_por_id UUID REFERENCES public.operators(id) ON DELETE SET NULL,
  registrado_por_funcao public.funcao_registro_ocorrencia,
  data DATE NOT NULL,
  hora TIME NOT NULL,
  notificado_lider BOOLEAN NOT NULL DEFAULT false,
  resolvido BOOLEAN NOT NULL DEFAULT false,
  resolucao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.empilhadeira_paradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empilhadeira_id UUID NOT NULL REFERENCES public.empilhadeira_configs(id) ON DELETE RESTRICT,
  programacao_id UUID REFERENCES public.empilha_programacoes(id) ON DELETE SET NULL,
  tipo public.tipo_parada_empilha,
  descricao TEXT,
  registrado_por TEXT NOT NULL,
  registrado_por_id UUID REFERENCES public.operators(id) ON DELETE SET NULL,
  data DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME,
  tempo_total TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.empilhadeira_manutencoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empilhadeira_id UUID NOT NULL REFERENCES public.empilhadeira_configs(id) ON DELETE CASCADE,
  data_manutencao DATE NOT NULL,
  tipo public.tipo_manutencao,
  descricao TEXT,
  responsavel TEXT,
  proxima_prevista DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 8. MÓDULO LIMPEZA
-- ============================================================================

CREATE TABLE public.limpeza_locais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  tipo public.tipo_local_limpeza,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.limpeza_programacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id UUID NOT NULL REFERENCES public.limpeza_locais(id) ON DELETE RESTRICT,
  local_nome TEXT,
  responsavel_id UUID REFERENCES public.operators(id) ON DELETE SET NULL,
  responsavel_nome TEXT,
  responsaveis JSONB DEFAULT '[]'::jsonb,
  assinaturas_responsaveis JSONB DEFAULT '[]'::jsonb,
  data_prevista DATE NOT NULL,
  hora_prevista TIME,
  tipo_limpeza public.tipo_limpeza,
  observacoes TEXT,
  status public.status_limpeza NOT NULL DEFAULT 'Pendente',
  data_realizada DATE,
  hora_inicio TIME,
  hora_fim TIME,
  assinatura_responsavel BOOLEAN NOT NULL DEFAULT false,
  assinatura_responsavel_nome TEXT,
  assinatura_responsavel_hora TIME,
  assinatura_lider BOOLEAN NOT NULL DEFAULT false,
  assinatura_lider_nome TEXT,
  assinatura_lider_hora TIME,
  status_assinatura public.status_assinatura NOT NULL DEFAULT 'Pendente',
  criado_por TEXT,
  criado_por_id UUID REFERENCES public.operators(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 9. MÓDULO RECEBIMENTO
-- ============================================================================

CREATE TABLE public.recebimento_fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  tipo public.tipo_fornecedor,
  pais_origem TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.recebimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo_recebimento TEXT NOT NULL UNIQUE DEFAULT public.gerar_protocolo('REC', 'public.seq_recebimento_protocolo'),
  tipo public.tipo_recebimento NOT NULL,
  numero_documento TEXT NOT NULL,
  numero_nf TEXT,
  fornecedor_id UUID REFERENCES public.recebimento_fornecedores(id) ON DELETE SET NULL,
  fornecedor_nome TEXT,
  data_prevista DATE,
  data_chegada DATE,
  descricao TEXT,
  status public.status_recebimento NOT NULL DEFAULT 'Agendado',
  prioridade public.prioridade_recebimento NOT NULL DEFAULT 'Normal',
  coordenador_id UUID REFERENCES public.operators(id) ON DELETE RESTRICT,
  coordenador_nome TEXT,
  datetime_inicio TIMESTAMPTZ,
  datetime_pausa TIMESTAMPTZ,
  datetime_retomada TIMESTAMPTZ,
  datetime_fim TIMESTAMPTZ,
  tempo_produtivo_minutos NUMERIC(10, 2),
  tempo_pausado_minutos NUMERIC(10, 2),
  observacoes_finais TEXT,
  assinatura_coordenador BOOLEAN NOT NULL DEFAULT false,
  assinatura_coordenador_nome TEXT,
  assinatura_coordenador_datetime TIMESTAMPTZ,
  assinatura_lider BOOLEAN NOT NULL DEFAULT false,
  assinatura_lider_nome TEXT,
  assinatura_lider_datetime TIMESTAMPTZ,
  status_assinatura public.status_assinatura NOT NULL DEFAULT 'Pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.recebimento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recebimento_id UUID NOT NULL REFERENCES public.recebimentos(id) ON DELETE CASCADE,
  produto_codigo TEXT REFERENCES public.products(codigo) ON UPDATE CASCADE,
  produto_descricao TEXT NOT NULL,
  lote TEXT,
  quantidade_prevista NUMERIC(12, 3),
  quantidade_recebida NUMERIC(12, 3),
  unidade TEXT,
  status_item public.status_item_recebimento NOT NULL DEFAULT 'Pendente conferência',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.recebimento_participantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recebimento_id UUID NOT NULL REFERENCES public.recebimentos(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE RESTRICT,
  operator_nome TEXT,
  funcao public.funcao_participante_recebimento,
  assinou BOOLEAN NOT NULL DEFAULT false,
  assinatura_datetime TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unq_recebimento_operador UNIQUE (recebimento_id, operator_id)
);

CREATE TABLE public.recebimento_ocorrencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recebimento_id UUID NOT NULL REFERENCES public.recebimentos(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.recebimento_itens(id) ON DELETE SET NULL,
  tipo public.tipo_ocorrencia_recebimento,
  descricao TEXT NOT NULL,
  registrado_por TEXT NOT NULL,
  registrado_por_id UUID REFERENCES public.operators(id) ON DELETE SET NULL,
  datetime_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolvido BOOLEAN NOT NULL DEFAULT false,
  resolucao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 10. MÓDULO QUALIDADE, SAP E CHECKLIST
-- ============================================================================

CREATE TABLE public.sap_pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serie_documento TEXT,
  numero_documento TEXT NOT NULL,
  codigo_fornecedor TEXT,
  nome_fornecedor TEXT NOT NULL,
  numero_referencia_fornecedor TEXT,
  data_vencimento DATE,
  data_chegada DATE,
  codigo_item TEXT,
  produto TEXT,
  quantidade NUMERIC(12, 3),
  item_para_recebimento TEXT,
  valor NUMERIC(14, 2),
  valor_liquido NUMERIC(14, 2),
  valor_imposto NUMERIC(14, 2),
  valor_original NUMERIC(14, 2),
  data_lancamento DATE,
  data_documento DATE,
  tipo_documento TEXT,
  nome_filial TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.checklist_recebimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_checklist TEXT NOT NULL UNIQUE DEFAULT public.gerar_protocolo('CHK', 'public.seq_checklist_recebimento'),
  pedido_disponivel_etapa5 public.resposta_checklist NOT NULL,
  numero_pedido_compras TEXT NOT NULL,
  sap_pedido_id UUID REFERENCES public.sap_pedidos(id) ON DELETE SET NULL,
  recebimento_id UUID REFERENCES public.recebimentos(id) ON DELETE SET NULL,
  nome_fornecedor TEXT NOT NULL,
  codigo_fornecedor TEXT,
  descricao_material TEXT NOT NULL,
  data_prevista_material DATE,
  data_entrega DATE NOT NULL,
  entrega_conforme_prevista public.resposta_checklist NOT NULL,
  inspecionado_por TEXT[] DEFAULT '{}',
  numero_nota_fiscal TEXT NOT NULL,
  material_recebimento public.material_recebimento_tipo NOT NULL,
  quantidade_recebida NUMERIC(12, 3) NOT NULL,
  unidade_medida public.unidade_medida_checklist NOT NULL,
  numero_lote TEXT NOT NULL,
  quantidade_conforme_nf public.resposta_checklist NOT NULL,
  amostragem_inspecionada public.resposta_checklist_na NOT NULL,
  condicoes_gerais_conformes public.resposta_checklist_na NOT NULL,
  spray_conforme_feps public.resposta_checklist_na NOT NULL,
  acompanha_certificado_analise public.resposta_checklist_na NOT NULL,
  acompanha_ficha_emergencia public.resposta_checklist_na NOT NULL,
  acompanha_fispq public.resposta_checklist_na NOT NULL,
  observacoes TEXT,
  total_sim INTEGER DEFAULT 0,
  total_nao INTEGER DEFAULT 0,
  soma_sim INTEGER DEFAULT 0,
  soma_nao INTEGER DEFAULT 0,
  nota_final INTEGER DEFAULT 0,
  criado_por_nome TEXT,
  criado_por_id UUID REFERENCES public.operators(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 11. MÓDULO NOTAS FISCAIS DIGITAIS
-- ============================================================================

CREATE TABLE public.nota_fiscal_arquivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo_arquivo TEXT NOT NULL UNIQUE DEFAULT public.gerar_protocolo('NFA', 'public.seq_nf_arquivo_protocolo'),
  numero_nf TEXT NOT NULL,
  arquivo_url TEXT,
  arquivo_nome TEXT,
  arquivado_por_nome TEXT,
  arquivado_por_id UUID REFERENCES public.operators(id) ON DELETE SET NULL,
  observacoes TEXT,
  data_arquivo DATE NOT NULL DEFAULT CURRENT_DATE,
  data_expiracao_legal DATE GENERATED ALWAYS AS (data_arquivo + INTERVAL '5 years') STORED,
  descartado BOOLEAN NOT NULL DEFAULT false,
  descartado_por TEXT,
  descartado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 12. TRIGGERS AUTOMÁTICOS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calcular_nota_checklist()
RETURNS TRIGGER AS $$
DECLARE
  sims INT := 0;
  naos INT := 0;
BEGIN
  IF NEW.pedido_disponivel_etapa5 = 'Sim' THEN sims := sims + 1; ELSIF NEW.pedido_disponivel_etapa5 = 'Não' THEN naos := naos + 1; END IF;
  IF NEW.entrega_conforme_prevista = 'Sim' THEN sims := sims + 1; ELSIF NEW.entrega_conforme_prevista = 'Não' THEN naos := naos + 1; END IF;
  IF NEW.quantidade_conforme_nf = 'Sim' THEN sims := sims + 1; ELSIF NEW.quantidade_conforme_nf = 'Não' THEN naos := naos + 1; END IF;
  IF NEW.amostragem_inspecionada = 'Sim' THEN sims := sims + 1; ELSIF NEW.amostragem_inspecionada = 'Não' THEN naos := naos + 1; END IF;
  IF NEW.condicoes_gerais_conformes = 'Sim' THEN sims := sims + 1; ELSIF NEW.condicoes_gerais_conformes = 'Não' THEN naos := naos + 1; END IF;
  IF NEW.spray_conforme_feps = 'Sim' THEN sims := sims + 1; ELSIF NEW.spray_conforme_feps = 'Não' THEN naos := naos + 1; END IF;
  IF NEW.acompanha_certificado_analise = 'Sim' THEN sims := sims + 1; ELSIF NEW.acompanha_certificado_analise = 'Não' THEN naos := naos + 1; END IF;
  IF NEW.acompanha_ficha_emergencia = 'Sim' THEN sims := sims + 1; ELSIF NEW.acompanha_ficha_emergencia = 'Não' THEN naos := naos + 1; END IF;
  IF NEW.acompanha_fispq = 'Sim' THEN sims := sims + 1; ELSIF NEW.acompanha_fispq = 'Não' THEN naos := naos + 1; END IF;

  NEW.total_sim := sims;
  NEW.total_nao := naos;
  NEW.soma_sim := sims * 10;
  NEW.soma_nao := naos * -10;
  NEW.nota_final := (sims * 10) + (naos * -10);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_calc_checklist
  BEFORE INSERT OR UPDATE ON public.checklist_recebimentos
  FOR EACH ROW EXECUTE FUNCTION public.calcular_nota_checklist();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename NOT IN ('pg_stat_statements')
  LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER trg_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', tbl);
  END LOOP;
END;
$$;

-- ============================================================================
-- 13. POLÍTICAS DE ROW LEVEL SECURITY (RLS) REFINADAS (Lição 1)
-- ============================================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embalagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.envase_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_programacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empilhadeira_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empilha_programacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empilha_linhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empilha_ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empilhadeira_paradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empilhadeira_manutencoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.limpeza_locais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.limpeza_programacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimento_fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimento_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimento_ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_recebimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nota_fiscal_arquivos ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- POLÍTICAS: user_profiles
-- ----------------------------------------------------------------------------
CREATE POLICY "user_profiles_read_own" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "user_profiles_update_admin" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- POLÍTICAS: TABELAS EXIBIDAS NAS TELAS DE TV (SELECT liberado para anon e auth)
-- ----------------------------------------------------------------------------

-- 1. products
CREATE POLICY "products_select_tv" ON public.products FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "products_write_admin" ON public.products FOR ALL TO authenticated USING (public.is_admin());

-- 2. operators
CREATE POLICY "operators_select_tv" ON public.operators FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "operators_write_admin" ON public.operators FOR ALL TO authenticated USING (public.is_admin());

-- 3. envase_records
CREATE POLICY "envase_select_tv" ON public.envase_records FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "envase_insert" ON public.envase_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "envase_update" ON public.envase_records FOR UPDATE TO authenticated USING (true);
CREATE POLICY "envase_delete_admin" ON public.envase_records FOR DELETE TO authenticated USING (public.is_admin());

-- 4. checkout_programacoes
CREATE POLICY "checkout_prog_select_tv" ON public.checkout_programacoes FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "checkout_prog_insert" ON public.checkout_programacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "checkout_prog_update" ON public.checkout_programacoes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "checkout_prog_delete_admin" ON public.checkout_programacoes FOR DELETE TO authenticated USING (public.is_admin());

-- 5. checkout_itens
CREATE POLICY "checkout_itens_select_tv" ON public.checkout_itens FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "checkout_itens_insert" ON public.checkout_itens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "checkout_itens_update" ON public.checkout_itens FOR UPDATE TO authenticated USING (true);
CREATE POLICY "checkout_itens_delete_admin" ON public.checkout_itens FOR DELETE TO authenticated USING (public.is_admin());

-- 6. empilhadeira_configs
CREATE POLICY "empilha_config_select_tv" ON public.empilhadeira_configs FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "empilha_config_write_admin" ON public.empilhadeira_configs FOR ALL TO authenticated USING (public.is_admin());

-- 7. empilha_programacoes
CREATE POLICY "empilha_prog_select_tv" ON public.empilha_programacoes FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "empilha_prog_insert" ON public.empilha_programacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "empilha_prog_update" ON public.empilha_programacoes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "empilha_prog_delete_admin" ON public.empilha_programacoes FOR DELETE TO authenticated USING (public.is_admin());

-- 8. empilha_linhas
CREATE POLICY "empilha_linhas_select_tv" ON public.empilha_linhas FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "empilha_linhas_insert" ON public.empilha_linhas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "empilha_linhas_update" ON public.empilha_linhas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "empilha_linhas_delete_admin" ON public.empilha_linhas FOR DELETE TO authenticated USING (public.is_admin());

-- 9. empilha_ocorrencias
CREATE POLICY "empilha_ocorr_select_tv" ON public.empilha_ocorrencias FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "empilha_ocorr_insert" ON public.empilha_ocorrencias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "empilha_ocorr_update" ON public.empilha_ocorrencias FOR UPDATE TO authenticated USING (true);
CREATE POLICY "empilha_ocorr_delete_admin" ON public.empilha_ocorrencias FOR DELETE TO authenticated USING (public.is_admin());

-- 10. empilhadeira_paradas
CREATE POLICY "empilha_paradas_select_tv" ON public.empilhadeira_paradas FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "empilha_paradas_insert" ON public.empilhadeira_paradas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "empilha_paradas_update" ON public.empilhadeira_paradas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "empilha_paradas_delete_admin" ON public.empilhadeira_paradas FOR DELETE TO authenticated USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- POLÍTICAS: DEMAIS TABELAS (SELECT estritamente authenticated, SEM anon)
-- DELETE restrito estritamente a admin
-- ----------------------------------------------------------------------------

-- Embalagens
CREATE POLICY "embalagens_select_auth" ON public.embalagens FOR SELECT TO authenticated USING (true);
CREATE POLICY "embalagens_write_admin" ON public.embalagens FOR ALL TO authenticated USING (public.is_admin());

-- Empilhadeira Manutenções
CREATE POLICY "empilha_manut_select_auth" ON public.empilhadeira_manutencoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "empilha_manut_insert" ON public.empilhadeira_manutencoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "empilha_manut_update" ON public.empilhadeira_manutencoes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "empilha_manut_delete_admin" ON public.empilhadeira_manutencoes FOR DELETE TO authenticated USING (public.is_admin());

-- Limpeza Locais
CREATE POLICY "limpeza_locais_select_auth" ON public.limpeza_locais FOR SELECT TO authenticated USING (true);
CREATE POLICY "limpeza_locais_write_admin" ON public.limpeza_locais FOR ALL TO authenticated USING (public.is_admin());

-- Limpeza Programações
CREATE POLICY "limpeza_prog_select_auth" ON public.limpeza_programacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "limpeza_prog_insert" ON public.limpeza_programacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "limpeza_prog_update" ON public.limpeza_programacoes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "limpeza_prog_delete_admin" ON public.limpeza_programacoes FOR DELETE TO authenticated USING (public.is_admin());

-- Fornecedores de Recebimento
CREATE POLICY "fornecedores_select_auth" ON public.recebimento_fornecedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "fornecedores_write_admin" ON public.recebimento_fornecedores FOR ALL TO authenticated USING (public.is_admin());

-- Recebimentos (Cabeçalho)
CREATE POLICY "recebimento_select_auth" ON public.recebimentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "recebimento_insert" ON public.recebimentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "recebimento_update" ON public.recebimentos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "recebimento_delete_admin" ON public.recebimentos FOR DELETE TO authenticated USING (public.is_admin());

-- Recebimento Itens
CREATE POLICY "recebimento_itens_select_auth" ON public.recebimento_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "recebimento_itens_insert" ON public.recebimento_itens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "recebimento_itens_update" ON public.recebimento_itens FOR UPDATE TO authenticated USING (true);
CREATE POLICY "recebimento_itens_delete_admin" ON public.recebimento_itens FOR DELETE TO authenticated USING (public.is_admin());

-- Recebimento Participantes
CREATE POLICY "recebimento_part_select_auth" ON public.recebimento_participantes FOR SELECT TO authenticated USING (true);
CREATE POLICY "recebimento_part_insert" ON public.recebimento_participantes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "recebimento_part_update" ON public.recebimento_participantes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "recebimento_part_delete_admin" ON public.recebimento_participantes FOR DELETE TO authenticated USING (public.is_admin());

-- Recebimento Ocorrências
CREATE POLICY "recebimento_ocorr_select_auth" ON public.recebimento_ocorrencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "recebimento_ocorr_insert" ON public.recebimento_ocorrencias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "recebimento_ocorr_update" ON public.recebimento_ocorrencias FOR UPDATE TO authenticated USING (true);
CREATE POLICY "recebimento_ocorr_delete_admin" ON public.recebimento_ocorrencias FOR DELETE TO authenticated USING (public.is_admin());

-- Pedidos SAP (Confidencial: restrito a usuários autenticados)
CREATE POLICY "sap_pedidos_select_auth" ON public.sap_pedidos FOR SELECT TO authenticated USING (true);
CREATE POLICY "sap_pedidos_write_admin" ON public.sap_pedidos FOR ALL TO authenticated USING (public.is_admin());

-- Checklist de Qualidade (Auditoria interna: restrito a usuários autenticados)
CREATE POLICY "checklist_select_auth" ON public.checklist_recebimentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_insert" ON public.checklist_recebimentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "checklist_update" ON public.checklist_recebimentos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "checklist_delete_admin" ON public.checklist_recebimentos FOR DELETE TO authenticated USING (public.is_admin());

-- Notas Fiscais Arquivadas (Documentos fiscais: restrito a usuários autenticados)
CREATE POLICY "nf_select_auth" ON public.nota_fiscal_arquivos FOR SELECT TO authenticated USING (true);
CREATE POLICY "nf_insert" ON public.nota_fiscal_arquivos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "nf_update" ON public.nota_fiscal_arquivos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "nf_delete_admin" ON public.nota_fiscal_arquivos FOR DELETE TO authenticated USING (public.is_admin());

-- ============================================================================
-- 14. BUCKETS DE STORAGE & RLS DE ARQUIVOS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('fotos-operadores', 'fotos-operadores', true),
  ('notas-fiscais', 'notas-fiscais', false)
ON CONFLICT (id) DO NOTHING;

-- Policies para fotos-operadores (Público para leitura de avatares na TV e App)
CREATE POLICY "fotos_public_read" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'fotos-operadores');

CREATE POLICY "fotos_upload_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fotos-operadores');

CREATE POLICY "fotos_update_auth" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'fotos-operadores');

CREATE POLICY "fotos_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'fotos-operadores' AND public.is_admin());

-- Policies para notas-fiscais (Privado: requer autenticação)
CREATE POLICY "nf_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'notas-fiscais');

CREATE POLICY "nf_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notas-fiscais');

CREATE POLICY "nf_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'notas-fiscais');

CREATE POLICY "nf_storage_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'notas-fiscais' AND public.is_admin());

-- ============================================================================
-- 15. RELOAD DO SCHEMA CACHE (Lição 7)
-- ============================================================================

NOTIFY pgrst, 'reload schema';
