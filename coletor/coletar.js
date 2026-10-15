// coletar.js — entra no portal com a sessão já gravada, baixa o relatório do dia e manda
// para a Conciliação de Cartões. É este que a tarefa agendada roda toda manhã.
//
//   npm run coletar                 → todas as operadoras configuradas, movimento de ontem
//   npm run coletar -- alelo        → só a Alelo
//   npm run coletar -- alelo 2026-08-20            → um dia específico
//   npm run coletar -- alelo 2026-08-01 2026-08-20 → um período
//   npm run coletar -- --ver        → mostra o navegador (para você ver onde travou)
//
// Se a sessão do portal tiver expirado, ele NÃO tenta adivinhar senha: avisa que é preciso
// rodar `npm run gravar` de novo. Nenhuma credencial de operadora vive neste projeto.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { chromium } = require('playwright');
const { RECEITAS } = require('./receitas');

const DIR_SESSOES = path.join(__dirname, 'sessoes');
const DIR_BAIXADOS = path.join(__dirname, 'baixados');
const DIR_LOGS = path.join(__dirname, 'logs');

const CFG = {
  api: process.env.COLETOR_API || 'http://localhost:3001/api',
  email: process.env.COLETOR_EMAIL,          // usuário do SISTEMA (não da operadora)
  senha: process.env.COLETOR_SENHA,
  timeout: parseInt(process.env.COLETOR_TIMEOUT || '60000', 10),
};

const hoje = () => new Date();
const iso = d => d.toISOString().slice(0, 10);
const ontem = () => { const d = hoje(); d.setDate(d.getDate() - 1); return iso(d); };
const brDate = s => s.split('-').reverse().join('/');
const log = (...a) => { const l = `[${new Date().toISOString().slice(0, 19)}] ` + a.join(' '); console.log(l); linhasLog.push(l); };
const linhasLog = [];

// ── entra no sistema Mutti (para poder mandar o arquivo) ───────────────────
async function tokenSistema() {
  if (!CFG.email || !CFG.senha) throw new Error('Configure COLETOR_EMAIL e COLETOR_SENHA no .env (usuário do sistema Mutti com perfil Tesouraria).');
  const r = await axios.post(CFG.api + '/auth/login', { email: CFG.email, senha: CFG.senha });
  return r.data.token;
}

// ── manda o arquivo baixado para a Conciliação ─────────────────────────────
// destino 'vendas' = confronto com o ERP · 'repasse' = conferência do que a credenciadora pagou
async function enviarAoSistema(token, arquivo, lojaId, destino = 'vendas') {
  const conteudo = fs.readFileSync(arquivo).toString('base64');
  const rota = destino === 'repasse' ? '/conciliacao-cartao/repasses/importar' : '/conciliacao-cartao/importar';
  const r = await axios.post(CFG.api + rota,
    { conteudo, nome: path.basename(arquivo), loja: lojaId || null },
    { headers: { Authorization: 'Bearer ' + token }, maxBodyLength: Infinity, maxContentLength: Infinity });
  return r.data;
}

// ── período no portal da Rede ──────────────────────────────────────────────
// O chip de datas abre um calendário que é web component com shadow DOM: dois meses lado a lado
// (#firstDatePicker e #lastDatePicker) e cada dia é um <range-datepicker-cell>, sem atributo no
// HTML — o dia e o mês vivem em propriedades JS (day.title e month). Por isso o clique é dado
// pelo próprio navegador, procurando a célula certa dentro dos shadow roots.
const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
// "2026-07-01" → /01 de julho de 2026/ — é assim que o portal rotula cada dia para leitores de tela
const rotuloDia = iso => {
  const [a, m, d] = iso.split('-');
  return new RegExp(`${d} de ${MESES_PT[Number(m) - 1]} de ${a}`, 'i');
};

async function periodoRede(pagina, ini, fim, timeout) {
  const [aIni, mIni, dIni] = ini.split('-');
  const [aFim, mFim, dFim] = fim.split('-');

  await pagina.getByRole('button', { name: /^de .+ até .+$/ }).click();
  await pagina.waitForTimeout(1500);

  // Caminho principal: cada dia tem rótulo de acessibilidade ("quarta-feira, 01 de julho de 2026"),
  // então dá para mirar pelo nome — bem mais estável que caçar a célula pela posição.
  const porRotulo = async () => {
    for (let tentativa = 0; tentativa < 14; tentativa++) {
      const alvo = pagina.getByRole('button', { name: rotuloDia(ini) }).first();
      if (await alvo.count() && await alvo.isVisible().catch(() => false)) {
        await alvo.click();
        await pagina.waitForTimeout(700);
        const alvoFim = pagina.getByRole('button', { name: rotuloDia(fim) }).first();
        if (await alvoFim.count()) { await alvoFim.click(); await pagina.waitForTimeout(700); return true; }
        return false;
      }
      // mês não está à vista: volta um mês e tenta de novo
      const seta = pagina.getByRole('button', { name: /anterior|previous|voltar/i }).first();
      if (await seta.count()) await seta.click().catch(() => {});
      else await pagina.locator('.tag-datepicker itau-icon, .tag-datepicker button').first().click().catch(() => {});
      await pagina.waitForTimeout(700);
    }
    return false;
  };

  if (await porRotulo()) {
    await pagina.getByRole('button', { name: /^aplicar$/i }).click();
    await pagina.waitForTimeout(3000);
    return `período ${ini}→${fim} (por rótulo)`;
  }
  // se o portal mudar os rótulos, cai no caminho antigo (pelas propriedades da célula)

  // navega os meses até o mês inicial aparecer no calendário da esquerda (no máx. 24 passos)
  const mesEsquerda = async () => pagina.evaluate(() => {
    const achar = (tag, raiz = document, out = []) => {
      for (const el of raiz.querySelectorAll('*')) {
        if (el.tagName.toLowerCase() === tag) out.push(el);
        if (el.shadowRoot) achar(tag, el.shadowRoot, out);
      }
      return out;
    };
    const cal = achar('range-datepicker-calendar').find(c => c.id === 'firstDatePicker');
    const cell = cal && achar('range-datepicker-cell', cal.shadowRoot || cal)[0];
    return cell ? String(cell.month) : null;
  });
  for (let i = 0; i < 24; i++) {
    const atual = await mesEsquerda();
    if (atual === mIni) break;
    const voltar = !atual || Number(atual) > Number(mIni);
    await pagina.locator('.tag-datepicker itau-icon, .tag-datepicker button').nth(voltar ? 0 : 1).click().catch(() => {});
    await pagina.waitForTimeout(600);
  }

  // clica no dia de início e no de fim, cada um no seu calendário
  const clicarDia = (qual, dia, mes) => pagina.evaluate(({ qual, dia, mes }) => {
    const achar = (tag, raiz = document, out = []) => {
      for (const el of raiz.querySelectorAll('*')) {
        if (el.tagName.toLowerCase() === tag) out.push(el);
        if (el.shadowRoot) achar(tag, el.shadowRoot, out);
      }
      return out;
    };
    const cals = achar('range-datepicker-calendar');
    const cal = cals.find(c => c.id === qual) || cals[qual === 'firstDatePicker' ? 0 : 1];
    if (!cal) return 'calendário não encontrado';
    const alvo = achar('range-datepicker-cell', cal.shadowRoot || cal)
      .find(c => c.day && Number(c.day.title) === Number(dia) && String(c.month) === String(mes));
    if (!alvo) return 'dia não encontrado';
    (alvo.shadowRoot?.querySelector('div,span,button') || alvo).click();
    return 'ok';
  }, { qual, dia, mes });

  const r1 = await clicarDia('firstDatePicker', dIni, mIni);
  await pagina.waitForTimeout(800);
  // se o fim é do mesmo mês, ele está no calendário da esquerda
  const r2 = await clicarDia(mFim === mIni ? 'firstDatePicker' : 'lastDatePicker', dFim, mFim);
  await pagina.waitForTimeout(800);

  await pagina.getByText('aplicar', { exact: true }).click();
  await pagina.waitForTimeout(3000);
  return `período ${ini}→${fim} (${r1}/${r2})`;
}

// ── troca de estabelecimento (a mesma conta atende vários grupos/CNPJs) ────
// Caminho no portal: menu do usuário (canto direito) → "trocar o estabelecimento" → busca →
// marca o grupo → "aplicar". Sem isso, só sai o grupo que estiver selecionado na conta.
async function trocarEstabelecimento(pagina, numero) {
  await pagina.locator('header button, [class*="perfil"], [class*="profile"]').last().click().catch(() => {});
  await pagina.waitForTimeout(1200);
  await pagina.getByText(/trocar o estabelecimento/i).click();
  await pagina.waitForTimeout(1500);

  const busca = pagina.getByPlaceholder(/buscar estabelecimento/i);
  if (await busca.count()) { await busca.fill(String(numero)); await pagina.waitForTimeout(1500); }

  // a linha do estabelecimento traz o número entre parênteses — clica no rádio dela
  const linha = pagina.locator(`text=/\\(${numero}\\)/`).first();
  await linha.click({ timeout: 15000 });
  await pagina.waitForTimeout(800);
  await pagina.getByRole('button', { name: /^aplicar$/i }).click();
  await pagina.waitForTimeout(6000);          // a tela recarrega com o novo grupo
  return 'estabelecimento ' + numero;
}

// ── executa os passos da receita dentro do portal ──────────────────────────
async function rodarPassos(pagina, receita, ini, fim) {
  const valorDe = v => String(v)
    .replace('{DATA_INI}', brDate(ini)).replace('{DATA_FIM}', brDate(fim))
    .replace('{DATA_INI_ISO}', ini).replace('{DATA_FIM_ISO}', fim);
  let download = null;
  for (const passo of receita.passos || []) {
    const alvo = passo.seletor;
    if (passo.tipo === 'preencher') { await pagina.fill(alvo, valorDe(passo.valor)); log('   preencheu', alvo); }
    else if (passo.tipo === 'selecionar') { await pagina.selectOption(alvo, valorDe(passo.valor)); log('   selecionou', alvo); }
    else if (passo.tipo === 'clicar') { await pagina.click(alvo); log('   clicou', alvo); }
    // o portal nem sempre abre a janela de opções (depende do relatório) — estes passos não quebram
    else if (passo.tipo === 'clicar_opcional') {
      const achou = await pagina.locator(alvo).first().isVisible().catch(() => false);
      if (achou) { await pagina.click(alvo); log('   clicou (opcional)', alvo); }
    }
    // checkbox (o "INCLUIR FILIAIS" do Brasil Card) — marca só se ainda não estiver marcado
    else if (passo.tipo === 'marcar') { await pagina.check(alvo); log('   marcou', alvo); }
    else if (passo.tipo === 'desmarcar') { await pagina.uncheck(alvo); log('   desmarcou', alvo); }
    else if (passo.tipo === 'esperar') { await pagina.waitForSelector(alvo, { timeout: CFG.timeout }); }
    else if (passo.tipo === 'esperar_opcional') {
      await pagina.waitForSelector(alvo, { timeout: passo.ms || 8000 }).catch(() => log('   (opcional não apareceu:', alvo + ')'));
    }
    else if (passo.tipo === 'pausa') { await pagina.waitForTimeout(passo.ms || 2000); }
    else if (passo.tipo === 'periodo_rede') { log('   ', await periodoRede(pagina, ini, fim, CFG.timeout)); }
    else if (passo.tipo === 'baixar') {
      const [dl] = await Promise.all([
        pagina.waitForEvent('download', { timeout: CFG.timeout }),
        pagina.click(alvo),
      ]);
      download = dl; log('   baixou', dl.suggestedFilename());
    }
  }
  return download;
}

// ── uma operadora ──────────────────────────────────────────────────────────
async function coletar(nome, ini, fim, { mostrar, token }) {
  const receita = RECEITAS[nome];
  if (!receita) return { nome, ok: false, erro: 'Operadora sem receita cadastrada.' };

  const arquivoSessao = path.join(DIR_SESSOES, nome + '.json');
  if (!fs.existsSync(arquivoSessao)) {
    return { nome, ok: false, erro: `Sessão não gravada. Rode:  npm run gravar -- ${nome}` };
  }
  const destinoArq = path.join(DIR_SESSOES, nome + '.destino.json');
  const destino = fs.existsSync(destinoArq) ? JSON.parse(fs.readFileSync(destinoArq, 'utf8')) : {};
  if (!(receita.passos || []).length) {
    return { nome, ok: false, pendente: true,
      erro: 'Receita ainda sem os passos do portal (qual campo de data, qual botão baixa). Rode com --ver, me diga o que aparece e eu completo.' };
  }

  const navegador = await chromium.launch({ headless: !mostrar });
  try {
    const contexto = await navegador.newContext({ storageState: arquivoSessao, acceptDownloads: true });
    const pagina = await contexto.newPage();
    const url = destino.urlRelatorio || receita.url;
    log(' ', receita.operadora + ': abrindo', url);
    await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: CFG.timeout });

    // sessão caiu? o portal joga de volta para o login
    const pareceLogin = await pagina.locator('input[type="password"]').count().catch(() => 0);
    if (pareceLogin > 0) {
      try { fs.writeFileSync(arquivoSessao + '.EXPIRADA', new Date().toISOString()); } catch { }
      return { nome, ok: false, sessaoExpirada: true,
        erro: `A sessão do portal expirou. Rode:  npm run gravar -- ${nome}` };
    }
    try { fs.unlinkSync(arquivoSessao + '.EXPIRADA'); } catch { }   // voltou a funcionar

    // uma volta por estabelecimento (a mesma conta atende vários grupos/CNPJs); sem lista, uma volta só
    const grupos = (receita.estabelecimentos && receita.estabelecimentos.length) ? receita.estabelecimentos : [null];
    const feitos = [];
    for (const grupo of grupos) {
      if (grupo) {
        log('  ', await trocarEstabelecimento(pagina, grupo.numero || grupo));
        await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: CFG.timeout });
        await pagina.waitForTimeout(4000);
      }
      const download = await rodarPassos(pagina, receita, ini, fim);
      if (!download) { feitos.push({ grupo, ok: false, erro: 'nenhum arquivo baixado' }); continue; }

      fs.mkdirSync(DIR_BAIXADOS, { recursive: true });
      const ext = path.extname(download.suggestedFilename()) || '.xlsx';
      const sufixo = grupo ? '-' + (grupo.numero || grupo) : '';
      const destinoArquivo = path.join(DIR_BAIXADOS, `${nome}${sufixo}-${ini}${fim !== ini ? '_a_' + fim : ''}${ext}`);
      await download.saveAs(destinoArquivo);
      log('  ', receita.operadora + ': salvo em', destinoArquivo);

      const lojaId = (grupo && grupo.loja) || receita.loja || process.env['COLETOR_LOJA_' + nome.toUpperCase()] || null;
      if (!token) { feitos.push({ grupo, ok: true, arquivo: destinoArquivo, linhas: 0, resumo: {} }); continue; }
      const envio = await enviarAoSistema(token, destinoArquivo, lojaId, receita.destino);
      if (!envio.ok) { feitos.push({ grupo, ok: false, erro: envio.erro }); log('   ✗', envio.erro); continue; }

      const r = envio.resumo || {};
      log('  ', receita.operadora + (receita.destino === 'repasse'
        ? `: ${envio.qtdDepositos} depósito(s) · ${envio.qtdParcelas} parcelas · R$ ${envio.valorTotal} · ${r.naoFecham || 0} não fecham`
        : `: ${envio.linhas} transações · ${r.casados}/${r.linhasOperadora} casaram · ${r.divergencias} divergência(s)`));
      feitos.push({ grupo, ok: true, arquivo: destinoArquivo, linhas: envio.linhas, resumo: r, avisos: envio.avisos });
    }
    // Renova a sessao: o portal devolve cookie novo a cada visita, entao regravar aqui faz a
    // validade ser DESLIZANTE. Rodando todo dia, a sessao praticamente nao expira mais.
    try {
      await contexto.storageState({ path: arquivoSessao });
      log('  ', receita.operadora + ': sessão renovada');
    } catch (e) { log('   (não consegui renovar a sessão: ' + e.message + ')'); }

    const okCount = feitos.filter(f => f.ok).length;
    if (!okCount) return { nome, ok: false, erro: feitos.map(f => f.erro).filter(Boolean).join(' · ') || 'nada coletado' };
    return { nome, ok: true, grupos: feitos, linhas: feitos.reduce((s, f) => s + (f.linhas || 0), 0),
      resumo: feitos.find(f => f.ok).resumo, avisos: feitos.flatMap(f => f.avisos || []) };
  } catch (e) {
    return { nome, ok: false, erro: e.message };
  } finally {
    await navegador.close();
  }
}

// ── avisa que precisa regravar a sessao ────────────────────────────────────
// Sessao expirada nao e erro de software: e uma tarefa humana de um minuto. Em vez de ficar so
// no log (que ninguem le), abre uma tarefa no Kanban para a Tesouraria.
async function avisarSessaoExpirada(token, expirados) {
  if (!token || !expirados.length) return;
  const nomes = expirados.map(n => RECEITAS[n].operadora).join(', ');
  try {
    await axios.post(CFG.api + '/tarefas', {
      tipo: 'tarefa',
      origem: 'Coletor de cartões',
      titulo: 'Regravar a sessão de: ' + nomes,
      descricao: 'O robô não conseguiu entrar em ' + nomes + ' — a sessão do portal expirou.\n\n'
        + 'Como resolver (leva 1 minuto por portal):\n'
        + '1. Abra a pasta mutti-sistema\\coletor e rode GRAVAR-SESSAO.bat\n'
        + '2. Digite o nome do portal: ' + expirados.join(', ') + '\n'
        + '3. Faça o login normalmente (inclusive o SMS, se pedir) e navegue até a tela do relatório\n'
        + '4. Pode deixar aberto: o robô percebe, salva e fecha sozinho\n\n'
        + 'Enquanto isso, os relatórios desse portal não estão sendo baixados.',
      urgente: 1,
      sla_horas: 24,
    }, { headers: { Authorization: 'Bearer ' + token } });
    log('  → tarefa aberta no sistema: regravar a sessão de ' + nomes);
  } catch (e) {
    log('  (não consegui abrir a tarefa de aviso: ' + (e.response ? e.response.status : e.message) + ')');
  }
}

// ── principal ──────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const mostrar = process.argv.includes('--ver');
  const alvos = args[0] && RECEITAS[args[0].toLowerCase()] ? [args[0].toLowerCase()] : Object.keys(RECEITAS);
  const datas = args.filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const ini = datas[0] || ontem();
  const fim = datas[1] || ini;

  log('=== Coleta de relatórios das operadoras ·', brDate(ini) + (fim !== ini ? ' a ' + brDate(fim) : ''), '===');

  // Ainda nao ha nenhuma sessao gravada? Entao nao ha o que coletar. Sai QUIETO (codigo 0) em vez
  // de falhar todo dia as 07:00 no Agendador e encher o log de erro que ninguem pediu.
  const temSessao = fs.existsSync(DIR_SESSOES)
    && fs.readdirSync(DIR_SESSOES).some(f => f.endsWith('.json') && !f.endsWith('.destino.json'));
  if (!temSessao) {
    log('Nenhuma sessão gravada ainda — nada a coletar.');
    log('Quando quiser ligar: rode GRAVAR-SESSAO.bat e faça o login uma vez em cada portal.');
    fs.mkdirSync(DIR_LOGS, { recursive: true });
    fs.writeFileSync(path.join(DIR_LOGS, 'agendado-ultima.log'), linhasLog.join('\n'));
    process.exit(0);
  }

  const soBaixar = process.argv.includes('--so-baixar');
  let token = null;
  if (!soBaixar) {
    try { token = await tokenSistema(); }
    catch (e) { log('✗ Não consegui entrar no sistema Mutti:', e.message); log('  (rode com --so-baixar para só baixar os arquivos e importar depois)'); process.exit(1); }
  } else log('modo --so-baixar: os arquivos ficam em baixados/ e a importação é feita à parte');

  const resultados = [];
  for (const nome of alvos) resultados.push(await coletar(nome, ini, fim, { mostrar, token }));

  log('\n--- resumo ---');
  for (const r of resultados) {
    if (r.ok) log(`✅ ${RECEITAS[r.nome].operadora}: ${r.linhas} transações, ${r.resumo.divergencias} divergência(s)`);
    else if (r.pendente) log(`⏳ ${RECEITAS[r.nome].operadora}: ${r.erro}`);
    else log(`✗ ${RECEITAS[r.nome].operadora}: ${r.erro}`);
  }
  const expirados = resultados.filter(r => r.sessaoExpirada).map(r => r.nome);
  if (expirados.length) await avisarSessaoExpirada(token, expirados);

  fs.mkdirSync(DIR_LOGS, { recursive: true });
  fs.writeFileSync(path.join(DIR_LOGS, `coleta-${ini}.log`), linhasLog.join('\n'));

  const falhou = resultados.some(r => !r.ok && !r.pendente);
  process.exit(falhou ? 1 : 0);
})();
