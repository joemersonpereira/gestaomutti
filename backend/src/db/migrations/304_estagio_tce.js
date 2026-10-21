// 304_estagio_tce.js — adota o modelo oficial TCE (Termo de Compromisso de Estágio + Plano de
// Atividades) como contrato de estágio: inicial (modelo_contrato_18 / _16_17) e renovação
// (modelo_aditivo, com o título mudado pra deixar claro que é RENOVAÇÃO). Captura os campos novos
// que o TCE pede (RG/endereço/tel/email do estagiário, representante da escola, supervisor).
// Idempotente: roda 1x (schema_migracoes), faz UPSERT dos modelos; edições posteriores do RH persistem.
const db = require('../connection');
const EMP = 'empresa-mutti-001';

// novos campos por estagiário
for (const col of ['rg', 'endereco', 'telefone', 'email']) {
  try { db.exec(`ALTER TABLE estagio_ficha ADD COLUMN ${col} TEXT`); } catch (e) { /* já existe */ }
}
// representante da instituição de ensino (quem assina pela escola)
try { db.exec(`ALTER TABLE estagio_escola ADD COLUMN representante TEXT`); } catch (e) { /* já existe */ }

const up = db.prepare(`INSERT INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))
  ON CONFLICT(empresa_id,chave) DO UPDATE SET valor=excluded.valor, atualizado_em=excluded.atualizado_em`);
// supervisor do estágio (constante da empresa) — editável depois pelo RH
const upIgnore = db.prepare(`INSERT OR IGNORE INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))`);
upIgnore.run(EMP, 'supervisor_nome', 'JOEMERSON DA SILVA PEREIRA');
upIgnore.run(EMP, 'supervisor_cargo', 'Diretor');
upIgnore.run(EMP, 'supervisor_email', 'joemerson2016@gmail.com');

// corpo comum do TCE (cláusulas + assinaturas). {{horas_dia}}/{{horas_semana}} são fixados por idade.
const CORPO = `INSTITUIÇÃO DE ENSINO
Razão Social: {{escola}} (denominada Instituição de Ensino)
CNPJ: {{escola_cnpj}}    Endereço: {{escola_endereco}}
Representada por {{escola_representante}}, identificado(a) pela assinatura ao final deste documento.

UNIDADE CONCEDENTE
Razão Social: {{empresa_registro}} (denominada Concedente)
CNPJ: {{empresa_registro_cnpj}}
Endereço: {{empresa_registro_endereco}}
Endereço do Estágio: {{empresa_atuacao_endereco}}
Representante: {{socio_nome}}    CPF: {{socio_cpf}}
Supervisor do Estágio: {{supervisor_nome}}    Cargo: {{supervisor_cargo}}    E-mail: {{supervisor_email}}

ESTAGIÁRIO
Nome: {{nome}} (doravante denominado Estagiário)
Curso: {{curso}}    Série/Período: {{serie}}
RG: {{rg}}    CPF: {{cpf}}    Data de nascimento: {{nascimento}}
Endereço: {{endereco}}
Cel: {{telefone}}    E-mail: {{email}}

Vigência do estágio de: {{data_inicio}} até {{data_fim}}.
Horário do estágio: {{horas_dia}} horas diárias e {{horas_semana}} horas semanais, conforme escala combinada.
Apólice de Seguro / Seguradora: {{seguro}}
Bolsa Auxílio: {{valor_bolsa}}
Modalidade do Estágio: Não Obrigatório
Auxílio-transporte: {{vale_transporte}}

As partes supracitadas celebram o presente Termo de Compromisso de Estágio − TCE, que se vincula ao Convênio de Concessão de Estágio firmado com a Instituição de Ensino, nos termos da Lei 11.788/08, em conformidade com os regulamentos aplicáveis, conforme as seguintes cláusulas:

CLÁUSULA 1ª – No PLANO DE ATIVIDADES DO ESTAGIÁRIO serão registradas as atividades que serão exercidas e os conhecimentos ou habilidades que serão adquiridos pelo Estagiário (parágrafo único do art. 7º da Lei 11.788/08), incorporado neste TCE por meio da condição a seguir discriminada:
Atividades Programadas (especificar/descrever todas as atividades que serão realizadas): {{atividade}}
Parágrafo Único − Estágios com duração superior a 6 (seis) meses devem considerar atividades diferentes (novas) e/ou com maior grau de complexidade, entre um período e outro. Em caso de Termo Aditivo, as atividades indicadas devem se diferenciar das atividades já estagiadas.

CLÁUSULA 2ª − A duração do estágio tem limite de 24 meses, contado o período de eventual e futuro termo aditivo, sendo que qualquer das partes poderá denunciar o presente TCE, por escrito, com 7 (sete) dias de antecedência. O estagiário não terá vínculo empregatício com a Concedente desde que observados os requisitos do art. 3º da lei supracitada.

CLÁUSULA 3ª − O horário de estágio será definido, desde que observado o limite legal de 6 (seis) horas diárias e 30 (trinta) horas semanais, de acordo com as conveniências mútuas, ressalvadas as horas de aulas, de provas e de outros trabalhos escolares e as limitações dos meios de transporte, não conflitando com nenhum horário de atividade acadêmica.
Parágrafo Único − A jornada de estágio será reduzida em pelo menos 50% (cinquenta por cento), nos períodos comprovadamente de avaliação do estagiário.

CLÁUSULA 4ª − A Concedente designará Supervisor de Estágio, necessariamente funcionário de seu quadro de pessoal, com formação ou experiência profissional na área de conhecimento desenvolvida pelo estagiário, que deverá especificar as atividades práticas programadas e os respectivos conhecimentos decorrentes no Plano de Atividades do Estagiário.

CLÁUSULA 5ª – A Instituição de Ensino indicará Professor Orientador responsável pelo acompanhamento e avaliação das atividades do estagiário. A Empresa Concedente compromete-se a enviar à Instituição de Ensino, ao menos a cada 6 (seis) meses, Relatório das Atividades realizadas com prévio conhecimento do estagiário.

CLÁUSULA 6ª – Na hipótese de estágio obrigatório será facultativa a concessão de bolsa ou outra forma de contraprestação, e compulsória, na realização de estágio não-obrigatório, bem como do auxílio-transporte.

CLÁUSULA 7ª − O estagiário, no caso em que o estágio tiver duração igual ou superior a 1 (um) ano, fará jus a um recesso de 30 (trinta) dias, ou de forma proporcional ao tempo de estágio, a ser gozado, preferencialmente, durante suas férias escolares, sendo remunerado quando receber bolsa ou outra forma de contraprestação.

CLÁUSULA 8ª – Cabe à Empresa Concedente a contratação de seguro contra acidentes pessoais em favor do estagiário, cuja apólice deve contemplar valor de cobertura compatível com o mercado e com as atividades desenvolvidas.

CLÁUSULA 9ª – O estagiário se obriga a cumprir integralmente o Plano de Atividades do Estagiário, as normas e os regulamentos internos da Concedente e da Instituição de Ensino, respondendo por sua inobservância por perdas e danos materiais e morais, quando constatados, resultando na rescisão do presente TCE.

CLÁUSULA 10ª – O estagiário deverá informar de imediato e por escrito, à Concedente, qualquer fato que interrompa, suspenda ou cancele sua matrícula na Instituição de Ensino, bem como reconhece ser responsável por quaisquer despesas e consequências causadas pela falta desta informação.

CLÁUSULA 11ª − As partes, atentas às disposições da Lei nº 12.846/2013, declaram possuir códigos de conduta e programas de compliance que estabelecem regras para a condução e supervisão de suas atividades e para coibir a prática de infrações à referida Lei.

CLÁUSULA 12ª – As partes se comprometem a cumprir as leis de proteção de dados, especialmente a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, "LGPD"), não colocando as partes em situação de violação, seja por ação ou omissão.

CLÁUSULA 13ª – Fica eleito o foro da comarca de Entre Rios – BA para dirimir quaisquer dúvidas oriundas deste TCE que não puderem ser resolvidas diretamente pelas partes.

E, por estarem inteiramente de acordo com as cláusulas estipuladas, as partes assinam este TCE de forma eletrônica.

{{cidade_data}}


_______________________________________
CONCEDENTE — Representante da Empresa
{{socio_nome}}    CPF: {{socio_cpf}}

_______________________________________
SUPERVISOR DO ESTÁGIO
{{supervisor_nome}}    Cargo: {{supervisor_cargo}}

_______________________________________
INSTITUIÇÃO DE ENSINO
{{escola}}

_______________________________________
ESTAGIÁRIO
{{nome}}    CPF: {{cpf}}
{{assinatura_responsavel}}`;

const TITULO_INICIAL = `TCE − TERMO DE COMPROMISSO DE ESTÁGIO e Plano de Atividades do Estagiário\n\n`;
const TITULO_RENOV = `TERMO ADITIVO DE RENOVAÇÃO AO TCE − TERMO DE COMPROMISSO DE ESTÁGIO\n(Renovação / prorrogação do estágio — Plano de Atividades do novo período)\n\n`;

const horas = (txt, dia, sem) => txt.replace('{{horas_dia}}', dia).replace('{{horas_semana}}', sem);

up.run(EMP, 'modelo_contrato_18', TITULO_INICIAL + horas(CORPO, '04 (quatro)', '20 (vinte)'));
up.run(EMP, 'modelo_contrato_16_17', TITULO_INICIAL + horas(CORPO, '05 (cinco)', '30 (trinta)'));
up.run(EMP, 'modelo_aditivo', TITULO_RENOV + horas(CORPO, '05 (cinco)', '30 (trinta)'));

// Termo de ciência/recebimento do Guia do Colaborador — vai junto do contrato pro estagiário assinar.
const CIENCIA_GUIA = `TERMO DE CIÊNCIA E RECEBIMENTO DO GUIA DO COLABORADOR

Eu, {{nome}}, inscrito(a) no CPF sob o nº {{cpf}}, na condição de estagiário(a) da {{empresa_registro}}, DECLARO que recebi, li e compreendi o Guia do Colaborador do Grupo Mutti — que reúne o Código de Conduta e o Regimento Interno — e me comprometo a cumprir integralmente as normas, políticas e diretrizes nele descritas durante todo o período de estágio.

{{cidade_data}}


_______________________________________
ESTAGIÁRIO
{{nome}}    CPF: {{cpf}}
{{assinatura_responsavel}}`;
up.run(EMP, 'modelo_ciencia_guia', CIENCIA_GUIA);

// lista de documentos do seletor (inclui o novo Termo de Ciência do Guia)
up.run(EMP, 'modelos_doc', JSON.stringify([
  { chave: 'modelo_contrato_18', nome: 'Contrato de Estágio — TCE (acima de 18 anos)' },
  { chave: 'modelo_contrato_16_17', nome: 'Contrato de Estágio — TCE (16 a 17 anos)' },
  { chave: 'modelo_aditivo', nome: 'Renovação — Termo Aditivo ao TCE' },
  { chave: 'modelo_ciencia_guia', nome: 'Ciência do Guia do Colaborador' },
  { chave: 'modelo_recibo_pagamento', nome: 'Recibo de Pagamento (bolsa + VT)' },
  { chave: 'modelo_recibo_recesso', nome: 'Recibo de Recesso (recesso/férias)' },
  { chave: 'modelo_rescisao', nome: 'Rescisão do Termo de Compromisso' },
  { chave: 'modelo_relatorio', nome: 'Relatório de Estágio (atividades + avaliação)' },
  { chave: 'modelo_declaracao', nome: 'Declaração de Realização de Estágio' },
]));

console.log('✅ migration 304: estágio TCE (contrato inicial + renovação + ciência do guia) + campos do estagiário/escola/supervisor');
