// 311_estagio_aviso_ferias.js — novo documento "Aviso de Férias / Recesso": comunicado informando
// que o estagiário vai usufruir do recesso (art. 13 da Lei 11.788/2008), além do recibo de recebimento.
// Seedado em estagio_config e adicionado à lista modelos_doc do seletor. Idempotente (UPSERT por chave).
const db = require('../connection');
const EMP = 'empresa-mutti-001';
const up = db.prepare(`INSERT INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))
  ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`);

const AVISO_FERIAS = `AVISO DE FÉRIAS / RECESSO DE ESTÁGIO
(Comunicado — art. 13 da Lei nº 11.788/2008)

CONCEDENTE: {{empresa_registro}}    CNPJ: {{empresa_registro_cnpj}}
ESTAGIÁRIO(A): {{nome}}    CPF: {{cpf}}

Prezado(a) {{nome}},

Comunicamos que, nos termos do art. 13 da Lei nº 11.788/2008, fica concedido a você o período de recesso remunerado de {{ferias_dias}} dias, a ser usufruído de {{ferias_inicio}} a {{ferias_fim}}, preferencialmente durante as férias escolares.

Durante o recesso, a bolsa-auxílio será mantida integralmente. Pedimos a gentileza de dar ciência a este comunicado por meio da assinatura abaixo.

{{cidade_data}}


_______________________________________
CONCEDENTE — {{empresa_registro}}
{{socio_nome}}

_______________________________________
ESTAGIÁRIO(A) — ciência
{{nome}}    CPF: {{cpf}}
{{assinatura_responsavel}}`;
up.run(EMP, 'modelo_aviso_ferias', AVISO_FERIAS);

// Reescreve a lista do seletor incluindo o Aviso de Férias (logo após o recibo de recesso).
up.run(EMP, 'modelos_doc', JSON.stringify([
  { chave: 'modelo_contrato_18', nome: 'Contrato de Estágio — TCE (acima de 18 anos)' },
  { chave: 'modelo_contrato_16_17', nome: 'Contrato de Estágio — TCE (16 a 17 anos)' },
  { chave: 'modelo_aditivo', nome: 'Renovação — Termo Aditivo ao TCE' },
  { chave: 'modelo_recibo_pagamento', nome: 'Recibo de Pagamento (bolsa + VT)' },
  { chave: 'modelo_aviso_ferias', nome: 'Aviso de Férias / Recesso (comunicado)' },
  { chave: 'modelo_recibo_recesso', nome: 'Recibo de Recesso (recesso/férias)' },
  { chave: 'modelo_rescisao', nome: 'Rescisão do Termo de Compromisso' },
  { chave: 'modelo_relatorio', nome: 'Relatório de Estágio (atividades + avaliação)' },
  { chave: 'modelo_declaracao', nome: 'Declaração de Realização de Estágio' },
]));

console.log('✅ migration 311: documento Aviso de Férias / Recesso + adicionado ao seletor');
