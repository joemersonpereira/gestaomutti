// 159 — Fonte do indicador individual: manual (padrão) ou automática (produtividade
// de tarefas do próprio colaborador — universal p/ escritório, sem depender do ERP).
const db = require('../connection');
try { db.exec("ALTER TABLE colab_indicadores ADD COLUMN fonte TEXT DEFAULT 'manual'"); } catch { /* já existe */ }
console.log('✅ migration 159: colab_indicadores.fonte (manual | automática por tarefas)');
