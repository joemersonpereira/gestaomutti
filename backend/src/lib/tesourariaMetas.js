// tesourariaMetas.js — Metas do setor Tesouraria (Joe 2026-11-11).
// Catálogo fixo (label/direção/unidade/alvo padrão) + REALIZADO calculado automático do sistema,
// virando farol verde/amarelo/vermelho. O alvo é cadastrável por empresa (tesouraria_meta).
// ERP SOMENTE LEITURA. Cada meta é isolada em try/catch: uma fonte indisponível não derruba o painel.
const db = require('../db/connection');
const { erpQuery } = require('../db/erp');
const { unisEmpresa, lojasEmpresa } = require('./escopoCompras');
const t = require('./tesourariaErp');
const cc = require('./conciliacaoCartao');
const orcErp = require('./orcamentoErp');

// direcao: 'maior' = quanto maior melhor; 'menor' = quanto menor melhor. tol = banda do amarelo.
const CATALOGO = [
  // Label = a META que almejamos (não o erro). O número abaixo é o realizado/gap; o farol diz se está no alvo.
  { chave: 'fechamento_completo', grupo: 'Fechamento', label: 'Fechamento do dia — Depósito anexado no mesmo dia', unidade: '%', direcao: 'maior', metaDefault: 100, tol: 15, desc: 'Meta: toda loja operacional com o depósito do dia anexado (na data "Até"). O número é quanto já foi anexado.' },
  { chave: 'dif_pendentes', grupo: 'Diferenças', label: 'Diferenças de caixa — Apuração em dia', unidade: 'qtd', direcao: 'menor', metaDefault: 0, tol: 3, desc: 'Meta: nenhuma falta relevante sem apuração/perdão/cobrança. O número é quantas seguem pendentes.' },
  { chave: 'reducao_faltas', grupo: 'Diferenças', label: 'Diferenças de caixa — Faltas em queda', unidade: '%', direcao: 'menor', metaDefault: -10, tol: 10, desc: 'Meta: o valor de faltas caindo frente ao período anterior (negativo = caiu). O número é a variação.' },
  { chave: 'agilidade_sla', grupo: 'Diferenças', label: 'Diferenças de caixa — Retorno do desconto no prazo (SLA)', unidade: '%', direcao: 'maior', metaDefault: 80, tol: 20, desc: 'Meta: a loja respondendo o contato de desconto dentro do SLA. O número é o % respondido no prazo.' },
  { chave: 'conferencia_pendente', grupo: 'Orçamento', label: 'Orçamento de loja — Conferência fiscal em dia', unidade: 'qtd', direcao: 'menor', metaDefault: 0, tol: 3, desc: 'Meta: todo gasto de orçamento conferido. O número é quantos seguem sem conferência fiscal.' },
  { chave: 'alpha_nao_lancado', grupo: 'Orçamento', label: 'Orçamento de loja — Lançamento no Alpha 7 em dia', unidade: '%', direcao: 'menor', metaDefault: 5, tol: 15, desc: 'Meta: todo gasto de orçamento lançado no Alpha 7. O número é o % ainda sem o lançamento casado.' },
  { chave: 'verba_estourada', grupo: 'Orçamento', label: 'Orçamento de loja — Verba dentro do teto', unidade: 'qtd', direcao: 'menor', metaDefault: 0, tol: 1, desc: 'Meta: nenhuma loja estourando a verba. O número é quantas estão com saldo de orçamento negativo.' },
  { chave: 'cancelamentos', grupo: 'Risco', label: 'Risco — Cancelamentos sob controle (% das vendas)', unidade: '%', direcao: 'menor', metaDefault: 2, tol: 1, desc: 'Meta: cancelamentos baixos. O número é a % de vendas canceladas sobre o total do período.' },
  { chave: 'estornos', grupo: 'Risco', label: 'Risco — Estornos sob controle (% das vendas)', unidade: '%', direcao: 'menor', metaDefault: 0.5, tol: 0.5, desc: 'Meta: estornos baixos. O número é a % de estornos sobre o total de vendas do período.' },
  { chave: 'erros_cartao', grupo: 'Risco', label: 'Risco — Erros de cartão sob controle (% das vendas)', unidade: '%', direcao: 'menor', metaDefault: 0.5, tol: 0.5, desc: 'Meta: poucas correções de modalidade (troca de forma). O número é a % sobre o total de vendas do período.' },
  { chave: 'conc_banco_contas', grupo: 'Conciliação', label: 'Banco — Conciliação do extrato em dia (dias)', unidade: 'dias', direcao: 'menor', metaDefault: 4, tol: 4, desc: 'Meta: extrato conciliado e saldo batendo em dia. O número é há quantos dias a pior conta está sem conciliar (desde out/2026).' },
  { chave: 'conc_banco_import', grupo: 'Conciliação', label: 'Banco — Importação do extrato em dia (dias)', unidade: 'dias', direcao: 'menor', metaDefault: 2, tol: 3, desc: 'Meta: o arquivo do extrato entrando no sistema logo após a data. O número é o atraso da pior conta de movimento diário (baixo movimento é excluído).' },
  { chave: 'cartao_alpha_atraso', grupo: 'Conciliação', label: 'Cartão Alpha 7 — Baixa no prazo (dias)', unidade: 'dias', direcao: 'menor', metaDefault: 5, tol: 5, desc: 'Meta: o item de cartão baixado no ERP (Nexxera) no prazo. O número é o atraso do item vencido mais antigo (desde out/2026).' },
  { chave: 'cartao_nosso_casado', grupo: 'Conciliação', label: 'Cartão (nossa conferência) — Casou com o ERP (%)', unidade: '%', direcao: 'maior', metaDefault: 98, tol: 5, desc: 'Meta: o relatório das credenciadoras batendo com o ERP. O número é o % que casou no período; o resto vira divergência a corrigir.' },
  { chave: 'saldo_conferido', grupo: 'Conciliação', label: 'Banco — Saldo conferido em dia', unidade: 'qtd', direcao: 'menor', metaDefault: 0, tol: 2, desc: 'Meta: toda conta em uso com o saldo conferido e anotado (o controle que substitui a planilha, na aba Saldos). O número é quantas contas estão sem o saldo registrado ou com a data anterior à última conciliação do sistema.' },
];
const DIAS_MOV_CONTA_ATIVA = 10;   // conta com movimento em >= 10 dias/mês = "diária" (entra no atraso de importação)
const LIMPEZA_DIAS = 45;           // pendência mais velha que isso = "limpeza" (sai do atraso operacional — cartão)
const OCIOSA_DIAS = 60;            // conta sem NENHUM movimento há mais que isso = ociosa (sai das metas de banco)
const PILARES = ['Fechamento', 'Diferenças', 'Orçamento', 'Conciliação', 'Risco']; // EXATAMENTE 5 pilares do setor

function configMetas(emp) {
  const salvos = {};
  db.prepare('SELECT chave, meta_valor, ativo FROM tesouraria_meta WHERE empresa_id=?').all(emp).forEach(r => { salvos[r.chave] = r; });
  return CATALOGO.map(c => ({
    ...c,
    meta: (salvos[c.chave] && salvos[c.chave].meta_valor != null) ? Number(salvos[c.chave].meta_valor) : c.metaDefault,
    ativo: salvos[c.chave] ? salvos[c.chave].ativo !== 0 : true,
  }));
}
function setMeta(emp, { chave, meta_valor, ativo } = {}) {
  if (!CATALOGO.find(c => c.chave === chave)) throw new Error('Meta desconhecida.');
  db.prepare(`INSERT INTO tesouraria_meta (empresa_id, chave, meta_valor, ativo, atualizado_em) VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(empresa_id,chave) DO UPDATE SET meta_valor=excluded.meta_valor, ativo=excluded.ativo, atualizado_em=excluded.atualizado_em`)
    .run(emp, chave, meta_valor != null && meta_valor !== '' ? Number(meta_valor) : null, ativo === false ? 0 : 1);
  return { ok: true };
}
// Piso de data da conciliação (banco + cartão): ignora pendências/atrasos anteriores a essa data.
// Configurável em tesouraria_config (chave 'conc_inicio'); padrão 01/10/2026.
function concInicio(emp) {
  try { const r = db.prepare("SELECT valor FROM tesouraria_config WHERE empresa_id=? AND chave='conc_inicio'").get(emp); return (r && /^\d{4}-\d{2}-\d{2}$/.test(r.valor)) ? r.valor : '2026-10-01'; } catch (e) { return '2026-10-01'; }
}
function setConcInicio(emp, data) {
  const v = /^\d{4}-\d{2}-\d{2}$/.test(data || '') ? data : '2026-10-01';
  const ex = db.prepare("SELECT 1 FROM tesouraria_config WHERE empresa_id=? AND chave='conc_inicio'").get(emp);
  if (ex) db.prepare("UPDATE tesouraria_config SET valor=? WHERE empresa_id=? AND chave='conc_inicio'").run(v, emp);
  else db.prepare("INSERT INTO tesouraria_config (empresa_id, chave, valor) VALUES (?, 'conc_inicio', ?)").run(emp, v);
  return { ok: true, conc_inicio: v };
}
// Valor-teto do prêmio por pilar (R$, nota 100 = teto). Configurável; padrão R$100.
function premioPilar(emp) {
  try { const r = db.prepare("SELECT valor FROM tesouraria_config WHERE empresa_id=? AND chave='premio_pilar_valor'").get(emp); const v = Number(r && r.valor); return isFinite(v) && v > 0 ? v : 100; } catch (e) { return 100; }
}
// Bônus de superação ao bater 100% no pilar (fração do teto). Configurável; padrão 0,5 (+50%).
function premioBonusPct(emp) {
  try { const r = db.prepare("SELECT valor FROM tesouraria_config WHERE empresa_id=? AND chave='premio_bonus_pct'").get(emp); const v = Number(r && r.valor); return isFinite(v) && v >= 0 ? v : 0.5; } catch (e) { return 0.5; }
}
function setPremioConfig(emp, { valor, bonusPct } = {}) {
  const up = (chave, v) => { const ex = db.prepare('SELECT 1 FROM tesouraria_config WHERE empresa_id=? AND chave=?').get(emp, chave); if (ex) db.prepare('UPDATE tesouraria_config SET valor=? WHERE empresa_id=? AND chave=?').run(String(v), emp, chave); else db.prepare('INSERT INTO tesouraria_config (empresa_id, chave, valor) VALUES (?,?,?)').run(emp, chave, String(v)); };
  if (valor != null && isFinite(Number(valor)) && Number(valor) > 0) up('premio_pilar_valor', Number(valor));
  if (bonusPct != null && isFinite(Number(bonusPct)) && Number(bonusPct) >= 0) up('premio_bonus_pct', Number(bonusPct));
  return { ok: true, premioValor: premioPilar(emp), bonusPct: premioBonusPct(emp) };
}
// Pessoas vinculadas às FAIXAS do prêmio: cada colaborador recebe premioTotalChefe × fator (1 = cheio, 0,5 = metade).
function listPremioPessoas(emp) {
  try {
    return db.prepare(`SELECT pp.colaborador_id, pp.fator, c.nome
      FROM tesouraria_premio_pessoa pp LEFT JOIN colaboradores c ON c.id = pp.colaborador_id
      WHERE pp.empresa_id=? AND pp.ativo=1 ORDER BY pp.fator DESC, c.nome`).all(emp)
      .map(r => ({ colaborador_id: r.colaborador_id, nome: r.nome || '(colaborador)', fator: Number(r.fator) || 0 }));
  } catch (e) { return []; }
}
function setPremioPessoa(emp, { colaborador_id, fator } = {}) {
  if (!colaborador_id) throw new Error('Selecione o colaborador.');
  const f = Math.min(5, Math.max(0, Number(fator))); if (!isFinite(f)) throw new Error('Fator inválido.');
  db.prepare(`INSERT INTO tesouraria_premio_pessoa (empresa_id, colaborador_id, fator, ativo, criado_em) VALUES (?,?,?,1, datetime('now'))
    ON CONFLICT(empresa_id, colaborador_id) DO UPDATE SET fator=excluded.fator, ativo=1`).run(emp, String(colaborador_id), f);
  return { ok: true };
}
function removePremioPessoa(emp, colaborador_id) {
  db.prepare('UPDATE tesouraria_premio_pessoa SET ativo=0 WHERE empresa_id=? AND colaborador_id=?').run(emp, String(colaborador_id));
  return { ok: true };
}
function farol(meta, realizado, direcao, tol) {
  if (realizado == null || !isFinite(realizado)) return 'sem_dados';
  if (direcao === 'maior') return realizado >= meta ? 'verde' : (realizado >= meta - tol ? 'amarelo' : 'vermelho');
  return realizado <= meta ? 'verde' : (realizado <= meta + tol ? 'amarelo' : 'vermelho');
}
const r1 = n => Math.round((Number(n) || 0) * 10) / 10;
const diasEntre = (ini, fim) => Math.round((new Date(fim) - new Date(ini)) / 86400000) + 1;
const shift = (d, dias) => { const x = new Date(d); x.setDate(x.getDate() + dias); return x.toISOString().slice(0, 10); };

async function apurar(emp, { ini, fim, lojaId } = {}) {
  const hoje = new Date().toISOString().slice(0, 10);
  ini = ini || (hoje.slice(0, 8) + '01'); fim = fim || hoje;
  const lj = lojaId || null;
  const real = {}; // chave -> número (ou undefined = sem dados)
  const detalhes = {}; // chave -> texto de contexto (ex.: "830 de 41.200 vendas")
  const pisoConc = concInicio(emp); // conciliação só considera pendências a partir desta data

  // 1) fechamento_completo — % lojas operacionais com depósito anexado na data "fim"
  try {
    const lojas = lojasEmpresa(emp).filter(l => l.id !== 'loja-escritorio' && (!lj || l.id === lj));
    if (lojas.length) {
      const comDep = db.prepare(`SELECT DISTINCT loja_id FROM tesouraria_anexo WHERE empresa_id=? AND tipo='deposito' AND data=?`).all(emp, fim).map(r => r.loja_id);
      const k = lojas.filter(l => comDep.includes(l.id)).length;
      real.fechamento_completo = r1(k / lojas.length * 100);
    }
  } catch (e) { /* sem dados */ }

  // 2) dif_pendentes + 4) reducao_faltas — do ERP (quebras)
  let qResumo = null;
  try { const q = await t.quebras(emp, { ini, fim, lojaId: lj }); qResumo = q.resumo; real.dif_pendentes = Number(q.resumo.pendentes) || 0; } catch (e) { /* ERP off */ }
  try {
    if (qResumo) {
      const n = diasEntre(ini, fim);
      const pIni = shift(ini, -n), pFim = shift(ini, -1);
      const qa = await t.quebras(emp, { ini: pIni, fim: pFim, lojaId: lj });
      const atual = Number(qResumo.valorFalta) || 0, antes = Number(qa.resumo.valorFalta) || 0;
      real.reducao_faltas = antes > 0 ? r1((atual - antes) / antes * 100) : (atual > 0 ? 100 : 0);
    }
  } catch (e) { /* */ }

  // 8) agilidade_sla — app db (tesouraria_apagar): contatos de desconto respondidos no prazo (por criado_em)
  try {
    const rows = db.prepare(`SELECT valor, status, contato_em, retorno_em, no_prazo FROM tesouraria_apagar
      WHERE empresa_id=? AND substr(criado_em,1,10)>=? AND substr(criado_em,1,10)<=?`).all(emp, ini, fim);
    const comContato = rows.filter(x => x.contato_em && x.retorno_em);
    if (comContato.length) real.agilidade_sla = r1(comContato.filter(x => x.no_prazo).length / comContato.length * 100);
    else real.agilidade_sla = 100; // sem contatos no período = sem atraso
  } catch (e) { /* */ }

  // 5) conferencia_pendente — gastos de orçamento sem conferência fiscal no período
  try {
    const row = db.prepare(`SELECT COUNT(*) n FROM tesouraria_anexo WHERE empresa_id=? AND tipo='orcamento' AND fiscal_conf IS NULL AND data>=? AND data<=? ${lj ? 'AND loja_id=?' : ''}`).get(...(lj ? [emp, ini, fim, lj] : [emp, ini, fim]));
    real.conferencia_pendente = Number(row.n) || 0;
  } catch (e) { /* */ }

  // 6) alpha_nao_lancado — % gastos de orçamento sem o lançamento casado no Alpha 7
  try {
    const anexos = db.prepare(`SELECT loja_id, data, valor FROM tesouraria_anexo WHERE empresa_id=? AND tipo='orcamento' AND data>=? AND data<=? ${lj ? 'AND loja_id=?' : ''}`).all(...(lj ? [emp, ini, fim, lj] : [emp, ini, fim]));
    if (anexos.length) {
      const appParaErp = {}; lojasEmpresa(emp).forEach(l => { appParaErp[l.id] = String(l.erp_unidadenegocio_id); });
      const unis = unisEmpresa(emp, lj);
      const mov = unis.length ? await orcErp.orcamentoMovimento(unis, { de: ini, ate: fim }) : [];
      const pool = new Map();
      for (const m of mov) { if (m.credito) continue; const k = String(m.loja_erp); if (!pool.has(k)) pool.set(k, []); pool.get(k).push({ valor: Math.abs(Number(m.valor) || 0), usado: false }); }
      let naoLancado = 0;
      for (const a of anexos) {
        const erpId = appParaErp[a.loja_id]; const lista = erpId ? pool.get(erpId) : null; const v = Number(a.valor) || 0;
        const g = lista && lista.find(x => !x.usado && Math.abs(x.valor - v) <= 0.02);
        if (g) g.usado = true; else naoLancado++;
      }
      real.alpha_nao_lancado = r1(naoLancado / anexos.length * 100);
    } else real.alpha_nao_lancado = 0;
  } catch (e) { /* ERP off */ }

  // 7) verba_estourada — lojas com saldo de orçamento negativo
  try {
    const unis = unisEmpresa(emp, lj);
    if (unis.length) { const rows = await orcErp.orcamentoResumo(unis, { de: ini, ate: fim }); real.verba_estourada = rows.filter(r => Number(r.saldo) < 0).length; }
  } catch (e) { /* */ }

  // 9/10/11) cancelamentos, estornos, erros — como TAXA (% das vendas), não número bruto.
  const nbr = n => (Number(n) || 0).toLocaleString('pt-BR');
  let totVendas = 0;
  try {
    const unis = unisEmpresa(emp, lj);
    if (unis.length) {
      const tv = await erpQuery(`SELECT count(*) n FROM venda v WHERE v.status='F' AND v.unidadenegocioid = ANY($1::bigint[]) AND v.datahorafechamento >= $2::date AND v.datahorafechamento < ($3::date + 1)`, [unis, ini, fim]);
      totVendas = Number(tv[0] && tv[0].n) || 0;
      const c = await erpQuery(`SELECT count(*) n FROM venda v WHERE v.status='C' AND v.unidadenegocioid = ANY($1::bigint[]) AND v.datahoraabertura >= $2::date AND v.datahoraabertura < ($3::date + 1)`, [unis, ini, fim]);
      const qc = Number(c[0] && c[0].n) || 0;
      real.cancelamentos = totVendas > 0 ? r1(qc / totVendas * 100) : 0; detalhes.cancelamentos = `${nbr(qc)} de ${nbr(totVendas)} vendas`;
      const es = await erpQuery(`SELECT count(*) n FROM estornovenda ev WHERE ev.unidadenegocioid = ANY($1::bigint[]) AND ev.datahora >= $2::date AND ev.datahora < ($3::date + 1)`, [unis, ini, fim]);
      const qe = Number(es[0] && es[0].n) || 0;
      real.estornos = totVendas > 0 ? r1(qe / totVendas * 100) : 0; detalhes.estornos = `${nbr(qe)} de ${nbr(totVendas)} vendas`;
    }
  } catch (e) { /* */ }
  try {
    const corr = await cc.correcoes(emp, { ini, fim, lojaId: lj });
    const qt = (corr.porOperador || []).reduce((a, o) => a + (Number(o.n) || 0), 0);
    real.erros_cartao = totVendas > 0 ? r1(qt / totVendas * 100) : 0; detalhes.erros_cartao = `${nbr(qt)} de ${nbr(totVendas)} vendas`;
  } catch (e) { /* */ }

  // 12/13) Conciliação bancária — atraso por conta (pendente mais antigo = até onde o saldo bate). Independe do período.
  try {
    const unis = unisEmpresa(emp, lj);
    if (unis.length) {
      // atraso = dias desde o extrato pendente mais antigo DESDE O PISO (out/2026); ignora contas OCIOSAS
      // (sem nenhum movimento há > 60 dias) via HAVING — uma conta parada no ERP não distorce a meta.
      const rows = await erpQuery(`
        SELECT cc.nome conta,
          (current_date - MIN(eb.datahora) FILTER (WHERE ec.id IS NULL AND eb.datahora >= $2::date)::date) AS atraso_op
        FROM contabancaria cb
        JOIN contacorrente cc ON cc.id=cb.contacorrenteid AND cc.status='A'
        LEFT JOIN extratobancario eb ON eb.contabancariaid=cb.id
        LEFT JOIN extratobancarioconciliacao ec ON ec.extratobancarioid=eb.id
        WHERE cc.unidadenegocioid = ANY($1::bigint[])
        GROUP BY cc.nome
        HAVING MAX(eb.datahora) >= current_date - ${OCIOSA_DIAS}`, [unis, pisoConc]);
      // conc_banco_contas = tempo de conciliação (dias) da PIOR conta — há quantos dias o saldo deixou de bater.
      const atrasos = rows.map(r => ({ conta: r.conta, atraso: Number(r.atraso_op) || 0 }));
      const maxA = atrasos.length ? Math.max(...atrasos.map(x => x.atraso)) : 0;
      real.conc_banco_contas = maxA;
      const atrasadas = atrasos.filter(x => x.atraso > 0).sort((a, b) => b.atraso - a.atraso);
      if (atrasadas.length) detalhes.conc_banco_contas = `pior: ${atrasadas[0].conta} (${atrasadas[0].atraso}d)` + (atrasadas.length > 1 ? ` · +${atrasadas.length - 1} conta(s): ${atrasadas.slice(1, 3).map(x => `${x.conta} ${x.atraso}d`).join(' · ')}` : '');
    }
  } catch (e) { /* ERP off */ }

  // 14) Atraso pra IMPORTAR o extrato (data do arquivo no sistema vs data do extrato) — só contas de movimento diário.
  try {
    const unis = unisEmpresa(emp, lj);
    if (unis.length) {
      const rows = await erpQuery(`
        SELECT cc.nome conta,
          count(DISTINCT eb.datahora::date) FILTER (WHERE eb.datahora >= current_date - 30) AS dias_mov,
          max(eb.localizacaodatahora::date - eb.datahora::date) FILTER (WHERE eb.datahora >= current_date - 30) AS atraso
        FROM contabancaria cb
        JOIN contacorrente cc ON cc.id=cb.contacorrenteid AND cc.status='A'
        JOIN extratobancario eb ON eb.contabancariaid=cb.id
        WHERE cc.unidadenegocioid = ANY($1::bigint[]) AND eb.localizacaodatahora IS NOT NULL
        GROUP BY cc.nome`, [unis]);
      const ativas = rows.filter(r => Number(r.dias_mov) >= DIAS_MOV_CONTA_ATIVA && r.atraso != null).map(r => ({ conta: r.conta, atraso: Number(r.atraso) || 0 }));
      const maxI = ativas.length ? Math.max(...ativas.map(x => x.atraso)) : 0;
      real.conc_banco_import = maxI;
      const pior = ativas.find(x => x.atraso === maxI);
      if (pior && maxI > 0) detalhes.conc_banco_import = `pior: ${pior.conta} (${maxI} dias) · ${ativas.length} conta(s) de mov. diário`;
    }
  } catch (e) { /* ERP off */ }

  // 14b) Saldo conferido em dia — controle que substitui a planilha (aba Saldos). Conta EM USO (movimento
  //      nos últimos 60 dias) sem saldo anotado, ou com a data anterior à última conciliação do sistema, não confere.
  try {
    const sb = await t.saldosBanco(emp);
    const emUso = sb.filter(c => c.ultima_linha && (Date.now() - new Date(c.ultima_linha + 'T12:00:00').getTime()) / 86400000 <= OCIOSA_DIAS);
    const naoConf = emUso.filter(c => !c.data_conciliacao || (c.conciliado_ate_sistema && String(c.data_conciliacao) < String(c.conciliado_ate_sistema)));
    real.saldo_conferido = naoConf.length;
    if (naoConf.length) detalhes.saldo_conferido = naoConf.slice(0, 3).map(c => `${c.conta_nome}${c.data_conciliacao ? ' (desatualizado)' : ' (sem saldo)'}`).join(' · ') + (naoConf.length > 3 ? '…' : '');
  } catch (e) { /* ERP off / sem contas */ }

  // 15) Cartão (Alpha 7, Nexxera) — atraso operacional (ignora > 45 dias) + pendências antigas (limpeza).
  try {
    const r = await erpQuery(`
      SELECT (current_date - MIN(i.datavencimento) FILTER (WHERE i.datavencimento >= current_date - ${LIMPEZA_DIAS})::date) AS atraso_op,
             count(*) FILTER (WHERE i.datavencimento < current_date - ${LIMPEZA_DIAS}) AS antigas
      FROM conciliacaocartaoitem i WHERE i.baixadata IS NULL AND i.datavencimento < current_date AND i.datavencimento >= $1::date`, [pisoConc]);
    real.cartao_alpha_atraso = Math.max(0, Number(r[0] && r[0].atraso_op) || 0);
    real.cartao_alpha_limpeza = Number(r[0] && r[0].antigas) || 0;
    if (real.cartao_alpha_limpeza > 0) detalhes.cartao_alpha_limpeza = `${nbr(real.cartao_alpha_limpeza)} itens vencidos > 45 dias`;
  } catch (e) { /* ERP off */ }

  // 16) Cartão (nossa conferência) — % que CASOU com o ERP no período. Liga à qualidade da conciliação
  //     (os mesmos indicadores da tela de Conciliação de Cartões), não à data do upload.
  // MÉDIA (ponderada) das DUAS fontes: a conferência automática (EDI — a tela de Conciliação) +
  // os relatórios subidos manualmente (Le Card/Nutricash/etc). casados e linhas somados = % honesto do todo.
  try {
    const [edi, man] = await Promise.all([
      cc.edi(emp, { ini, fim, lojaId: lj }).catch(() => null),
      cc.confrontarPeriodo(emp, { ini, fim, lojaId: lj }).catch(() => null),
    ]);
    let casados = 0, linhas = 0, abertas = 0; const fontes = [];
    for (const [nome, r] of [['automática', edi && edi.resumo], ['relatórios subidos', man && !man.vazio && man.resumo]]) {
      if (r && (Number(r.linhasOperadora) || 0) > 0) { casados += Number(r.casados) || 0; linhas += Number(r.linhasOperadora) || 0; abertas += Number(r.abertas) || 0; fontes.push(nome); }
    }
    if (linhas > 0) {
      real.cartao_nosso_casado = r1(casados / linhas * 100);
      detalhes.cartao_nosso_casado = `${nbr(abertas)} divergência(s) em aberto · ${nbr(casados)}/${nbr(linhas)} casaram · fontes: ${fontes.join(' + ')}`;
    }
  } catch (e) { /* sem dado de conciliação */ }

  const cfg = configMetas(emp);
  const metas = cfg.filter(c => c.ativo).map(c => {
    const realizado = (c.chave in real) ? real[c.chave] : null;
    return { chave: c.chave, grupo: c.grupo, label: c.label, unidade: c.unidade, direcao: c.direcao, desc: c.desc, detalhe: detalhes[c.chave] || null, meta: c.meta, realizado, farol: farol(c.meta, realizado, c.direcao, c.tol) };
  });
  const resumo = { verde: metas.filter(m => m.farol === 'verde').length, amarelo: metas.filter(m => m.farol === 'amarelo').length, vermelho: metas.filter(m => m.farol === 'vermelho').length, sem: metas.filter(m => m.farol === 'sem_dados').length };
  // 5 PILARES (fixos) com nota 0–100 (🟢100/🟡50/🔴0, média) + nota geral do setor.
  const score = f => f === 'verde' ? 100 : f === 'amarelo' ? 50 : f === 'vermelho' ? 0 : null;
  // PRÊMIO por pilar (valor do CHEFE, fator 1): R$ = nota × (teto/100). Teto e bônus configuráveis.
  // Como a nota não passa de 100 (tudo verde = teto), ALCANÇAR 100% paga o teto + bônus (padrão +50%).
  const premioValor = premioPilar(emp);
  const bonusPct = premioBonusPct(emp);
  const r2 = v => Math.round(v * 100) / 100;
  const pilares = PILARES.map(p => {
    const ms = metas.filter(m => m.grupo === p);
    const sc = ms.map(m => score(m.farol)).filter(x => x != null);
    const nota = sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null;
    const pf = nota == null ? 'sem_dados' : nota >= 80 ? 'verde' : nota >= 50 ? 'amarelo' : 'vermelho';
    const bonus = nota === 100;                                   // 100% = superação → + bônus do teto
    const premio = nota == null ? 0 : r2(nota / 100 * premioValor + (bonus ? premioValor * bonusPct : 0));
    return { pilar: p, nota, farol: pf, premio, premioMax: premioValor, bonus, total: ms.length, verde: ms.filter(m => m.farol === 'verde').length, amarelo: ms.filter(m => m.farol === 'amarelo').length, vermelho: ms.filter(m => m.farol === 'vermelho').length };
  });
  const nv = pilares.map(p => p.nota).filter(x => x != null);
  const notaGeral = nv.length ? Math.round(nv.reduce((a, b) => a + b, 0) / nv.length) : null;
  const premioTotalChefe = r2(pilares.reduce((a, p) => a + (p.premio || 0), 0));
  const premioMaxTotal = r2(premioValor * (1 + bonusPct) * PILARES.length); // todos os pilares a 100% (com bônus)
  // Pessoas vinculadas às faixas (chefe fator 1, estagiário 0,5…): cada uma recebe premioTotalChefe × fator.
  const pessoas = listPremioPessoas(emp).map(x => ({ ...x, premioTotal: r2(premioTotalChefe * (Number(x.fator) || 0)) }));
  return { ok: true, periodo: { ini, fim }, resumo, pilares, notaGeral, premioValor, bonusPct, premioTotalChefe, premioMaxTotal, pessoas, metas };
}

// (A) Sugerir alvos pela BASE HISTÓRICA: média do realizado nos últimos N ciclos completos,
// ajustada pela redução/melhoria escolhida. Assim o alvo sai dos dados do grupo, não de chute.
const cpontos = require('./caixaPontos');
async function sugerir(emp, { reducao, ciclos } = {}) {
  const red = Math.max(0, Number(reducao) || 10);
  const nC = Math.min(6, Math.max(1, Number(ciclos) || 3));
  const { periodos } = cpontos.cicloConfig(emp);
  const atual = cpontos.periodoAtual(emp);
  let { ano, periodo } = atual; const janelas = [];
  for (let i = 0; i < nC; i++) { periodo -= 1; if (periodo < 1) { periodo = periodos; ano -= 1; } const r = cpontos.periodoRange(emp, ano, periodo); janelas.push({ ano, periodo, ini: r.ini, fim: r.fim, label: cpontos.periodoLabel(emp, ano, periodo) }); }
  const acc = {};
  for (const j of janelas) { const ap = await apurar(emp, { ini: j.ini, fim: j.fim }); for (const m of ap.metas) { if (m.realizado != null && isFinite(m.realizado)) (acc[m.chave] = acc[m.chave] || []).push(m.realizado); } }
  const cfg = configMetas(emp);
  const round = (v, u) => u === '%' ? Math.round(v * 10) / 10 : Math.round(v);
  const sugestoes = cfg.map(c => {
    const arr = acc[c.chave] || [];
    const baseline = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    let sugerido = null;
    if (c.chave === 'reducao_faltas') sugerido = -red;
    else if (baseline != null) {
      if (c.direcao === 'menor') sugerido = round(Math.max(0, baseline * (1 - red / 100)), c.unidade);
      else { let v = baseline * (1 + red / 100); if (c.unidade === '%' && v > 100) v = 100; sugerido = round(v, c.unidade); }
    }
    return { chave: c.chave, label: c.label, unidade: c.unidade, direcao: c.direcao, metaAtual: c.meta, baseline: baseline != null ? round(baseline, c.unidade) : null, sugerido };
  });
  return { ok: true, reducao: red, ciclos: janelas, sugestoes };
}
function aplicarSugestoes(emp, sugestoes) {
  (sugestoes || []).forEach(s => { if (s && s.chave && s.sugerido != null) { try { setMeta(emp, { chave: s.chave, meta_valor: s.sugerido }); } catch (e) { /* ignora chave inválida */ } } });
  return { ok: true };
}

module.exports = { CATALOGO, configMetas, setMeta, apurar, sugerir, aplicarSugestoes, concInicio, setConcInicio, premioPilar, premioBonusPct, setPremioConfig, listPremioPessoas, setPremioPessoa, removePremioPessoa };
