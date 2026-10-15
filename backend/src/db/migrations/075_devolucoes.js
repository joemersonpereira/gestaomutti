// 075 — Módulo de Devoluções de mercadorias (Suporte).
// Fluxo: Novo → Andamento → Análise Fornecedor → Aguardando Solicitante → Coleta → Concluído
// (Cancelado a qualquer momento). Cadastro feito pelo conferente; escritório/suporte acompanha.
const db = require('../connection');
console.log('▶ Migração 075 — módulo de Devoluções');

db.exec(`
  CREATE TABLE IF NOT EXISTS devolucoes (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    loja_id TEXT NOT NULL,
    codigo TEXT,                       -- RET-2026-0712
    fornecedor_nome TEXT,
    fornecedor_cnpj TEXT,
    nf_numero TEXT,                    -- NF de origem (compra)
    tipo TEXT DEFAULT 'total',         -- 'parcial' | 'total'
    motivo TEXT,
    observacoes_loja TEXT,
    status TEXT NOT NULL DEFAULT 'novo',
    -- 'novo'|'andamento'|'analise_fornecedor'|'aguardando_solicitante'|'coleta'|'concluido'|'cancelado'
    status_desde TEXT DEFAULT (datetime('now')),  -- p/ SLA "tempo no status"
    prazo_horas INTEGER,               -- SLA opcional do status atual
    conferente_id TEXT,                -- quem abriu (responsável na loja)
    valor_total REAL DEFAULT 0,
    pago INTEGER DEFAULT 0,            -- reembolso confirmado pelo financeiro
    reembolso_momento TEXT,            -- 'antes' | 'depois' da coleta

    trade_id TEXT,                     -- id no TradeMkt (quando vier da integração)
    criado_por TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    atualizado_em TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_devol_loja ON devolucoes(loja_id, status);
  CREATE INDEX IF NOT EXISTS idx_devol_trade ON devolucoes(trade_id);

  CREATE TABLE IF NOT EXISTS devolucao_itens (
    id TEXT PRIMARY KEY,
    devolucao_id TEXT NOT NULL,
    ean TEXT,
    codigo_produto TEXT,
    descricao TEXT,
    quantidade_nf REAL DEFAULT 0,      -- quantidade original na NF (referência)
    quantidade REAL DEFAULT 0,         -- quantidade DEVOLVIDA (informada pelo conferente)
    valor_unit REAL DEFAULT 0,         -- custo unitário da NF
    valor_total REAL DEFAULT 0         -- quantidade devolvida × custo (R$ parado)
  );
  CREATE INDEX IF NOT EXISTS idx_devol_item ON devolucao_itens(devolucao_id);

  -- Dados que o fornecedor informa + a NF de devolução emitida + a coleta
  CREATE TABLE IF NOT EXISTS devolucao_fornecedor (
    devolucao_id TEXT PRIMARY KEY,
    status_fornecedor TEXT,
    protocolo TEXT,
    data_resposta TEXT,
    observacoes_escritorio TEXT,
    nf_devolucao_numero TEXT,
    nf_devolucao_serie TEXT,
    nf_devolucao_emissao TEXT,
    previsao_coleta TEXT,
    url_nf_devolucao TEXT,
    url_ordem_coleta TEXT,
    url_ordem_assinada TEXT,
    data_coleta TEXT,
    url_comprovante_coleta TEXT
  );

  CREATE TABLE IF NOT EXISTS devolucao_reembolsos (
    id TEXT PRIMARY KEY,
    devolucao_id TEXT NOT NULL,
    forma_pagamento TEXT,
    data TEXT,
    valor REAL DEFAULT 0,
    credito REAL DEFAULT 0,
    nota_fiscal TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_devol_reemb ON devolucao_reembolsos(devolucao_id);

  -- Histórico do fluxo (cada mudança de status / ação)
  CREATE TABLE IF NOT EXISTS devolucao_historico (
    id TEXT PRIMARY KEY,
    devolucao_id TEXT NOT NULL,
    status TEXT,
    de_status TEXT,
    texto TEXT,
    autor_id TEXT,
    autor_nome TEXT,
    criado_em TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_devol_hist ON devolucao_historico(devolucao_id, criado_em);

  -- Motivos de devolução (cadastro padrão → vira indicador por motivo)
  CREATE TABLE IF NOT EXISTS devolucao_motivos (
    id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, nome TEXT NOT NULL,
    ativo INTEGER DEFAULT 1, ordem INTEGER DEFAULT 0, criado_em TEXT DEFAULT (datetime('now'))
  );
`);
console.log('✓ Migração 075 concluída.');
