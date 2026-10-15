// 214_estagio_declaracao.js — modelo Declaração de Realização de Estágio. Idempotente.
const db = require('../connection');
const EMP = 'empresa-mutti-001';
db.prepare(`INSERT OR IGNORE INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))`)
  .run(EMP, 'modelo_declaracao', `DECLARAÇÃO DE REALIZAÇÃO DE ESTÁGIO

Declaro para os devidos fins que o(a) estagiário(a) {{nome}}, portador(a) do CPF {{cpf}}, realizou estágio na {{empresa_registro}}, junto ao departamento de {{atividade}}, realizando atividades de atendimento ao cliente no caixa e no salão da loja e registro de entrada de mercadorias, de segunda a sábado, tendo como supervisor do estágio {{supervisor}}.

Período: de {{data_inicio}} a {{data_fim}}.

Por ser verdade, firmo a presente.

{{cidade_data}}

_________________________________________
{{empresa_registro}}
Supervisor(a): {{supervisor}}
`);

db.prepare(`INSERT INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))
  ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`)
  .run(EMP, 'modelos_doc', JSON.stringify([
    { chave: 'modelo_contrato_18', nome: 'Contrato de Estágio (acima de 18 anos)' },
    { chave: 'modelo_contrato_16_17', nome: 'Contrato de Estágio (16 a 17 anos)' },
    { chave: 'modelo_aditivo', nome: 'Aditivo (renovação/prorrogação)' },
    { chave: 'modelo_recibo_pagamento', nome: 'Recibo de Pagamento (bolsa + VT)' },
    { chave: 'modelo_recibo_recesso', nome: 'Recibo de Recesso (recesso/férias)' },
    { chave: 'modelo_rescisao', nome: 'Rescisão do Termo de Compromisso' },
    { chave: 'modelo_relatorio', nome: 'Relatório de Estágio (atividades + avaliação)' },
    { chave: 'modelo_declaracao', nome: 'Declaração de Realização de Estágio' },
  ]));
console.log('✅ migration 214: modelo_declaracao + lista (8 modelos)');
