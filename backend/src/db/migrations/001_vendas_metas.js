// 001_vendas_metas.js — Migração do Módulo 1 (Vendas e Metas)
// Não destrói dados: usa CREATE TABLE IF NOT EXISTS / ALTER TABLE seguro.
// Rode com: node src/db/migrations/001_vendas_metas.js
const db = require('../connection');

console.log('▶ Migração 001 — Vendas e Metas');

db.exec(`
  -- Avaliação dos indicadores comerciais do vendedor (mensal)
  -- Escala: bom = 100% do peso | regular = 50% | ruim = 0%
  CREATE TABLE IF NOT EXISTS indicadores_vendedor (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    loja_id TEXT NOT NULL,
    colaborador_id TEXT NOT NULL,
    mes INTEGER NOT NULL,
    ano INTEGER NOT NULL,
    indicador TEXT NOT NULL,                     -- identificacao, cadastro, pbm, vitaminas, campanha, generico
    avaliacao TEXT NOT NULL CHECK(avaliacao IN ('bom','regular','ruim')),
    valor_num REAL DEFAULT 0,                    -- p/ vitaminas: nº de unidades vendidas
    lancado_por_id TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    atualizado_em TEXT DEFAULT (datetime('now')),
    UNIQUE(colaborador_id, mes, ano, indicador),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
  );

  -- Configuração dos pesos dos indicadores por empresa/função (somam 100pts)
  -- Permite que o módulo de Configurações (SaaS) ajuste no futuro.
  CREATE TABLE IF NOT EXISTS config_indicadores (
    id TEXT PRIMARY KEY,
    empresa_id TEXT NOT NULL,
    funcao_id TEXT NOT NULL,
    indicador TEXT NOT NULL,
    label TEXT NOT NULL,
    peso INTEGER NOT NULL,
    ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    UNIQUE(empresa_id, funcao_id, indicador),
    FOREIGN KEY (empresa_id) REFERENCES empresas(id)
  );

  CREATE INDEX IF NOT EXISTS idx_vendas_loja_data ON vendas(loja_id, data_venda);
  CREATE INDEX IF NOT EXISTS idx_vendas_colab ON vendas(colaborador_id);
  CREATE INDEX IF NOT EXISTS idx_metas_loja_periodo ON metas(loja_id, mes, ano);
  CREATE INDEX IF NOT EXISTS idx_indvend_periodo ON indicadores_vendedor(loja_id, mes, ano);
`);

// Semeia os pesos padrão dos indicadores do Vendedor (uma vez por empresa)
const empresas = db.prepare('SELECT id FROM empresas').all();
const INDICADORES_VENDEDOR = [
  { indicador: 'identificacao', label: 'Identificação do cliente', peso: 20, ordem: 1 },
  { indicador: 'cadastro',      label: 'Pdv+',        peso: 15, ordem: 2 },
  { indicador: 'pbm',           label: 'PBM',                      peso: 20, ordem: 3 },
  { indicador: 'vitaminas',     label: 'Vitaminas',                peso: 20, ordem: 4 },
  { indicador: 'campanha',      label: 'Campanhas',                peso: 15, ordem: 5 },
  { indicador: 'generico',      label: 'Genérico / Similar',       peso: 10, ordem: 6 },
];
// Confere a regra: pesos somam 100
const soma = INDICADORES_VENDEDOR.reduce((a, i) => a + i.peso, 0);
if (soma !== 100) throw new Error(`Pesos do vendedor somam ${soma}, deveriam somar 100.`);

const { v4: uuidv4 } = require('uuid');
const insCfg = db.prepare(`
  INSERT OR IGNORE INTO config_indicadores (id,empresa_id,funcao_id,indicador,label,peso,ordem,ativo)
  VALUES (?,?,?,?,?,?,?,1)
`);
let seeded = 0;
for (const emp of empresas) {
  for (const ind of INDICADORES_VENDEDOR) {
    const info = insCfg.run(uuidv4(), emp.id, 'func-vendedor', ind.indicador, ind.label, ind.peso, ind.ordem);
    seeded += info.changes;
  }
}

console.log(`✓ Tabelas indicadores_vendedor e config_indicadores prontas.`);
console.log(`✓ ${seeded} pesos de indicadores semeados (empresas: ${empresas.length}).`);
console.log('✅ Migração 001 concluída.');
