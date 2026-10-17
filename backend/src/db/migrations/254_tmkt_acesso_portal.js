// 254_tmkt_acesso_portal.js — PORTA DE ENTRADA do portal do fornecedor (Joe 2026-10-16).
// Antes de ver o catálogo o visitante se identifica (CNPJ da empresa + CPF da pessoa). Só entra se:
//   (a) o CNPJ estiver CADASTRADO — como fornecedor no Alpha OU liberado na mão (tmkt_acesso_liberado), E
//   (b) o CPF da pessoa EXISTIR no Alpha (pessoa.cpf).
// Faltou qualquer um → bloqueia e grava em tmkt_interesse (lista de interessados p/ a empresa liberar depois).
// Documentos sempre gravados como SÓ DÍGITOS (CNPJ 14, CPF 11), igual ao Alpha. Idempotente.
const db = require('../connection');

// allowlist que a EMPRESA controla no painel interno (libera CNPJ por CNPJ)
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_acesso_liberado (
  empresa_id TEXT NOT NULL,
  documento  TEXT NOT NULL,          -- CNPJ só dígitos (14)
  nome       TEXT,                   -- razão social / apelido
  observacao TEXT,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_por TEXT,
  criado_em  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, documento)
)`);

// lista de INTERESSADOS: quem tentou entrar e foi bloqueado (p/ a empresa avaliar e liberar)
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_interesse (
  id         TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  cnpj       TEXT,                   -- só dígitos
  cpf        TEXT,                   -- só dígitos
  nome       TEXT,
  telefone   TEXT,
  email      TEXT,
  motivo     TEXT,                   -- sem_cnpj | sem_cpf | ambos
  liberado   INTEGER NOT NULL DEFAULT 0,
  criado_em  TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_tmkt_interesse_emp ON tmkt_interesse (empresa_id, liberado, criado_em)`);

// sessões de acesso emitidas quando a identificação passa (token guardado no sessionStorage do navegador)
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_acesso_sessao (
  token      TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  cnpj       TEXT,
  cpf        TEXT,
  nome       TEXT,
  via        TEXT,                   -- alpha | liberado
  criado_em  TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_tmkt_acesso_sessao_emp ON tmkt_acesso_sessao (empresa_id, cnpj)`);

console.log('✅ migration 254: tmkt_acesso_liberado + tmkt_interesse + tmkt_acesso_sessao (porta de entrada do portal)');
