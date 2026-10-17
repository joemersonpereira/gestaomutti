// mailer.js — envio de e-mail transacional via SMTP do .env (reusa as mesmas credenciais do backup).
const nodemailer = require('nodemailer');
let _t = null;
function getTransporter() {
  if (_t) return _t;
  if (!process.env.SMTP_HOST) return null;
  _t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return _t;
}
async function enviarEmail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) throw new Error('SMTP não configurado (.env SMTP_HOST).');
  if (!to) throw new Error('Destinatário vazio.');
  return t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html, text });
}
const smtpOk = () => !!process.env.SMTP_HOST;
module.exports = { enviarEmail, smtpOk };
