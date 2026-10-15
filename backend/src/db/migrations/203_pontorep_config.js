// 203_pontorep_config.js — Configurações (Geral/Web/Mobile/Inconsistências) + coluna de
// inconsistências na apuração. Idempotente.
const db = require('../connection');
const EMP = 'empresa-mutti-001';

db.exec(`CREATE TABLE IF NOT EXISTS pontorep_config (
  empresa_id TEXT NOT NULL,
  grupo      TEXT NOT NULL,        -- geral | web | mobile | inconsistencia
  chave      TEXT NOT NULL,
  valor      TEXT,
  label      TEXT,
  tipo       TEXT DEFAULT 'bool',  -- bool | num | opcao | texto
  ordem      INTEGER DEFAULT 0,
  PRIMARY KEY (empresa_id, chave)
)`);
try { db.exec(`ALTER TABLE pontorep_apuracao_dia ADD COLUMN inconsistencias TEXT`); } catch (e) { /* já existe */ }

// [grupo, chave, valor, label, tipo, ordem]
const CFG = [
  ['geral', 'geral.dias_retroativos_editar', '5', 'Dias retroativos permitidos para editar ponto', 'num', 1],
  ['geral', 'geral.permitir_ajuste_manual', '1', 'Permitir lançar ponto/ajuste manual (com justificativa)', 'bool', 2],
  ['geral', 'geral.limite_ajustes_colaborador', '10', 'Limite de ajustes lançados pelo colaborador', 'num', 3],
  ['geral', 'geral.permitir_lancar_atestado', '1', 'Permitir que o colaborador lance atestados/afastamentos', 'bool', 4],
  ['web', 'web.registro', 'autorizados', 'Registro via WEB (qualquer/autorizados/nao)', 'opcao', 1],
  ['web', 'web.exigir_foto', '1', 'Exigir foto ao bater ponto (web)', 'bool', 2],
  ['web', 'web.exigir_biometria', '0', 'Exigir validação biométrica (web)', 'bool', 3],
  ['web', 'web.exigir_localizacao', '0', 'Tentar obter localização (web)', 'bool', 4],
  ['mobile', 'mobile.registro', 'autorizados', 'Registro via APP (qualquer/autorizados/nao)', 'opcao', 1],
  ['mobile', 'mobile.qr_code', '1', 'Permitir QR code para registro de ponto', 'bool', 2],
  ['mobile', 'mobile.reconhecimento_facial', '1', 'Reconhecimento facial no app', 'bool', 3],
  ['mobile', 'mobile.exigir_foto', '1', 'Exigir foto ao bater ponto (app)', 'bool', 4],
  // Inconsistências (motor de alertas da apuração)
  ['inconsistencia', 'inc.jornada_max', '1', 'Jornada acima do limite diário', 'bool', 1],
  ['inconsistencia', 'inc.falta', '1', 'Falta', 'bool', 2],
  ['inconsistencia', 'inc.he_2h_dia', '1', 'Hora extra acima de 2h/dia', 'bool', 3],
  ['inconsistencia', 'inc.he_10h_semana', '1', 'Hora extra acima de 10h/semana', 'bool', 4],
  ['inconsistencia', 'inc.ponto_aberto', '1', 'Ponto em aberto (nº ímpar de batidas)', 'bool', 5],
  ['inconsistencia', 'inc.saldo_negativo', '1', 'Saldo negativo elevado no dia', 'bool', 6],
  ['inconsistencia', 'inc.saldo_negativo_min', '600', 'Limite de saldo negativo no dia (min)', 'num', 7],
  ['inconsistencia', 'inc.interjornada_11h', '1', 'Interjornada menor que 11h', 'bool', 8],
  ['inconsistencia', 'inc.dias_sem_folga', '1', 'Mais de N dias sem folga', 'bool', 9],
  ['inconsistencia', 'inc.intervalo_inferior', '1', 'Intervalo inferior ao previsto na escala', 'bool', 10],
];
const ins = db.prepare(`INSERT OR IGNORE INTO pontorep_config (empresa_id,grupo,chave,valor,label,tipo,ordem) VALUES (?,?,?,?,?,?,?)`);
CFG.forEach(c => ins.run(EMP, c[0], c[1], c[2], c[3], c[4], c[5]));

console.log('✅ migration 203: pontorep_config (', db.prepare('SELECT COUNT(*) n FROM pontorep_config').get().n, 'chaves) + coluna inconsistencias');
