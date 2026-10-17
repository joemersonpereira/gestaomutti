// 255_tmkt_plano.js — PLANOS COMERCIAIS (Joe 2026-10-16). Planos das ações de maior relevância do
// ano (Black Friday, Verão, Mutti nos Bairros, Arraiá…), montados pelo gerenciador num PADRÃO tipo
// os "planos comerciais" da Globo (página one-page): chamada + contexto + provas + resumo do projeto
// + como funciona (cota) + formatos inclusos + investimento. Aparecem numa aba do portal do fornecedor.
// Idempotente.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS tmkt_plano (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  tema TEXT,                 -- black | verao | bairros | junino | outro (define o visual da capa)
  ano INTEGER,
  chamada TEXT,              -- headline curta
  contexto TEXT,             -- parágrafo de oportunidade
  provas_json TEXT,          -- [{n:'4 dias', l:'de pico'}] números/provas
  mercado TEXT,              -- "Rede Grupo Mutti"
  periodo TEXT,              -- "Novembro de 2027"
  pracas TEXT,               -- "8 lojas · 4 cidades"
  frequencia TEXT,           -- "Campanha de 4 dias + esquenta"
  formato TEXT,              -- "Multiformato (loja + digital)"
  cota_tipo TEXT,            -- Exclusiva | Compartilhada
  cota_qtd INTEGER,          -- quantidade de cotas
  cota_prazo TEXT,           -- "Fechamento até 30/09/2027 (2 meses antes)"
  formatos_json TEXT,        -- ["Filipeta Black por perfil", "Vitrine nas 8 lojas", ...]
  investimento REAL,         -- preço da cota
  investimento_obs TEXT,
  observacoes TEXT,
  capa_foto TEXT,            -- base64 opcional (arte da ação); senão usa gradiente do tema
  destaque INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'publicado',   -- rascunho | publicado
  ordem INTEGER DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS ix_tmkt_plano_emp ON tmkt_plano (empresa_id, status, ordem)`);
console.log('✅ migration 255: tmkt_plano (planos comerciais das ações do ano)');
