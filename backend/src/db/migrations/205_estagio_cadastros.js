// 205_estagio_cadastros.js — Fundação do módulo Estágios (ciclo completo): escolas, empresas
// (registro/atuação), seguros e a FICHA do estagiário. Idempotente.
const db = require('../connection');

db.exec(`CREATE TABLE IF NOT EXISTS estagio_escola (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL, cidade TEXT, contato TEXT, telefone TEXT,
  ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS estagio_empresa (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL, cnpj TEXT,
  tipo TEXT DEFAULT 'ambos',   -- registro | atuacao | ambos
  endereco TEXT, ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS estagio_seguro (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  seguradora TEXT NOT NULL, apolice TEXT,
  vigencia_ini TEXT, vigencia_fim TEXT, valor REAL, cobertura TEXT,
  ativo INTEGER DEFAULT 1, criado_em TEXT DEFAULT (datetime('now'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS estagio_ficha (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL, cpf TEXT, nascimento TEXT,
  escola_id TEXT, curso TEXT, serie TEXT,
  empresa_registro_id TEXT, empresa_atuacao_id TEXT, loja TEXT,
  valor_bolsa REAL, vale_transporte REAL, beneficios TEXT, seguro_id TEXT,
  resp_nome TEXT, resp_cpf TEXT, resp_telefone TEXT, resp_parentesco TEXT,
  data_inicio TEXT, data_fim TEXT,
  status TEXT DEFAULT 'ativo',   -- ativo | inativo | rescindido
  origem TEXT DEFAULT 'manual',  -- manual | banco_talentos
  criado_em TEXT DEFAULT (datetime('now')), atualizado_em TEXT
)`);

console.log('✅ migration 205: estágio — escola, empresa, seguro, ficha');
