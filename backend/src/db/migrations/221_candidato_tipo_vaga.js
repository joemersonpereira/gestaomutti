// 221_candidato_tipo_vaga.js — Banco de Talentos serve estágio E efetivo: tipo da vaga do candidato.
const db = require('../connection');
try { db.exec(`ALTER TABLE estagio_candidato ADD COLUMN tipo_vaga TEXT DEFAULT 'estagio'`); } catch (e) { /* já existe */ }
console.log('✅ migration 221: estagio_candidato.tipo_vaga');
