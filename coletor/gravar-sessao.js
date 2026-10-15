// gravar-sessao.js — abre o portal da operadora num navegador NORMAL (visível) para VOCÊ logar
// à mão, uma única vez. Quando você fecha, a sessão fica salva em sessoes/<operadora>.json e o
// robô passa a entrar sozinho, sem senha e sem esbarrar em token por SMS ou captcha.
//
//   npm run gravar -- alelo
//
// Nada do que você digita passa por mim: o navegador é seu, a senha vai direto para a operadora e
// o que fica gravado é só o cookie de sessão que o site devolve.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { RECEITAS } = require('./receitas');

const DIR_SESSOES = path.join(__dirname, 'sessoes');

(async () => {
  const nome = (process.argv[2] || '').toLowerCase();
  const receita = RECEITAS[nome];
  if (!receita) {
    console.log('Uso: npm run gravar -- <operadora>');
    console.log('Operadoras configuradas:', Object.keys(RECEITAS).join(', '));
    process.exit(1);
  }
  fs.mkdirSync(DIR_SESSOES, { recursive: true });
  const arquivoSessao = path.join(DIR_SESSOES, nome + '.json');

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  Gravando a sessão de: ' + receita.operadora);
  console.log('════════════════════════════════════════════════════════');
  console.log('  1. Vou abrir o portal: ' + receita.url);
  console.log('  2. FAÇA O LOGIN normalmente (inclusive o código por SMS, se pedir).');
  console.log('  3. Navegue até a tela do relatório de vendas — a mesma que você usa hoje.');
  console.log('  4. Volte aqui e aperte ENTER. Aí eu salvo a sessão e fecho o navegador.\n');
  console.log('  Se marcar "manter conectado" no site, a sessão dura mais.\n');

  const navegador = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const contexto = await navegador.newContext({ viewport: null, acceptDownloads: true });
  const pagina = await contexto.newPage();
  await pagina.goto(receita.url, { waitUntil: 'domcontentloaded' }).catch(e => console.log('  (aviso ao abrir: ' + e.message + ')'));

  // Espera o login SOZINHO: enquanto a tela de senha estiver na frente, nada é salvo. Assim que
  // o portal aparecer (menu carregado, sem campo de senha) e ficar estável, grava e fecha.
  // Quem estiver no terminal também pode apertar ENTER para gravar na hora.
  await new Promise(ok => {
    let encerrado = false;
    const terminar = motivo => { if (!encerrado) { encerrado = true; console.log('\n  → ' + motivo); ok(); } };
    process.stdin.resume();
    process.stdin.once('data', () => terminar('gravando (ENTER)'));

    let estavel = 0;
    const olhar = setInterval(async () => {
      if (encerrado) return clearInterval(olhar);
      try {
        const temSenha = await pagina.locator('input[type="password"]').count();
        const url = pagina.url();
        const logado = !temSenha && /userede|relatorio|home|dashboard/i.test(url);
        estavel = logado ? estavel + 1 : 0;
        if (estavel === 1) console.log('  · login detectado, confirmando…');
        if (estavel >= 4) { clearInterval(olhar); terminar('login confirmado — gravando a sessão'); }
      } catch { /* navegando: tenta de novo no próximo ciclo */ }
    }, 4000);

    setTimeout(() => { clearInterval(olhar); terminar('tempo esgotado (15 min) — gravando o que houver'); }, 15 * 60 * 1000);
  });

  const urlFinal = pagina.url();
  await contexto.storageState({ path: arquivoSessao });
  await navegador.close();

  // guarda também onde você parou: é a tela do relatório que o robô vai abrir direto
  const marcadores = path.join(DIR_SESSOES, nome + '.destino.json');
  fs.writeFileSync(marcadores, JSON.stringify({ urlRelatorio: urlFinal, gravadoEm: new Date().toISOString() }, null, 2));

  console.log('\n✅ Sessão salva em: ' + arquivoSessao);
  console.log('   Tela do relatório: ' + urlFinal);
  console.log('\n   Guarde a pasta "sessoes" como se fosse sua senha — ela dá acesso ao portal.');
  console.log('   Agora teste a coleta:  npm run coletar -- ' + nome + '\n');
  process.exit(0);
})();
