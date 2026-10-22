// syncColaboradoresErp.js — varredura: mantém ativo no app só quem está ativo no Alpha 7.
// Vínculo por CPF (usuario→pessoa.cpf = colaboradores.cpf, só dígitos). O ERP (usuario.status A/I)
// é a verdade. Só mexe em quem TEM vínculo no ERP e está INATIVO lá — quem não tem usuário no ERP
// (ex.: escritório sem login no PDV) é deixado como está. SEMPRE tem prévia antes de aplicar.
const db = require('../db/connection');
const { erpQuery } = require('../db/erp');
const { randomUUID } = require('crypto');

const dig = s => String(s || '').replace(/\D/g, '');
const limpaNome = n => String(n || '').replace(/#+\s*$/, '').trim(); // '#' no fim marca inativo no ERP

// Usuários ATIVOS no ERP (1 por pessoa), com a unidade (loja) quando houver — base do "a importar".
async function usuariosAtivosErp() {
  return erpQuery(`SELECT DISTINCT ON (pf.id) pf.id pessoaid, pf.nome,
      regexp_replace(pf.cpf,'[^0-9]','','g') cpf, u.unidadenegocioid uni
    FROM usuario u JOIN pessoa pf ON pf.id = u.pessoaid
    WHERE u.status='A' AND pf.cpf IS NOT NULL AND pf.cpf <> ''
    ORDER BY pf.id, u.unidadenegocioid NULLS LAST`);
}

// Mapa cpf(dígitos) → tem algum usuário ATIVO no ERP?
async function mapaErp() {
  const rows = await erpQuery(`SELECT pf.cpf, u.status FROM usuario u JOIN pessoa pf ON pf.id=u.pessoaid WHERE pf.cpf IS NOT NULL AND pf.cpf<>''`);
  const m = {};
  rows.forEach(r => { const c = dig(r.cpf); if (!c) return; m[c] = (m[c] || false) || (r.status === 'A'); });
  return m;
}

// Conjunto de CPFs (dígitos) que estão no grupo "ESTAGIO" (ou similar) no ERP → são estagiários.
async function cpfsEstagio() {
  const rows = await erpQuery(`SELECT DISTINCT regexp_replace(pf.cpf,'[^0-9]','','g') cpf
    FROM usuarioparticipantegrupousuario upg
    JOIN grupousuario g ON g.id = upg.grupousuarioid
    JOIN usuario u ON u.id = upg.usuarioid
    JOIN pessoa pf ON pf.id = u.pessoaid
    WHERE UPPER(g.nome) LIKE '%ESTAGI%' AND pf.cpf IS NOT NULL AND pf.cpf <> ''`);
  return new Set(rows.map(r => r.cpf).filter(Boolean));
}

// Cria a ficha de estágio do colaborador (igual ao syncEstagiario da rota), se ainda não tiver.
function criarFichaEstagio(empresaId, colab) {
  const ja = db.prepare('SELECT id FROM estagio_ficha WHERE colaborador_id=?').get(colab.id);
  if (ja) return;
  db.prepare(`INSERT INTO estagio_ficha (id,empresa_id,nome,cpf,loja,status,origem,colaborador_id,criado_em,atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
    .run(randomUUID(), empresaId, colab.nome, colab.cpf || '', colab.loja_id, 'ativo', 'alpha-estagio', colab.id);
}

async function prever(empresaId) {
  const m = await mapaErp();
  let estagio = new Set(); try { estagio = await cpfsEstagio(); } catch (e) { /* grupo indisponível: segue sem marcar */ }
  const colabs = db.prepare(`SELECT id, nome, cpf, ativo, is_estagiario, loja_id FROM colaboradores WHERE empresa_id=?`).all(empresaId);
  const aDesativar = [], aReativar = [], semVinculo = [], aMarcarEstagio = [];
  let matchAtivo = 0, matchInativo = 0;
  colabs.forEach(c => {
    const cp = dig(c.cpf);
    if (cp && estagio.has(cp) && !c.is_estagiario) aMarcarEstagio.push({ id: c.id, nome: c.nome, cpf: c.cpf });
    if (cp && cp in m) {
      if (m[cp]) { matchAtivo++; if (!c.ativo) aReativar.push({ id: c.id, nome: c.nome, cpf: c.cpf }); }
      else { matchInativo++; if (c.ativo) aDesativar.push({ id: c.id, nome: c.nome, cpf: c.cpf }); }
    } else semVinculo.push({ id: c.id, nome: c.nome, cpf: c.cpf });
  });
  // A IMPORTAR: ativos no ERP (por CPF) que ainda não existem no app. Loja sugerida pela unidade do
  // ERP (senão Escritório); função padrão "Operador de Loja" (o ERP não traz função confiável) — o RH
  // revisa/ativa depois. Entram INATIVOS e sem login.
  let aImportar = [];
  try {
    const ativos = await usuariosAtivosErp();
    const appCpfs = new Set(colabs.map(c => dig(c.cpf)).filter(Boolean));
    const lojasApp = db.prepare(`SELECT id, nome, erp_unidadenegocio_id FROM lojas WHERE empresa_id=?`).all(empresaId);
    const lojaPorUni = new Map(lojasApp.filter(l => l.erp_unidadenegocio_id != null).map(l => [Number(l.erp_unidadenegocio_id), l]));
    const esc = lojasApp.find(l => l.id === 'loja-escritorio') || lojasApp[0];
    for (const u of ativos) {
      if (!u.cpf || appCpfs.has(u.cpf)) continue;
      const loja = (u.uni != null && lojaPorUni.get(Number(u.uni))) || esc;
      aImportar.push({ pessoaid: u.pessoaid, nome: limpaNome(u.nome) || ('Pessoa ' + u.pessoaid), cpf: u.cpf,
        loja_id: loja ? loja.id : null, loja_nome: loja ? loja.nome : '—',
        funcao_id: 'func-operador-loja', funcao_nome: 'Operador de Loja' });
    }
  } catch (e) { /* ERP indisponível: segue sem importar */ }
  return { total: colabs.length, matchAtivo, matchInativo, aDesativar, aReativar, semVinculo: semVinculo.length, semVinculoLista: semVinculo, aMarcarEstagio, aImportar };
}

// Importa (cria) os colaboradores "a importar": INATIVOS (ativo=0) e sem login (senha aleatória).
// O RH revisa loja/função e ativa depois. Idempotente (não recria quem já existe por CPF).
async function importar(empresaId, selecao) {
  const p = await prever(empresaId);
  let lista = p.aImportar || [];
  // Seleção opcional do RH: só importa os pessoaids escolhidos, com a loja/função que ele ajustou.
  if (Array.isArray(selecao) && selecao.length) {
    const byId = new Map(selecao.map(s => [String(s.pessoaid), s]));
    lista = lista.filter(u => byId.has(String(u.pessoaid))).map(u => {
      const s = byId.get(String(u.pessoaid));
      return { ...u, loja_id: s.loja_id || u.loja_id, funcao_id: s.funcao_id || u.funcao_id };
    });
  }
  if (!lista.length) return { importados: 0, lista: [] };
  const bcrypt = require('bcryptjs');
  const senhaHash = bcrypt.hashSync(randomUUID(), 8); // aleatória: não logam até o RH resetar
  const jaCpf = db.prepare(`SELECT id FROM colaboradores WHERE cpf=? AND cpf IS NOT NULL AND cpf<>''`);
  const jaPessoa = db.prepare(`SELECT id FROM colaboradores WHERE erp_pessoa_id=?`);
  const ins = db.prepare(`INSERT INTO colaboradores
    (id,empresa_id,loja_id,funcao_id,departamento,situacao,nome,cpf,email,salario,senha_hash,senha_provisoria,ativo,admissao,erp_pessoa_id,origem_erp,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,0,?,1,0,'2020-01-01',?,1,datetime('now'))`);
  let n = 0; const feitos = [];
  const tx = db.transaction(() => {
    for (const u of lista) {
      if ((u.cpf && jaCpf.get(u.cpf)) || jaPessoa.get(u.pessoaid)) continue;
      ins.run(randomUUID(), empresaId, u.loja_id, u.funcao_id, 'Operação', 'inativo', u.nome, u.cpf || null,
        'erp-' + u.pessoaid + '@grupomutti.local', senhaHash, u.pessoaid);
      n++; feitos.push(u.nome);
    }
  });
  tx();
  return { importados: n, lista: feitos };
}

// Aplica: desativa os inativos-no-ERP. reativar=true também reativa os que voltaram a ser ativos no ERP.
// Sempre marca como estagiário (is_estagiario=1 + cria ficha) quem está no grupo "ESTAGIO" do ERP.
async function aplicar(empresaId, { reativar = false } = {}) {
  const p = await prever(empresaId);
  const upd = db.prepare(`UPDATE colaboradores SET ativo=? WHERE id=? AND empresa_id=?`);
  const marcarEst = db.prepare(`UPDATE colaboradores SET is_estagiario=1 WHERE id=? AND empresa_id=?`);
  const colabById = {}; db.prepare(`SELECT id, nome, cpf, loja_id FROM colaboradores WHERE empresa_id=?`).all(empresaId).forEach(c => { colabById[c.id] = c; });
  const tx = db.transaction(() => {
    p.aDesativar.forEach(c => upd.run(0, c.id, empresaId));
    if (reativar) p.aReativar.forEach(c => upd.run(1, c.id, empresaId));
    p.aMarcarEstagio.forEach(c => { marcarEst.run(c.id, empresaId); if (colabById[c.id]) criarFichaEstagio(empresaId, colabById[c.id]); });
  });
  tx();
  return { desativados: p.aDesativar.length, reativados: reativar ? p.aReativar.length : 0, marcadosEstagio: p.aMarcarEstagio.length, aDesativar: p.aDesativar, aReativar: reativar ? p.aReativar : [], aMarcarEstagio: p.aMarcarEstagio };
}

// Marca automaticamente (sem mexer em ativo/inativo) todo colaborador cujo CPF está no grupo
// "ESTAGIO" do ERP e ainda não é estagiário, criando a ficha. Seguro (só adiciona). Pro job diário.
async function marcarEstagioAuto(empresaId) {
  let estagio; try { estagio = await cpfsEstagio(); } catch (e) { return { marcados: 0, erro: e.message }; }
  if (!estagio.size) return { marcados: 0 };
  const colabs = db.prepare(`SELECT id, nome, cpf, loja_id, is_estagiario FROM colaboradores WHERE empresa_id=?`).all(empresaId);
  const marcar = db.prepare(`UPDATE colaboradores SET is_estagiario=1 WHERE id=? AND empresa_id=?`);
  let n = 0;
  const tx = db.transaction(() => {
    for (const c of colabs) {
      const cp = dig(c.cpf);
      if (cp && estagio.has(cp) && !c.is_estagiario) { marcar.run(c.id, empresaId); criarFichaEstagio(empresaId, c); n++; }
    }
  });
  tx();
  return { marcados: n };
}

module.exports = { prever, aplicar, cpfsEstagio, marcarEstagioAuto, importar };
