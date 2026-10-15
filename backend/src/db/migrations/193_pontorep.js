// 193_pontorep.js — Módulo PONTO REP-P NATIVO (Portaria MTP 671).
// Fundação + seeds: parâmetros legais, modelos de escala padrão, motivos de afastamento,
// escala com validação de legislação (alertas) e autorização de superior do RH (exceções),
// estabelecimento e batida imutável (núcleo do registrador).
// Idempotente (CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE).
const db = require('../connection');
const { v4: uuid } = require('uuid');
const EMP = 'empresa-mutti-001';

// ───────── Catálogo de parâmetros legais (nada fixo no código; editável pelo RH) ─────────
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_param (
  empresa_id    TEXT NOT NULL,
  chave         TEXT NOT NULL,
  valor         TEXT,
  unidade       TEXT,
  descricao     TEXT,
  atualizado_em TEXT,
  PRIMARY KEY (empresa_id, chave)
)`);

// ───────── Modelos de escala padrão (semeados; o RH pode criar outros) ─────────
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_escala_modelo (
  id                 TEXT PRIMARY KEY,
  empresa_id         TEXT NOT NULL,
  codigo             TEXT NOT NULL,
  nome               TEXT NOT NULL,
  base_legal         TEXT,
  jornada_diaria_min INTEGER,        -- minutos de jornada por dia trabalhado
  dias_trabalha      INTEGER,        -- dias de trabalho no ciclo
  dias_folga         INTEGER,        -- dias de folga no ciclo
  controla_ponto     INTEGER DEFAULT 1,
  doc_exigido        TEXT,
  observacao         TEXT,
  padrao             INTEGER DEFAULT 1,
  ativo              INTEGER DEFAULT 1,
  criado_em          TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, codigo)
)`);

// ───────── Motivos de afastamento / abono (semeados; art. 473 e INSS) ─────────
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_afastamento_motivo (
  id          TEXT PRIMARY KEY,
  empresa_id  TEXT NOT NULL,
  codigo      TEXT NOT NULL,
  nome        TEXT NOT NULL,
  base_legal  TEXT,
  dias_regra  TEXT,                  -- texto: "2 dias", "até 15 dias", "120 dias"…
  quem_paga   TEXT,                  -- E=empresa, I=INSS, N=não remunerado
  remunerado  INTEGER DEFAULT 1,
  justificada INTEGER DEFAULT 1,     -- falta justificada (não desconta)
  doc_exigido TEXT,
  padrao      INTEGER DEFAULT 1,
  ativo       INTEGER DEFAULT 1,
  UNIQUE(empresa_id, codigo)
)`);

// ───────── Escala criada (cabeçalho) ─────────
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_escala (
  id                TEXT PRIMARY KEY,
  empresa_id        TEXT NOT NULL,
  loja_id           TEXT,
  colaborador_id    TEXT NOT NULL,
  modelo_id         TEXT,
  data_ini          TEXT NOT NULL,
  data_fim          TEXT NOT NULL,
  entrada           TEXT,            -- HH:MM base
  saida             TEXT,
  intervalo_min     INTEGER DEFAULT 0,
  status            TEXT DEFAULT 'rascunho', -- rascunho|pendente_autorizacao|autorizada|publicada
  criado_por_id     TEXT,
  autorizado_por_id TEXT,
  autorizado_em     TEXT,
  criado_em         TEXT DEFAULT (datetime('now')),
  atualizado_em     TEXT
)`);

// ───────── Dias da escala (jornada prevista por dia) ─────────
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_escala_dia (
  id            TEXT PRIMARY KEY,
  escala_id     TEXT NOT NULL,
  data          TEXT NOT NULL,
  folga         INTEGER DEFAULT 0,
  entrada       TEXT,
  saida         TEXT,
  intervalo_min INTEGER DEFAULT 0,
  jornada_min   INTEGER DEFAULT 0,
  UNIQUE(escala_id, data)
)`);

// ───────── Exceções / alertas de legislação + autorização do RH ─────────
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_excecao (
  id                TEXT PRIMARY KEY,
  empresa_id        TEXT NOT NULL,
  escala_id         TEXT,
  regra             TEXT NOT NULL,     -- ex.: interjornada_min
  nivel             TEXT NOT NULL,     -- informativo|atencao|critico|bloqueio
  base_legal        TEXT,
  mensagem          TEXT NOT NULL,
  data_ref          TEXT,
  status            TEXT DEFAULT 'pendente', -- pendente|autorizada|revogada
  justificativa     TEXT,
  autorizado_por_id TEXT,
  autorizado_em     TEXT,
  criado_em         TEXT DEFAULT (datetime('now'))
)`);

// ───────── Estabelecimento (controle por CNPJ/loja) ─────────
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_estabelecimento (
  id           TEXT PRIMARY KEY,
  empresa_id   TEXT NOT NULL,
  loja_id      TEXT NOT NULL,
  cnpj         TEXT,
  razao_social TEXT,
  fuso         TEXT DEFAULT 'America/Bahia',
  criado_em    TEXT DEFAULT (datetime('now')),
  UNIQUE(empresa_id, loja_id)
)`);

// ───────── Batida ORIGINAL — imutável (Portaria 671). Correção vira camada por cima ─────────
db.exec(`CREATE TABLE IF NOT EXISTS pontorep_marcacao (
  id                    TEXT PRIMARY KEY,
  empresa_id            TEXT NOT NULL,
  estabelecimento_id    TEXT,
  nsr                   INTEGER NOT NULL,   -- sequencial por estabelecimento, sem lacunas
  colaborador_id        TEXT NOT NULL,
  data_hora             TEXT NOT NULL,      -- hora do servidor
  data_hora_dispositivo TEXT,
  offline               INTEGER DEFAULT 0,
  tipo_ident            TEXT,               -- B=biometria, F=foto, P=PIN
  origem                TEXT,               -- A=app, W=web, R=relógio
  latitude              REAL,
  longitude             REAL,
  foto_ref              TEXT,               -- LGPD: dado sensível (só referência)
  hash                  TEXT,
  hash_anterior         TEXT,
  criado_em             TEXT DEFAULT (datetime('now')),
  UNIQUE(estabelecimento_id, nsr)
)`);
// Imutabilidade forçada no banco: bloqueia UPDATE e DELETE da batida original.
db.exec(`CREATE TRIGGER IF NOT EXISTS trg_pontorep_marcacao_no_update
  BEFORE UPDATE ON pontorep_marcacao BEGIN
    SELECT RAISE(ABORT, 'Marcacao de ponto e imutavel (Portaria 671)'); END`);
db.exec(`CREATE TRIGGER IF NOT EXISTS trg_pontorep_marcacao_no_delete
  BEFORE DELETE ON pontorep_marcacao BEGIN
    SELECT RAISE(ABORT, 'Marcacao de ponto e imutavel (Portaria 671)'); END`);

// ═══════════════════════ SEEDS ═══════════════════════

// Parâmetros legais (padrão atual da CLT/convenção; editáveis)
const PARAMS = [
  ['jornada_diaria_max_min', '480', 'min', 'Jornada diária máxima (8h; 12h no 12x36)'],
  ['jornada_semanal_max_min', '2640', 'min', 'Jornada semanal máxima (44h)'],
  ['folgas_semanais_min', '1', 'qtd', 'Folgas semanais mínimas'],
  ['domingo_folga_ciclo_sem', '3', 'semanas', '1 domingo de folga a cada N semanas (comércio)'],
  ['tolerancia_marcacao_min', '5', 'min', 'Tolerância por marcação'],
  ['tolerancia_dia_min', '10', 'min', 'Tolerância somada no dia'],
  ['he_max_dia_min', '120', 'min', 'Hora extra máxima por dia (2h)'],
  ['adic_he_dia_util_pct', '50', '%', 'Adicional de HE em dia útil'],
  ['adic_dom_feriado_pct', '100', '%', 'Adicional domingo/feriado não compensado'],
  ['noturno_ini', '22:00', 'hora', 'Início da janela noturna'],
  ['noturno_fim', '05:00', 'hora', 'Fim da janela noturna'],
  ['hora_noturna_seg', '3150', 'seg', 'Hora noturna reduzida (52min30s)'],
  ['adic_noturno_pct', '20', '%', 'Adicional noturno'],
  ['intervalo_intra_min_min', '60', 'min', 'Intervalo intrajornada mínimo (jornada > 6h)'],
  ['intervalo_intra_max_min', '120', 'min', 'Intervalo intrajornada máximo (jornada > 6h)'],
  ['intervalo_4a6_min', '15', 'min', 'Intervalo para jornada de 4h a 6h'],
  ['interjornada_min_min', '660', 'min', 'Interjornada mínima (11h)'],
  ['dias_consecutivos_max', '6', 'dias', 'Máximo de dias consecutivos antes do DSR (até o 7º)'],
  ['banco_prazo_meses', '12', 'meses', 'Prazo do banco de horas (coletivo)'],
  ['banco_limite_pos_min', '2400', 'min', 'Limite positivo do banco (40h)'],
  ['banco_limite_neg_min', '1200', 'min', 'Limite negativo do banco (20h)'],
  ['desconta_dsr_falta', '1', 'bool', 'Desconta DSR por falta injustificada'],
];
const upParam = db.prepare(`INSERT OR IGNORE INTO pontorep_param
  (empresa_id, chave, valor, unidade, descricao, atualizado_em) VALUES (?,?,?,?,?,datetime('now'))`);
PARAMS.forEach(p => upParam.run(EMP, p[0], p[1], p[2], p[3]));

// Modelos de escala padrão — [codigo, nome, base_legal, jornada_min, dias_trab, dias_folga, controla, doc, obs]
const MODELOS = [
  ['6x1', '6x1 (Integral)', 'CF art.7º XIII; CLT art.58', 440, 6, 1, 1, 'Contrato', '44h/sem, 7h20/dia, 1 folga semanal'],
  ['5x2', '5x2 c/ compensação de sábado', 'CLT art.59 §6º', 528, 5, 2, 1, 'Acordo de compensação', '44h em 5 dias (8h48/dia), sábado compensado'],
  ['12x36', '12x36', 'CLT art.59-A', 720, 1, 1, 1, 'Acordo individual escrito ou norma coletiva', '12h de trabalho por 36h de descanso'],
  ['5x1', '5x1 (revezamento)', 'CLT art.611-A', 480, 5, 1, 1, 'Norma coletiva', 'Escala especial de revezamento'],
  ['6x2', '6x2 (revezamento)', 'CLT art.611-A', 480, 6, 2, 1, 'Norma coletiva', 'Escala especial de revezamento'],
  ['4x2', '4x2 (revezamento)', 'CLT art.611-A', 480, 4, 2, 1, 'Norma coletiva', 'Escala especial de revezamento'],
  ['turno6h', 'Turno ininterrupto de 6h', 'CF art.7º XIV', 360, 6, 1, 1, 'Norma coletiva (se > 6h)', 'Jornada de 6h; acima só por norma coletiva'],
  ['parcial', 'Tempo parcial', 'CLT art.58-A', 360, 5, 2, 1, 'Contrato de tempo parcial', 'Até 30h/sem sem hora extra'],
  ['aprendiz', 'Aprendiz', 'CLT arts.432 e 403', 360, 5, 2, 1, 'Contrato de aprendizagem', 'Até 6h/dia; proibido HE, compensação e noturno'],
  ['estagio', 'Estágio', 'Lei 11.788/2008', 360, 5, 2, 1, 'Termo de compromisso', 'Até 6h/30h; recesso de 30 dias'],
  ['menor', 'Menor de 18 (não aprendiz)', 'CLT arts.404 e 413', 480, 6, 1, 1, 'Contrato', 'Proibido noturno; HE só p/ compensação ou força maior'],
];
const upMod = db.prepare(`INSERT OR IGNORE INTO pontorep_escala_modelo
  (id, empresa_id, codigo, nome, base_legal, jornada_diaria_min, dias_trabalha, dias_folga, controla_ponto, doc_exigido, observacao, padrao, ativo)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,1,1)`);
MODELOS.forEach(m => upMod.run(uuid(), EMP, m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]));

// Motivos de afastamento — [codigo, nome, base_legal, dias_regra, quem_paga, remunerado, justificada, doc]
const MOTIVOS = [
  ['atestado', 'Atestado médico', 'Lei 605/49; CLT', 'Até 15 dias consecutivos', 'E', 1, 1, 'Atestado (CID opcional — dado sensível)'],
  ['auxilio_doenca', 'Auxílio por incapacidade (doença)', 'Lei 8.213/91', 'A partir do 16º dia', 'I', 1, 1, 'Atestado + perícia'],
  ['acidente_trabalho', 'Acidente de trabalho', 'Lei 8.213 art.118', 'Empresa até 15º dia, depois INSS; estabilidade 12m', 'I', 1, 1, 'CAT'],
  ['licenca_maternidade', 'Licença-maternidade', 'CLT / Lei 8.213', '120 dias (180 no Empresa Cidadã)', 'I', 1, 1, 'Certidão/atestado'],
  ['aborto', 'Aborto não criminoso', 'CLT art.395', '2 semanas', 'I', 1, 1, 'Atestado'],
  ['licenca_paternidade', 'Licença-paternidade', 'CF art.7º; Empresa Cidadã', '5 dias (20 no Empresa Cidadã)', 'E', 1, 1, 'Certidão'],
  ['falecimento', 'Falecimento de familiar', 'CLT art.473, I', '2 dias consecutivos', 'E', 1, 1, 'Certidão de óbito'],
  ['casamento', 'Casamento (gala)', 'CLT art.473, II', '3 dias consecutivos', 'E', 1, 1, 'Certidão'],
  ['doacao_sangue', 'Doação de sangue', 'CLT art.473, IV', '1 dia a cada 12 meses', 'E', 1, 1, 'Comprovante'],
  ['exame_cancer', 'Exames preventivos de câncer', 'CLT art.473, XII', 'Até 3 dias a cada 12 meses', 'E', 1, 1, 'Comprovante'],
  ['acomp_filho', 'Acompanhar filho até 6 anos ao médico', 'CLT art.473, XI', '1 dia por ano', 'E', 1, 1, 'Declaração'],
  ['acomp_gestante', 'Acompanhar gestante (pré-natal)', 'CLT art.473, X', 'Até 6 consultas', 'E', 1, 1, 'Declaração'],
  ['alistamento', 'Alistamento eleitoral / convocação da Justiça', 'CLT art.473, V e VIII', 'Conforme convocação', 'E', 1, 1, 'Comprovante'],
  ['mesario', 'Mesário', 'Lei 9.504 art.98', 'Folga em dobro dos dias convocados', 'E', 1, 1, 'Declaração do TRE'],
  ['suspensao', 'Suspensão disciplinar', 'CLT art.474', 'Até 30 dias', 'N', 0, 0, 'Advertência/suspensão assinada'],
  ['licenca_nao_remunerada', 'Licença não remunerada', 'Acordo entre as partes', 'Conforme acordo', 'N', 0, 1, 'Termo'],
  ['ferias', 'Férias', 'CLT arts.129 a 145', 'Conforme período aquisitivo/concessivo', 'E', 1, 1, 'Programação de férias'],
  ['servico_militar', 'Serviço militar', 'CLT art.472', 'Conforme convocação', 'N', 0, 1, 'Comprovante'],
];
const upMot = db.prepare(`INSERT OR IGNORE INTO pontorep_afastamento_motivo
  (id, empresa_id, codigo, nome, base_legal, dias_regra, quem_paga, remunerado, justificada, doc_exigido, padrao, ativo)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,1)`);
MOTIVOS.forEach(m => upMot.run(uuid(), EMP, m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7]));

console.log('✅ migration 193: módulo pontorep (REP-P) criado —',
  db.prepare(`SELECT COUNT(*) n FROM pontorep_escala_modelo`).get().n, 'modelos,',
  db.prepare(`SELECT COUNT(*) n FROM pontorep_afastamento_motivo`).get().n, 'motivos,',
  db.prepare(`SELECT COUNT(*) n FROM pontorep_param`).get().n, 'parâmetros semeados');
