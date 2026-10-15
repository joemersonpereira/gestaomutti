// backup.js — copia segura do banco (backup nativo do SQLite, funciona com o sistema em uso).
// Gera backend/backups/mutti-AAAA-MM-DD_HH-MM.db, mantém os 30 mais recentes
// e, SE configurado no .env, envia a cópia por e-mail (anexo).
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const backendRoot = path.resolve(__dirname, '..', '..'); // .../backend
require('dotenv').config({ path: path.join(backendRoot, '.env') });

const dbPath = path.resolve(backendRoot, process.env.DB_PATH || './db/mutti.db');
const backupDir = path.join(backendRoot, 'backups');
fs.mkdirSync(backupDir, { recursive: true });

function log(linha) {
  try { fs.appendFileSync(path.join(backupDir, '_log.txt'), linha + '\n'); } catch (e) { /* */ }
}

const now = new Date();
const p = n => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}`;

if (!fs.existsSync(dbPath)) {
  console.error('Banco nao encontrado em: ' + dbPath);
  log(`${stamp}  ERRO  banco nao encontrado (${dbPath})`);
  process.exit(1);
}

const dest = path.join(backupDir, `mutti-${stamp}.db`);

// Envia o backup por e-mail, se houver configuracao no .env. Nunca derruba o backup local.
async function enviarEmail() {
  const to = process.env.BACKUP_EMAIL_TO;
  const host = process.env.SMTP_HOST;
  if (!to || !host) return; // e-mail nao configurado -> ignora
  let nodemailer;
  try { nodemailer = require('nodemailer'); }
  catch (e) { console.warn('nodemailer nao instalado - rode: npm install nodemailer'); log(`${stamp}  EMAIL ignorado (nodemailer nao instalado)`); return; }

  const tamMB = fs.statSync(dest).size / (1024 * 1024);
  if (tamMB > 24) { console.warn(`Backup com ${tamMB.toFixed(1)} MB - grande demais p/ e-mail; so salvo localmente.`); log(`${stamp}  EMAIL pulado (anexo ${tamMB.toFixed(1)}MB > 24MB)`); return; }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `Backup Sistema Mutti - ${stamp}`,
    text: `Backup automatico do Sistema Grupo Mutti gerado em ${stamp}.\nArquivo do banco em anexo.`,
    attachments: [{ filename: path.basename(dest), path: dest }],
  });
  console.log('Backup enviado por e-mail para ' + to);
  log(`${stamp}  EMAIL enviado para ${to}`);
}

const db = new Database(dbPath);
db.backup(dest)
  .then(async () => {
    db.close();
    console.log('Backup criado: ' + dest);
    log(`${stamp}  OK    ${path.basename(dest)}`);
    try {
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('mutti-') && f.endsWith('.db'))
        .map(f => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      files.slice(30).forEach(x => { try { fs.unlinkSync(path.join(backupDir, x.f)); } catch (e) { /* */ } });
    } catch (e) { /* */ }
    try { await enviarEmail(); }
    catch (e) { console.error('Falha ao enviar e-mail (backup local OK):', e.message); log(`${stamp}  EMAIL erro: ${e.message}`); }
    process.exit(0);
  })
  .catch(err => {
    db.close();
    console.error('Erro no backup:', err.message);
    log(`${stamp}  ERRO  ${err.message}`);
    process.exit(1);
  });
