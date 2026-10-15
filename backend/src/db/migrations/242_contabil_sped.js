// 242_contabil_sped.js — repositório dos arquivos SPED/EFD na Contabilidade.
// O Alpha 7 GERA o arquivo (Fiscal/Contribuições); a equipe fiscal sobe aqui por competência/loja/etapa
// e o usuário da contabilidade BAIXA direto — some o "enviar pra contabilidade" por fora.
// O ciclo tem versões (envio dia 01 → retorno → corrigido dia 10), por isso é uma linha por arquivo.
// Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS contabil_sped (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id TEXT NOT NULL,
  loja_id TEXT,                         -- loja do app; NULL = consolidado/grupo
  competencia TEXT NOT NULL,            -- 'YYYY-MM'
  tipo TEXT NOT NULL DEFAULT 'fiscal',  -- 'fiscal' | 'contribuicoes' | 'ecd' | 'outro'
  etapa TEXT NOT NULL DEFAULT 'envio',  -- 'envio' | 'retorno' | 'corrigido' | 'final'
  nome TEXT,
  tipo_mime TEXT,
  dados TEXT,                           -- base64 do .txt gerado no Alpha
  tamanho INTEGER,
  obs TEXT,
  usuario_id TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_contabil_sped_comp ON contabil_sped (empresa_id, competencia)`);
console.log('✅ migration 242: contabil_sped');
