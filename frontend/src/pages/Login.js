import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login({ onLogin }) {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', senha: '' });
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const usuario = await login(form.email, form.senha);
      onLogin(usuario);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao conectar. Verifique sua conexão.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="lg-bg">
      <style>{CSS}</style>
      <div className="lg-card">
        {/* Painel da marca */}
        <aside className="lg-brand">
          <div className="lg-brand-top" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
            <img src="/logo-mutti-white.svg" alt="Grupo Mutti" style={{ height: 42, maxWidth: '85%' }} />
            <div className="lg-brand-sub">Sistema de Gestão</div>
          </div>
          <div className="lg-brand-mid">
            <span className="lg-eyebrow">✦ Gestão com dados ao vivo</span>
            <h2>Gestão inteligente para<br />resultados extraordinários</h2>
            <p>Do balcão à diretoria, em tempo real — para decidir com segurança.</p>
            <div className="lg-hero" aria-hidden="true">
              <div className="lg-mock">
                <div className="lg-mock-top"><i /><i /><i /></div>
                <div className="lg-mock-stat">
                  <b>R$ 1,24M</b>
                  <em>Vendas do mês · +12%</em>
                </div>
                <div className="lg-bars">
                  <span style={{ height: '42%' }} /><span style={{ height: '64%' }} />
                  <span style={{ height: '53%' }} /><span style={{ height: '81%' }} />
                  <span style={{ height: '70%' }} /><span style={{ height: '96%' }} />
                </div>
              </div>
              <span className="lg-pill lg-pill-1">📊 Vendas</span>
              <span className="lg-pill lg-pill-2">💳 Financeiro</span>
              <span className="lg-pill lg-pill-3">🛒 Compras</span>
              <span className="lg-pill lg-pill-4">👥 RH</span>
            </div>
          </div>
          <div className="lg-brand-foot">Mutti · Ultra · Farma Rocha · Posto de Medicamentos</div>
          <span className="lg-glow lg-glow-1" aria-hidden="true" />
          <span className="lg-glow lg-glow-2" aria-hidden="true" />
        </aside>

        {/* Formulário */}
        <main className="lg-form-wrap">
          <div className="lg-logo-mobile" aria-hidden="true">
            <img src="/logo-mutti-color.svg" alt="Grupo Mutti" style={{ height: 28 }} />
          </div>
          <h1 className="lg-title">Bem-vindo de volta</h1>
          <p className="lg-subtitle">Entre com sua conta para acessar o painel.</p>

          <form onSubmit={handleSubmit} className="lg-form" noValidate>
            {erro && <div className="lg-erro" role="alert">⚠️ {erro}</div>}

            <label className="lg-label" htmlFor="lg-email">E-mail</label>
            <input
              id="lg-email" type="email" className="lg-input" placeholder="seu@email.com"
              value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              required autoFocus autoComplete="username"
            />

            <label className="lg-label" htmlFor="lg-senha">Senha</label>
            <div className="lg-senha">
              <input
                id="lg-senha" type={mostrarSenha ? 'text' : 'password'} className="lg-input" placeholder="••••••••"
                value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })}
                required autoComplete="current-password"
              />
              <button type="button" className="lg-olho" onClick={() => setMostrarSenha(!mostrarSenha)}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'} title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}>
                {mostrarSenha ? '🙈' : '👁️'}
              </button>
            </div>

            <button type="submit" className="lg-btn" disabled={carregando}>
              {carregando ? <span className="lg-spin" /> : null}
              {carregando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <div className="lg-rodape">🔒 Conexão segura · acesso restrito à equipe</div>
        </main>
      </div>
    </div>
  );
}

const CSS = `
.lg-bg{min-height:100vh;background:#fff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;box-sizing:border-box;}
.lg-bg *{box-sizing:border-box;}
.lg-card{width:100%;min-height:100vh;display:grid;grid-template-columns:1.05fr 1fr;background:#fff;overflow:hidden;}
/* Painel da marca */
.lg-brand{position:relative;padding:38px 36px;color:#eafff6;display:flex;flex-direction:column;overflow:hidden;
  background:linear-gradient(150deg,#0E7C5A 0%,#0B6B6E 55%,#0C5A86 100%);}
.lg-brand-top{display:flex;align-items:center;gap:12px;z-index:1;}
.lg-logo{width:52px;height:52px;border-radius:15px;display:flex;align-items:center;justify-content:center;
  background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);backdrop-filter:blur(4px);}
.lg-brand-name{font-size:19px;font-weight:800;color:#fff;letter-spacing:.2px;}
.lg-brand-sub{font-size:12.5px;color:rgba(255,255,255,.72);margin-top:1px;}
.lg-brand-mid{flex:1;display:flex;flex-direction:column;justify-content:center;z-index:1;}
.lg-eyebrow{display:inline-block;align-self:flex-start;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#9dffdb;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);padding:6px 13px;border-radius:999px;margin-bottom:18px;}
.lg-brand-mid h2{font-size:38px;line-height:1.1;font-weight:800;color:#fff;margin:0 0 14px;letter-spacing:-.8px;}
.lg-brand-mid p{font-size:15px;line-height:1.55;color:rgba(255,255,255,.82);margin:0;max-width:400px;}
/* Composição hero: mock do painel + badges flutuantes */
.lg-hero{position:relative;flex:1;min-height:300px;margin-top:26px;display:flex;align-items:center;justify-content:center;}
.lg-mock{width:320px;max-width:80%;background:linear-gradient(160deg,#ffffff,#f3f8f6);border-radius:20px;
  padding:20px 20px 22px;box-shadow:0 30px 60px -22px rgba(3,30,24,.55),0 6px 18px -8px rgba(3,30,24,.3);
  transform:rotate(-2deg);}
.lg-mock-top{display:flex;gap:6px;margin-bottom:16px;}
.lg-mock-top i{width:9px;height:9px;border-radius:50%;background:#d6e3de;}
.lg-mock-top i:first-child{background:#0E7C5A;}
.lg-mock-stat b{display:block;font-size:26px;font-weight:800;color:#13233a;letter-spacing:-.02em;line-height:1;}
.lg-mock-stat em{display:block;font-size:12px;font-style:normal;color:#1d9e6e;font-weight:600;margin-top:5px;}
.lg-bars{display:flex;align-items:flex-end;gap:8px;height:84px;margin-top:18px;}
.lg-bars span{flex:1;border-radius:6px 6px 3px 3px;background:linear-gradient(180deg,#19a177,#0E7C5A);opacity:.92;}
.lg-bars span:last-child{background:linear-gradient(180deg,#1fc993,#17a37a);box-shadow:0 6px 14px -4px rgba(14,124,90,.6);}
.lg-pill{position:absolute;display:inline-flex;align-items:center;gap:7px;color:#fff;font-size:13px;font-weight:700;
  padding:10px 15px;border-radius:999px;white-space:nowrap;border:1px solid rgba(255,255,255,.22);
  box-shadow:0 14px 30px -10px rgba(3,30,24,.6);backdrop-filter:blur(2px);}
.lg-pill-1{top:2%;right:4%;transform:rotate(-5deg);background:linear-gradient(135deg,#0E7C5A,#0C6A7E);animation:lgfloat 5.5s ease-in-out infinite;}
.lg-pill-2{top:33%;left:-2%;transform:rotate(4deg);background:linear-gradient(135deg,#0C6A7E,#0C5A86);animation:lgfloat 6.5s ease-in-out infinite .4s;}
.lg-pill-3{bottom:12%;left:5%;transform:rotate(-3deg);background:linear-gradient(135deg,#B45309,#92400E);animation:lgfloat 6s ease-in-out infinite .8s;}
.lg-pill-4{bottom:3%;right:8%;transform:rotate(5deg);background:linear-gradient(135deg,#0C5A86,#0E7C5A);animation:lgfloat 5.8s ease-in-out infinite .2s;}
@keyframes lgfloat{0%,100%{transform:translateY(0) rotate(var(--r,0deg));}50%{transform:translateY(-9px) rotate(var(--r,0deg));}}
.lg-pill-1{--r:-5deg;}.lg-pill-2{--r:4deg;}.lg-pill-3{--r:-3deg;}.lg-pill-4{--r:5deg;}
.lg-brand::after{content:"";position:absolute;right:-70px;bottom:34px;width:440px;height:84px;background:url(/logo-mutti-white.svg) no-repeat right center/contain;opacity:.06;z-index:0;pointer-events:none;}
.lg-brand-foot{margin-top:28px;z-index:1;font-size:11.5px;color:rgba(255,255,255,.62);letter-spacing:.3px;
  padding-top:16px;border-top:1px solid rgba(255,255,255,.16);}
.lg-glow{position:absolute;border-radius:50%;filter:blur(10px);opacity:.5;z-index:0;}
.lg-glow-1{width:260px;height:260px;right:-90px;top:-70px;background:radial-gradient(circle,rgba(255,255,255,.35),transparent 65%);}
.lg-glow-2{width:200px;height:200px;left:-70px;bottom:-60px;background:radial-gradient(circle,rgba(120,255,214,.35),transparent 65%);}
/* Formulário */
.lg-form-wrap{padding:44px;display:flex;flex-direction:column;justify-content:center;align-items:center;}
.lg-form-wrap>*{width:100%;max-width:400px;}
.lg-logo-mobile{display:none;align-items:center;gap:8px;font-size:16px;color:#0E7C5A;margin-bottom:18px;}
.lg-title{font-size:23px;font-weight:800;color:#13233a;margin:0 0 4px;letter-spacing:-.3px;}
.lg-subtitle{font-size:13.5px;color:#64748b;margin:0 0 22px;}
.lg-form{display:flex;flex-direction:column;}
.lg-label{font-size:12px;font-weight:600;color:#475569;margin:0 0 6px;}
.lg-input{width:100%;padding:12px 13px;font-size:14.5px;border:1.5px solid #e2e8f0;border-radius:11px;outline:none;
  background:#fbfcfd;color:#13233a;transition:border-color .15s,box-shadow .15s,background .15s;margin-bottom:16px;font-family:inherit;}
.lg-input::placeholder{color:#aeb8c4;}
.lg-input:focus{border-color:#0E7C5A;background:#fff;box-shadow:0 0 0 4px rgba(14,124,90,.12);}
.lg-senha{position:relative;}
.lg-senha .lg-input{padding-right:44px;}
.lg-olho{position:absolute;right:6px;top:11px;width:32px;height:32px;border:none;background:none;cursor:pointer;
  font-size:16px;border-radius:8px;line-height:1;display:flex;align-items:center;justify-content:center;}
.lg-olho:hover{background:#f1f5f9;}
.lg-btn{margin-top:6px;width:100%;padding:13px;font-size:15px;font-weight:700;color:#fff;border:none;border-radius:11px;
  cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;letter-spacing:.2px;
  background:linear-gradient(135deg,#0E7C5A,#0C6A7E);box-shadow:0 10px 20px -8px rgba(14,124,90,.55);
  transition:transform .08s,box-shadow .15s,opacity .15s;}
.lg-btn:hover:not(:disabled){box-shadow:0 14px 26px -8px rgba(14,124,90,.65);transform:translateY(-1px);}
.lg-btn:active:not(:disabled){transform:translateY(0);}
.lg-btn:disabled{opacity:.75;cursor:default;}
.lg-spin{width:15px;height:15px;border:2.5px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:lgspin .7s linear infinite;}
@keyframes lgspin{to{transform:rotate(360deg);}}
.lg-erro{background:#fdecec;border:1px solid #f5c6c6;border-radius:10px;padding:10px 12px;margin-bottom:16px;font-size:13px;color:#9a3412;}
.lg-rodape{text-align:center;font-size:11.5px;color:#9aa6b2;margin-top:24px;}
/* Responsivo */
@media (max-width:760px){
  .lg-card{grid-template-columns:1fr;max-width:420px;min-height:0;}
  .lg-brand{display:none;}
  .lg-form-wrap{padding:30px 26px 26px;}
  .lg-logo-mobile{display:flex;}
}
@media (prefers-reduced-motion:reduce){.lg-btn,.lg-spin,.lg-pill{transition:none;animation:none;}}
`;
