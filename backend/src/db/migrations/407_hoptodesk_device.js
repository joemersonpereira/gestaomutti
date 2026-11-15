// 407 — dispositivos (computadores) do HopToDesk, p/ a aba "Acesso remoto". Joe 2026-11-15.
// Importados do CSV exportado do dashboard (dashboard.hoptodesk.com) — reimportável quando mudar.
module.exports = function (db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS hoptodesk_device (
    empresa_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    nome TEXT,
    computer_name TEXT,
    status TEXT,
    so TEXT,
    grupo TEXT,
    ip TEXT,
    last_seen TEXT,
    sessoes INTEGER DEFAULT 0,
    atualizado_em TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (empresa_id, device_id)
  )`).run();
};

/* === Caminho técnico v2.0 (Postgres) ===
CREATE TABLE IF NOT EXISTS hoptodesk_device (
  empresa_id text NOT NULL,
  device_id text NOT NULL,
  nome text, computer_name text, status text, so text, grupo text, ip text,
  last_seen timestamptz, sessoes int DEFAULT 0,
  atualizado_em timestamptz DEFAULT now(),
  PRIMARY KEY (empresa_id, device_id)
);
*/
