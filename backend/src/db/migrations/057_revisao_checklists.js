// 057 — atualiza seções do checklist do gerente e indicadores do farmacêutico (revisão de conteúdo)
const db = require('../connection');
const { v4: uuidv4 } = require('uuid');
const { SECOES_GERENTE } = require('../../lib/secoesGerenteSeed');
console.log('▶ Migração 057 — revisão de conteúdo dos checklists');

// Re-semeia as seções/itens do gerente para TODAS as empresas (substitui o conteúdo antigo)
const empresas = db.prepare(`SELECT id FROM empresas`).all();
const insS = db.prepare(`INSERT INTO gerente_secoes (id,empresa_id,nome,peso,ordem,ativo) VALUES (?,?,?,?,?,1)`);
const insI = db.prepare(`INSERT INTO gerente_itens (id,empresa_id,secao_id,nome,ordem,ativo) VALUES (?,?,?,?,?,1)`);
empresas.forEach(e => {
  const secs = db.prepare(`SELECT id FROM gerente_secoes WHERE empresa_id=?`).all(e.id);
  secs.forEach(s => db.prepare(`DELETE FROM gerente_itens WHERE secao_id=?`).run(s.id));
  db.prepare(`DELETE FROM gerente_secoes WHERE empresa_id=?`).run(e.id);
  SECOES_GERENTE.forEach((sec, si) => { const sid = uuidv4(); insS.run(sid, e.id, sec.secao, sec.peso, si); sec.itens.forEach((it, ii) => insI.run(uuidv4(), e.id, sid, it, ii)); });
});
console.log(`  seções atualizadas em ${empresas.length} empresa(s)`);

// Atualiza indicadores do farmacêutico (substitui pelos novos)
const FARMA = [
  { indicador: 'atendimento', label: 'Qualidade do atendimento', peso: 25, ordem: 1 },
  { indicador: 'prescricao', label: 'Conferência de prescrição', peso: 20, ordem: 2 },
  { indicador: 'sngpc', label: 'SNGPC em dia', peso: 20, ordem: 3 },
  { indicador: 'farmacia_popular', label: 'Farmácia Popular em dia', peso: 15, ordem: 4 },
  { indicador: 'sala_aplicacao', label: 'Organização Sala de Aplicação', peso: 20, ordem: 5 },
];
try {
  const insCfg = db.prepare(`INSERT INTO config_indicadores (id,empresa_id,funcao_id,indicador,label,peso,ordem,ativo) VALUES (?,?,?,?,?,?,?,1)`);
  empresas.forEach(e => {
    db.prepare(`DELETE FROM config_indicadores WHERE empresa_id=? AND funcao_id='func-farmaceutico'`).run(e.id);
    FARMA.forEach(i => insCfg.run(uuidv4(), e.id, 'func-farmaceutico', i.indicador, i.label, i.peso, i.ordem));
  });
  console.log('  indicadores do farmacêutico atualizados');
} catch (err) { console.log('  (config_indicadores ainda não existe — ok no setup novo)'); }

// Atualiza o checklist de limpeza (diário/mensal) e tenta criar o semanal
const LIMP = {
  diario: [['Varrer', 10], ['Passar pano', 10], ['Lavagem sanitários', 10], ['Esvaziar lixeiras', 10], ['Limpeza de espelhos', 10], ['Papel higiênico / toalha', 10], ['Sabonete líquido', 10], ['Limpeza copa', 10], ['Sala de aplicação', 10], ['Administrativo', 10]],
  mensal: [['Limpeza embaixo das prateleiras', 20], ['Ponta de gôndolas de vidro', 20], ['Limpeza de monitores', 20], ['Limpeza de balcões', 20], ['Lavar tapetes', 20]],
  semanal: [['Letreiros de sanca', 25], ['Acrílico da farmacinha', 25], ['Depósito', 25], ['Escada', 25]],
};
try {
  const insItem = db.prepare(`INSERT INTO checklist_itens (id,modelo_id,texto,peso,ordem) VALUES (?,?,?,?,?)`);
  empresas.forEach(e => {
    Object.entries(LIMP).forEach(([periodo, itens]) => {
      let m = db.prepare(`SELECT id FROM checklist_modelos WHERE empresa_id=? AND categoria='limpeza' AND periodo=?`).get(e.id, periodo);
      if (!m) {
        try {
          const mid = uuidv4();
          db.prepare(`INSERT INTO checklist_modelos (id,empresa_id,nome,periodo,categoria,funcao_id,ativo) VALUES (?,?,?,?,?, 'func-limpeza',1)`)
            .run(mid, e.id, `Checklist de Limpeza ${periodo[0].toUpperCase() + periodo.slice(1)}`, periodo, 'limpeza');
          m = { id: mid };
        } catch (err) { m = null; /* CHECK antigo pode bloquear 'semanal' — requer npm run setup */ }
      }
      if (m) {
        db.prepare(`DELETE FROM checklist_itens WHERE modelo_id=?`).run(m.id);
        itens.forEach(([texto, peso], i) => insItem.run(uuidv4(), m.id, texto, peso, i + 1));
      }
    });
  });
  console.log('  checklist de limpeza atualizado');
} catch (err) { console.log('  (checklist de limpeza — pulado:', err.message, ')'); }

console.log('✓ Migração 057 concluída');