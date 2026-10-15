// Semeia a tabela de taxas a partir do que foi MEDIDO nos relatórios reais de jun a ago/2026.
//
// Isto é um ponto de partida, não o contrato: a tela (Ajustes ▸ Taxas por filial) continua sendo
// a dona do cadastro. O objetivo é o confronto já começar a funcionar — assim que a operadora
// fugir do que vinha praticando, o sistema acusa. Quando o Joe tiver o contrato em mãos, corrige
// na tela e a taxa cadastrada passa a valer como referência de verdade.
//
// Rodar:  node scripts/seed-taxas-cartao.js
const { salvarTaxa } = require('../src/lib/repasseCartao');
const { lojasEmpresa } = require('../src/lib/escopoCompras');

const EMPRESA = 'empresa-mutti-001';
const LOJAS = lojasEmpresa(EMPRESA).map(l => l.id);

const TABELA = [
  // ── Rede ────────────────────────────────────────────────────────────────
  // A Rede publica a taxa MDR no próprio relatório. Medido em 58.600 parcelas de jul e ago/2026:
  // débito e crédito à vista são fixos; o parcelado varia com o nº de parcelas.
  // debito e credito a vista vem com parcelas=0 no repasse da Rede — por isso faixa 0/0
  { operadora: 'Rede', bandeira: 'Visa',       grupo: 'DEBITO',    ini: 0, fim: 0,  taxa: 0.75 },
  { operadora: 'Rede', bandeira: 'Mastercard', grupo: 'DEBITO',    ini: 0, fim: 0,  taxa: 0.75 },
  { operadora: 'Rede', bandeira: 'Elo',        grupo: 'DEBITO',    ini: 0, fim: 0,  taxa: 1.14 },
  { operadora: 'Rede', bandeira: 'Visa',       grupo: 'CREDITO',   ini: 0, fim: 0,  taxa: 1.65 },
  { operadora: 'Rede', bandeira: 'Mastercard', grupo: 'CREDITO',   ini: 0, fim: 0,  taxa: 1.65 },
  { operadora: 'Rede', bandeira: 'Elo',        grupo: 'CREDITO',   ini: 0, fim: 0,  taxa: 2.04 },
  { operadora: 'Rede', bandeira: 'Amex',       grupo: 'CREDITO',   ini: 0, fim: 0,  taxa: 2.04 },
  { operadora: 'Rede', bandeira: 'Diners',     grupo: 'CREDITO',   ini: 0, fim: 0,  taxa: 2.64 },
  { operadora: 'Rede', bandeira: 'Visa',       grupo: 'PARCELADO', ini: 2, fim: 12, taxa: 2.25 },
  { operadora: 'Rede', bandeira: 'Mastercard', grupo: 'PARCELADO', ini: 2, fim: 12, taxa: 2.25 },
  { operadora: 'Rede', bandeira: 'Elo',        grupo: 'PARCELADO', ini: 2, fim: 12, taxa: 2.35 },
  { operadora: 'Rede', bandeira: 'Amex',       grupo: 'PARCELADO', ini: 2, fim: 12, taxa: 2.27 },

  // ── Brasil Card ─────────────────────────────────────────────────────────
  // Medido em 99 vendas de 01 a 06/08/2026, taxa igual nas 6 lojas.
  { operadora: 'Brasil Card', bandeira: 'Brasil Card', grupo: 'CREDIARIO', ini: 1, fim: 1,  taxa: 2.99 },
  { operadora: 'Brasil Card', bandeira: 'Brasil Card', grupo: 'CREDIARIO', ini: 2, fim: 2,  taxa: 3.49 },
  { operadora: 'Brasil Card', bandeira: 'Brasil Card', grupo: 'CREDIARIO', ini: 3, fim: 12, taxa: 3.99 },

  // ── Banese / Mulvi ──────────────────────────────────────────────────────
  // No repasse a Mulvi diz a modalidade, então a taxa vai por grupo real.
  { operadora: 'Banese / Mulvi', bandeira: 'BANESE CARD', grupo: 'DEBITO',    ini: 0, fim: 0,  taxa: 1.80 },
  { operadora: 'Banese / Mulvi', bandeira: 'BANESE CARD', grupo: 'CREDITO',   ini: 0, fim: 0,  taxa: 4.20 },
  { operadora: 'Banese / Mulvi', bandeira: 'BANESE CARD', grupo: 'PARCELADO', ini: 2, fim: 12, taxa: 4.70 },
  { operadora: 'Banese / Mulvi', bandeira: 'Banese Card', grupo: 'CREDIARIO', ini: 1, fim: 12, taxa: 4.70 },

  // ── Le Card ─────────────────────────────────────────────────────────────
  // 7,00% cravado em 44 de 44 créditos. O que aparecia como "42%" era antecipação, que agora
  // vai separada em outrosDescontos — não é taxa.
  { operadora: 'Le Card', bandeira: 'Le Card', grupo: 'CREDIARIO', ini: 0, fim: 0, taxa: 7.00 },

  // ── Multi Mais / Uze ────────────────────────────────────────────────────
  // 4,70% na maioria dos créditos (alguns a 5,00%).
  { operadora: 'Multi Mais / Uze', bandeira: 'Multi Mais / Uze', grupo: 'CREDIARIO', ini: 0, fim: 0, taxa: 4.70 },

  // ── Alelo ───────────────────────────────────────────────────────────────
  // Duas taxas bem distintas por produto: PAT 3,60% e Auxílio 7,00% (90 vendas de jul e ago).
  // O repasse não separa por produto, então a referência aqui é a média ponderada praticada.
  { operadora: 'Alelo', bandeira: 'Alelo', grupo: 'VOUCHER', ini: 0, fim: 0, taxa: 4.80 },

  // ── Bracov ──────────────────────────────────────────────────────────────
  // A própria planilha de lotes diz: 4% + R$ 3 fixos por lote.
  { operadora: 'Bracov', bandeira: 'Bracov', grupo: 'CREDIARIO', ini: 0, fim: 0, taxa: 4.00 },
];

let n = 0;
for (const t of TABELA) {
  for (const lojaId of LOJAS) {
    salvarTaxa(EMPRESA, { operadora: t.operadora, lojaId, bandeira: t.bandeira, grupo: t.grupo,
      parcelaIni: t.ini, parcelaFim: t.fim, taxa: t.taxa, vigenciaIni: '2026-06-01' });
    n++;
  }
}
console.log(n + ' taxa(s) gravada(s) — ' + TABELA.length + ' faixas × ' + LOJAS.length + ' lojas');
