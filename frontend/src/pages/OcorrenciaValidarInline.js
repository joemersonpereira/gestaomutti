import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// Card no Kanban (origem='ocorrencia_validar'): o RH autoriza ou rejeita a ocorrência.
// Se for ADVERTÊNCIA/SUSPENSÃO, abre o editor do termo (texto editável) + exigir assinatura.
const ehAdvertencia = o => !!(o && (o.exige_termo || /advert|suspens/i.test(`${o.categoria || ''} ${o.motivo || ''}`)));
const tipoTermo = o => (o?.termo_tipo === 'suspensao' || /suspens/i.test(`${o?.categoria || ''} ${o?.motivo || ''}`)) ? 'SUSPENSÃO' : 'ADVERTÊNCIA';

function modeloTermo(o, tpl) {
  const ehSusp = o?.termo_tipo === 'suspensao' || /suspens/i.test(`${o?.categoria || ''} ${o?.motivo || ''}`);
  const base = (ehSusp ? tpl?.suspensao : tpl?.advertencia) || '';
  return base
    .replace(/\{COLABORADOR\}/g, o.colaborador_nome || '')
    .replace(/\{DATA\}/g, o.data || '')
    .replace(/\{MOTIVO\}/g, o.motivo || '')
    .replace(/\{OBS\}/g, o.obs || '[Descreva detalhadamente os fatos, data, horário e local da ocorrência.]')
    .replace(/\{EMPRESA_REGISTRO\}/g, o.empresa_registro || '')
    .replace(/\{LOCAL_TRABALHO\}/g, o.loja_nome || o.loja || '');
}
function imprimirTermo(o, texto) {
  const w = window.open('', '_blank'); if (!w) return;
  const corpo = (texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  w.document.write(`<html><head><title>Termo de ${tipoTermo(o)} — ${o.colaborador_nome || ''}</title></head>
    <body style="font-family:system-ui;max-width:640px;margin:32px auto;color:#222;line-height:1.6">
    <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px">${corpo}</pre>
    <p style="margin-top:24px;font-size:11px;color:#666">Documento gerado pelo Sistema Mutti.</p>
    </body></html>`);
  w.document.close(); setTimeout(() => w.print(), 300);
}

export default function OcorrenciaValidarInline({ ocorrenciaId, onChange }) {
  const { API } = useAuth();
  const [o, setO] = useState(null);
  const [tpl, setTpl] = useState({});
  const [doc, setDoc] = useState(null);
  const [exigeAss, setExigeAss] = useState(null);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(() => {
    API.get(`/ocorrencias/${ocorrenciaId}`).then(r => setO(r.data)).catch(() => setO(false));
    API.get('/ocorrencias/modelos-termo').then(r => setTpl(r.data)).catch(() => {});
  }, [API, ocorrenciaId]);
  useEffect(() => { carregar(); }, [carregar]);

  if (o === null) return <div style={s.box}>Carregando ocorrência…</div>;
  if (o === false) return null;
  if (o.status !== 'aguardando_rh') {
    return <div style={s.box}><div style={{ fontSize: 12, color: '#777' }}>Esta ocorrência já foi {o.status === 'rejeitada' ? 'rejeitada' : o.status === 'ativa' ? 'autorizada' : o.status}.</div></div>;
  }

  const advert = ehAdvertencia(o);
  const ass = exigeAss ?? advert;
  const textoTermo = doc ?? o.documento ?? modeloTermo(o, tpl);

  async function validar(decisao) {
    try {
      await API.post(`/ocorrencias/${ocorrenciaId}/validar`, {
        decisao,
        exige_assinatura: decisao === 'autorizar' ? ass : false,
        documento: decisao === 'autorizar' && advert ? textoTermo : undefined,
      });
      setMsg(decisao === 'autorizar' ? '✅ Autorizada e enviada ao colaborador.' : 'Rejeitada — não chega ao colaborador.');
      onChange?.(); carregar();
    } catch (e) { setMsg(e.response?.data?.erro || 'Erro.'); }
  }

  return (
    <div style={s.box}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{o.colaborador_nome} · {o.loja_nome}</div>
      <div style={{ fontSize: 11, color: '#777', margin: '4px 0' }}>
        {o.categoria ? `${o.categoria} · ` : ''}{o.motivo} · {o.zera ? 'zera o indicador' : `impacto ${o.deducao}%`}{o.obs ? ` · obs: ${o.obs}` : ''}
      </div>

      {advert && (
        <div style={{ margin: '8px 0' }}>
          <div style={{ fontSize: 11, color: '#854F0B', marginBottom: 4 }}>Termo de {tipoTermo(o).toLowerCase()} — edite o texto/fatos antes de autorizar:</div>
          <textarea style={s.area} value={textoTermo} onChange={e => setDoc(e.target.value)} />
          <button style={s.ghost} onClick={() => imprimirTermo(o, textoTermo)}>🖨 Pré-visualizar / imprimir</button>
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#444', margin: '6px 0' }}>
        <input type="checkbox" checked={ass} onChange={e => setExigeAss(e.target.checked)} /> exigir assinatura do colaborador
      </label>

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button style={s.ok} onClick={() => validar('autorizar')}>✅ Autorizar</button>
        <button style={s.no} onClick={() => validar('rejeitar')}>Rejeitar</button>
      </div>
      {msg && <div style={{ fontSize: 11, color: msg.startsWith('✅') ? '#3B6D11' : '#993C1D', marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

const s = {
  box: { background: '#fafafa', border: '1px solid #eee', borderRadius: 10, padding: '10px 12px', marginTop: 8 },
  area: { width: '100%', minHeight: 200, fontSize: 12, fontFamily: 'inherit', lineHeight: 1.5, border: '1px solid #ddd', borderRadius: 8, padding: 8, boxSizing: 'border-box' },
  ghost: { fontSize: 11, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#666', marginTop: 6 },
  ok: { fontSize: 12, padding: '6px 14px', border: 'none', borderRadius: 8, background: '#3B6D11', color: '#fff', cursor: 'pointer' },
  no: { fontSize: 12, padding: '6px 14px', border: '1px solid #993C1D', borderRadius: 8, background: 'none', color: '#993C1D', cursor: 'pointer' },
};
