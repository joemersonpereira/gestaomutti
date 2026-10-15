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
    <div style={styles.bg}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>🏪</div>
          <div style={styles.logoNome}>Grupo Mutti</div>
          <div style={styles.logoSub}>Sistema de Gestão</div>
        </div>

        <form onSubmit={handleSubmit}>
          {erro && <div style={styles.erro}>{erro}</div>}

          <div style={styles.field}>
            <label style={styles.label}>E-mail</label>
            <input
              type="email"
              style={styles.input}
              placeholder="seu@email.com"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div style={styles.field}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={styles.label}>Senha</label>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={mostrarSenha ? 'text' : 'password'}
                style={{ ...styles.input, paddingRight: 40 }}
                placeholder="••••••••"
                value={form.senha}
                onChange={e => setForm({ ...form, senha: e.target.value })}
                required
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                style={styles.btnOlho}
              >
                {mostrarSenha ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            style={{ ...styles.btnPrimario, opacity: carregando ? 0.7 : 1 }}
            disabled={carregando}
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div style={styles.rodape}>
          🔒 Conexão segura · Grupo Mutti v1.0
        </div>
      </div>
    </div>
  );
}

const styles = {
  bg: {
    minHeight: '100vh', background: '#f5f5f5',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  card: {
    background: '#fff', borderRadius: 16, padding: '2rem 1.5rem',
    maxWidth: 400, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  },
  logo: { textAlign: 'center', marginBottom: 28 },
  logoIcon: {
    width: 60, height: 60, borderRadius: 14, background: '#E6F1FB',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 28, margin: '0 auto 10px',
  },
  logoNome: { fontSize: 20, fontWeight: 700, color: '#1A3A6E' },
  logoSub: { fontSize: 13, color: '#888', marginTop: 2 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 12, color: '#666', marginBottom: 4 },
  input: {
    width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid #ddd',
    borderRadius: 8, outline: 'none', boxSizing: 'border-box',
    fontFamily: 'system-ui, sans-serif',
  },
  btnOlho: {
    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
  },
  btnPrimario: {
    width: '100%', padding: '10px', background: '#111', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', marginTop: 6,
  },
  erro: {
    background: '#FCEBEB', border: '1px solid #F5C6C6', borderRadius: 8,
    padding: '8px 12px', marginBottom: 14, fontSize: 13, color: '#993C1D',
  },
  rodape: { textAlign: 'center', fontSize: 11, color: '#aaa', marginTop: 20 },
};
