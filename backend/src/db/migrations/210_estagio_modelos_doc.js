// 210_estagio_modelos_doc.js — modelos REAIS de contrato (16-17 e +18) com placeholders,
// + CNPJ/endereço na escola (interveniente do contrato). Idempotente.
const db = require('../connection');
const EMP = 'empresa-mutti-001';
for (const col of ['cnpj', 'endereco']) { try { db.exec(`ALTER TABLE estagio_escola ADD COLUMN ${col} TEXT`); } catch (e) { /* já existe */ } }

const CLAUSULAS = `CLÁUSULA PRIMEIRA. DO OBJETO.
O presente contrato cuida de concessão de estágio no setor administrativo e comercial da empresa, na atividade de {{atividade}}, conforme plano de estágio em anexo.
Parágrafo Primeiro. Conforme previsão legal, o presente compromisso não gera vínculo de emprego.
Parágrafo Segundo. A EMPRESA CONCEDENTE designa o supervisor do programa de estágio.
Parágrafo Terceiro. O estágio ocorrerá na unidade {{loja}}.

CLÁUSULA SEGUNDA. DO PRAZO.
O estágio terá início em {{data_inicio}}, terminando em {{data_fim}}.
Parágrafo Primeiro. O prazo poderá ser prorrogado por instrumento complementar (aditivo), desde que não ultrapasse 02 (dois) anos.
Parágrafo Segundo. A rescisão do Convênio não acarreta, obrigatoriamente, a rescisão deste instrumento.

CLÁUSULA TERCEIRA. DAS OBRIGAÇÕES DA EMPRESA CONCEDENTE
A EMPRESA CONCEDENTE se compromete a proporcionar atividade de aprendizagem compatível com o curso; efetuar o pagamento mensal de bolsa e auxílio-transporte (art. 12 da Lei 11.788/08); contratar seguro contra acidentes pessoais; observar a legislação de saúde e segurança; conceder recesso remunerado de 30 dias quando o estágio for igual ou superior a 1 ano (proporcional se inferior); e enviar à INTERVENIENTE relatório de atividades.

CLÁUSULA QUARTA. DAS OBRIGAÇÕES DO ESTAGIÁRIO
O ESTAGIÁRIO se compromete a cumprir a programação do estágio e o Termo de Compromisso; cumprir as normas internas e a ética profissional; informar de imediato qualquer alteração de matrícula; apresentar documentos de regularidade escolar; manter dados cadastrais atualizados; preencher o relatório de acompanhamento; e usar os EPIs quando for o caso.

CLÁUSULA QUINTA. DAS OBRIGAÇÕES DA INSTITUIÇÃO DE ENSINO
Avaliar as instalações; indicar professor orientador; exigir relatório periódico; zelar pelo cumprimento do termo; elaborar instrumentos de avaliação; e comunicar as datas de avaliações escolares.

CLÁUSULA SEXTA. DO HORÁRIO DO ESTÁGIO
O horário será compatível com as atividades escolares, de {{horas_dia}} horas diárias, não ultrapassando {{horas_semana}} horas semanais. Em período de provas, a jornada é reduzida pela metade.

CLÁUSULA SÉTIMA. DA REMUNERAÇÃO E BENEFÍCIOS
A EMPRESA CONCEDENTE pagará mensalmente {{valor_bolsa}} a título de bolsa-estágio, além de auxílio-transporte de {{vale_transporte}}. Benefícios: {{beneficios}}.
Parágrafo Primeiro. Faltas injustificadas serão descontadas do valor mensal da bolsa.
Parágrafo Segundo. A EMPRESA CONCEDENTE contratou seguro em favor do ESTAGIÁRIO ({{seguro}}).

CLÁUSULA OITAVA. DA LGPD
O ESTAGIÁRIO tem ciência de que a EMPRESA CONCEDENTE tratará seus dados pessoais nos termos da Lei nº 13.709/2018, para a fiel execução deste contrato.

CLÁUSULA NONA. DO SIGILO
O ESTAGIÁRIO obriga-se a manter sigilo sobre toda informação a que tiver acesso durante o estágio.

CLÁUSULA DÉCIMA. DA RESCISÃO
O descumprimento das cláusulas faculta à EMPRESA CONCEDENTE considerar o termo rescindido mediante notificação. São motivos de término: conclusão/abandono/trancamento do curso, resultados insatisfatórios, comportamento indesejável ou descumprimento da Lei 11.788/08.

CLÁUSULA DÉCIMA PRIMEIRA. DO FORO
Fica eleito o Foro de Entre Rios - BA para dirimir quaisquer questões deste contrato.

E, por estarem de acordo, as partes assinam em 03 (três) vias, na presença de 2 (duas) testemunhas.

{{cidade_data}}

_____________________________________
{{empresa_registro}} — EMPRESA CONCEDENTE

_____________________________________
{{nome}} — ESTAGIÁRIO
`;

const CABEC_18 = `CONTRATO DE ESTÁGIO

Pelo presente instrumento, de um lado, na qualidade de EMPRESA CONCEDENTE, {{empresa_registro}}, inscrita no CNPJ sob o nº {{empresa_registro_cnpj}}, com endereço na {{empresa_registro_endereco}}, e, do outro lado, {{nome}}, portador(a) do CPF nº {{cpf}}, matriculado(a) no {{serie}} do curso {{curso}}, e, como INTERVENIENTE a {{escola}}, inscrita no CNPJ sob o nº {{escola_cnpj}}, com endereço {{escola_endereco}}, que se vincula ao convênio para a realização de Estágio não obrigatório, nos termos da Lei nº 11.788/08, de acordo com as normas seguintes:

`;
const CABEC_16 = `TERMO DE COMPROMISSO DE ESTÁGIO (16 a 17 anos)

Pelo presente instrumento, de um lado, na qualidade de EMPRESA CONCEDENTE, {{empresa_registro}}, inscrita no CNPJ sob o nº {{empresa_registro_cnpj}}, com endereço na {{empresa_registro_endereco}}, e, do outro lado, {{nome}}, inscrito(a) no CPF sob o nº {{cpf}}, neste ato representado(a) pelo(a) responsável {{resp_nome}}, CPF {{resp_cpf}} ({{resp_parentesco}}), matriculado(a) no {{serie}} do curso {{curso}}, e, como INTERVENIENTE a {{escola}}, inscrita no CNPJ sob o nº {{escola_cnpj}}, com endereço {{escola_endereco}}, que se vincula ao convênio para Estágio não obrigatório, nos termos da Lei nº 11.788/08:

`;

const up = db.prepare(`INSERT OR IGNORE INTO estagio_config (empresa_id,chave,valor,atualizado_em) VALUES (?,?,?,datetime('now'))`);
up.run(EMP, 'modelo_contrato_18', CABEC_18 + CLAUSULAS.replace('{{horas_dia}}', '04 (quatro)').replace('{{horas_semana}}', '20 (vinte)'));
up.run(EMP, 'modelo_contrato_16_17', CABEC_16 + CLAUSULAS.replace('{{horas_dia}}', '05 (cinco)').replace('{{horas_semana}}', '30 (trinta)'));
// lista dos modelos disponíveis no seletor
up.run(EMP, 'modelos_doc', JSON.stringify([
  { chave: 'modelo_contrato_18', nome: 'Contrato de Estágio (acima de 18 anos)' },
  { chave: 'modelo_contrato_16_17', nome: 'Contrato de Estágio (16 a 17 anos)' },
  { chave: 'modelo_contrato', nome: 'Termo simplificado (modelo antigo)' },
]));

console.log('✅ migration 210: modelos de contrato 16-17 e +18 + cnpj/endereço na escola');
