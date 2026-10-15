// 113_etiqueta_temas.js — temas (layouts) das etiquetas de preço, cadastrados pelo Marketing.
const db = require('../connection');
const { v4: uuid } = require('uuid');

db.exec(`
CREATE TABLE IF NOT EXISTS etiqueta_temas (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  config TEXT NOT NULL,          -- JSON com badge, cores, slogan, texto de validade, etc.
  ativo INTEGER DEFAULT 1,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);
`);

// Seed dos temas padrão (uma vez por empresa que ainda não tiver nenhum).
const empresas = [...new Set(db.prepare('SELECT empresa_id FROM lojas').all().map(r => r.empresa_id))];
const seeds = [
  { nome: 'Ofertas 7.7', config: { badge: 'OFERTAS 7.7', slogan: 'O dia mais barato do mês chegou', corPrimaria: '#F26722', corSecundaria: '#1E8449', corPreco: '#F26722', textoValidade: 'PROMOÇÃO VÁLIDA {validade} OU ENQUANTO DURAR O ESTOQUE', mostrarDe: true, sufixo: 'cada' } },
  { nome: 'Produto do Mês', config: { badge: 'PRODUTO DO MÊS', slogan: 'Ofertas Farmácia Mutti', corPrimaria: '#1E8449', corSecundaria: '#F26722', corPreco: '#1E8449', textoValidade: 'OFERTA VÁLIDA {validade} OU ENQUANTO DURAR O ESTOQUE', mostrarDe: true, sufixo: 'cada' } },
  { nome: 'Cestão Mutti', config: { badge: 'CESTÃO MUTTI', slogan: 'Preço baixo todo dia', corPrimaria: '#C0392B', corSecundaria: '#F1C40F', corPreco: '#C0392B', textoValidade: 'VÁLIDO {validade} OU ENQUANTO DURAR O ESTOQUE', mostrarDe: true, sufixo: 'cada' } },
];
for (const emp of empresas) {
  const tem = db.prepare('SELECT count(*) n FROM etiqueta_temas WHERE empresa_id=?').get(emp).n;
  if (tem) continue;
  const ins = db.prepare('INSERT INTO etiqueta_temas (id,empresa_id,nome,config,ativo,criado_em) VALUES (?,?,?,?,1,datetime(\'now\'))');
  for (const s of seeds) ins.run(uuid(), emp, s.nome, JSON.stringify(s.config));
}
console.log('✅ migration 113: etiqueta_temas criada + temas padrão semeados');
