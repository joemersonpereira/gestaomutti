// 233_contabil_conta_sem_nf.js — planos de contas que NÃO têm nota fiscal por natureza (folha,
// impostos, encargos, retirada de sócio, estágio, etc.). Classificação por TERMO (substring do nome
// do plano) + motivo. Usado no BI e no Extrato pra não contar isso como "sem nota (perda fiscal)".
// Idempotente; semeia padrões p/ a empresa Mutti.
const db = require('../connection');
db.exec(`CREATE TABLE IF NOT EXISTS contabil_conta_sem_nf (
  empresa_id TEXT NOT NULL,
  termo TEXT NOT NULL,     -- substring (case-insensitive) do nome do plano de contas
  motivo TEXT,             -- rótulo do bucket (Imposto, Folha de pagamento, Sócio…)
  PRIMARY KEY (empresa_id, termo)
)`);
const EMP = 'empresa-mutti-001';
const seed = [
  ['Irpj', 'Imposto'], ['Csll', 'Imposto'], ['Inss', 'Imposto'], ['Fgts', 'Imposto'],
  ['Irrf', 'Imposto'], ['Simples Nacional', 'Imposto'], ['Darf', 'Imposto'],
  ['Folha de Pagamento', 'Folha de pagamento'], ['Folha de pagamento Tercerizada', 'Folha de pagamento'],
  ['Salario Escritorio', 'Folha de pagamento'], ['Férias', 'Folha de pagamento'], ['Premiações', 'Folha de pagamento'],
  ['Rescis', 'Folha de pagamento'], ['Vale Transporte', 'Folha de pagamento'],
  ['Artur', 'Sócio (retirada)'], ['Pró-labore', 'Sócio (retirada)'], ['Pro-labore', 'Sócio (retirada)'],
  ['Estagio', 'Estágio'], ['Aluguel do Sistema', 'Aluguel/Sistema'], ['Formula', 'Fórmula'],
];
const up = db.prepare(`INSERT OR IGNORE INTO contabil_conta_sem_nf (empresa_id,termo,motivo) VALUES (?,?,?)`);
seed.forEach(([t, m]) => up.run(EMP, t, m));
console.log(`✅ migration 233: contabil_conta_sem_nf (${seed.length} padrões semeados)`);
