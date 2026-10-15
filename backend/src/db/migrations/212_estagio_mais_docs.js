// 212_estagio_mais_docs.js — mais modelos de documento (aditivo, recibos, rescisão) + atualiza a lista. Idempotente.
const db = require('../connection');
const EMP = 'empresa-mutti-001';
const up = db.prepare(`INSERT OR IGNORE INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))`);

up.run(EMP, 'modelo_aditivo', `ADITIVO DO TERMO DE COMPROMISSO DE ESTÁGIO
(Lei nº 11.788/2008, art. 13)

Empresa concedente: {{empresa_registro}}
CNPJ: {{empresa_registro_cnpj}}    Endereço: {{empresa_registro_endereco}}

Instituição de Ensino (Interveniente): {{escola}}
CNPJ: {{escola_cnpj}}    Endereço: {{escola_endereco}}

Estagiário(a): {{nome}}    Curso: {{curso}}    CPF: {{cpf}}

Pelo presente Termo Aditivo, as partes acordam a PRORROGAÇÃO/ALTERAÇÃO do estágio, cujo término anterior estava previsto para {{data_fim}}, passando a vigorar até a nova data abaixo.
Nova data de término: {{data_fim_novo}}

O Estagiário permanece segurado contra acidentes pessoais pela apólice: {{seguro}}.
Permanecem inalteradas e revalidadas as demais disposições do Termo de Compromisso.
Fica eleito o Foro de Entre Rios - BA.

{{cidade_data}}

_____________________________________   {{empresa_registro}} — EMPRESA CONCEDENTE
_____________________________________   {{nome}} — ESTAGIÁRIO(A)
_____________________________________   {{resp_nome}} — RESPONSÁVEL
`);

up.run(EMP, 'modelo_recibo_pagamento', `RECIBO DE PAGAMENTO DE BOLSA-ESTÁGIO E AUXÍLIO-TRANSPORTE
(Lei nº 11.788/2008, art. 12)

CONCEDENTE: {{empresa_registro}}    CNPJ: {{empresa_registro_cnpj}}
ESTAGIÁRIO(A): {{nome}}    CPF: {{cpf}}

Declaro, para todos os fins, ter recebido nesta data a importância de {{valor_bolsa}} referente à bolsa-estágio do mês de {{competencia}}, incluindo o auxílio-transporte de {{vale_transporte}}, nos termos do art. 12 da Lei do Estágio.

MEMÓRIA DE CÁLCULO
Valor da bolsa: {{valor_bolsa}}
Auxílio-transporte: {{vale_transporte}}

{{cidade_data}}

_____________________________________
{{nome}} — Estagiário(a)
`);

up.run(EMP, 'modelo_recibo_recesso', `RECIBO DE RECESSO DE ESTÁGIO
(Lei nº 11.788/2008, art. 13)

Concedente: {{empresa_registro}}
Estagiário(a): {{nome}}    CPF: {{cpf}}
Data de início do estágio: {{data_inicio}}
Período do recesso: 30 (trinta) dias.
Valor da bolsa: {{valor_bolsa}}.

Recebi a quantia referente ao recesso remunerado do estágio (art. 13, §2º da Lei 11.788/2008), relativo ao período de contrato acima.

{{cidade_data}}

_____________________________________
{{nome}} — Estagiário(a)
`);

up.run(EMP, 'modelo_rescisao', `RESCISÃO DO TERMO DE COMPROMISSO DE ESTÁGIO
(Lei nº 11.788/2008, art. 13)

Empresa Concedente: {{empresa_registro}}    CNPJ: {{empresa_registro_cnpj}}
Endereço: {{empresa_registro_endereco}}

Estagiário(a): {{nome}}    Curso: {{curso}}    CPF: {{cpf}}

A partir de {{data_rescisao}}, encerra-se o Termo de Compromisso de Estágio firmado para o período de {{data_inicio}} a {{data_fim}}.

Motivo(s) do encerramento:
( ) Solicitado pelo estagiário   ( ) Conclusão de curso   ( ) Trancamento/cancelamento de matrícula
( ) Efetivado pela concedente    ( ) Desempenho/avaliação   ( ) Descumprimento do termo   ( ) Outros

Observações: {{obs_rescisao}}

Fica eleito o Foro de Entre Rios - BA. As partes assinam em 3 (três) vias, na presença de 2 (duas) testemunhas.

{{cidade_data}}

_____________________________________   {{empresa_registro}} — EMPRESA CONCEDENTE
_____________________________________   {{nome}} — ESTAGIÁRIO(A)
_____________________________________   {{resp_nome}} — RESPONSÁVEL
`);

// atualiza a lista de modelos (substitui)
db.prepare(`INSERT INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))
  ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`)
  .run(EMP, 'modelos_doc', JSON.stringify([
    { chave: 'modelo_contrato_18', nome: 'Contrato de Estágio (acima de 18 anos)' },
    { chave: 'modelo_contrato_16_17', nome: 'Contrato de Estágio (16 a 17 anos)' },
    { chave: 'modelo_aditivo', nome: 'Aditivo (renovação/prorrogação)' },
    { chave: 'modelo_recibo_pagamento', nome: 'Recibo de Pagamento (bolsa + VT)' },
    { chave: 'modelo_recibo_recesso', nome: 'Recibo de Recesso (recesso/férias)' },
    { chave: 'modelo_rescisao', nome: 'Rescisão do Termo de Compromisso' },
  ]));

console.log('✅ migration 212: aditivo, recibo pagamento, recibo recesso, rescisão + lista de modelos');
