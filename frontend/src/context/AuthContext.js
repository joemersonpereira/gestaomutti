import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API = axios.create({ baseURL: '/api' });

// Interceptor — adiciona token em todas as requisições
API.interceptors.request.use(config => {
  const token = localStorage.getItem('mutti_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Interceptor — trata token expirado
API.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('mutti_token');
      localStorage.removeItem('mutti_usuario');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('mutti_token');
    const usuarioSalvo = localStorage.getItem('mutti_usuario');
    if (token && usuarioSalvo) {
      setUsuario(JSON.parse(usuarioSalvo));
      // Valida token no servidor
      API.get('/auth/me')
        .then(res => setUsuario(res.data.usuario))
        .catch(() => logout())
        .finally(() => setCarregando(false));
    } else {
      setCarregando(false);
    }
  }, []);

  async function login(email, senha) {
    const res = await API.post('/auth/login', { email, senha });
    const { token, usuario } = res.data;
    localStorage.setItem('mutti_token', token);
    localStorage.setItem('mutti_usuario', JSON.stringify(usuario));
    setUsuario(usuario);
    return usuario;
  }

  async function trocarSenha(senhaAtual, novaSenha) {
    await API.post('/auth/trocar-senha', { senha_atual: senhaAtual, nova_senha: novaSenha });
    const novoUsuario = { ...usuario, senha_provisoria: false };
    setUsuario(novoUsuario);
    localStorage.setItem('mutti_usuario', JSON.stringify(novoUsuario));
  }

  function logout() {
    API.post('/auth/logout').catch(() => {});
    localStorage.removeItem('mutti_token');
    localStorage.removeItem('mutti_usuario');
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, login, logout, trocarSenha, carregando, API }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export { API };
