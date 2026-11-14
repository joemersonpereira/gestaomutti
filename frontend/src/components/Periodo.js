// Periodo.js — PADRÃO de filtro de período (Joe 2026-11-14): Hoje · Mês atual · Mês passado ·
// últimos N dias · Datas específicas. Deve ser usado em TODA tela que tem filtro de período.
// usePeriodo() guarda o estado e já devolve os params ({dias} ou {ini,fim}) + os dias efetivos.
// <CampoPeriodo/> desenha o select + os campos de data (quando "Datas específicas").
import React from 'react';
import { UI } from './ui';

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function usePeriodo(def = '30') {
  const [periodo, setPeriodo] = React.useState(def); // 'hoje'|'ontem'|'semana'|'mes_atual'|'mes_passado'|7|15|30|60|90|'custom'
  const [ini, setIni] = React.useState(''); const [fim, setFim] = React.useState('');
  const hoje = new Date(); const hojeStr = ymd(hoje);
  const ontemStr = ymd(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1));
  const diaSem = (hoje.getDay() + 6) % 7; // 0 = segunda
  const seganaStr = ymd(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diaSem)); // segunda desta semana
  const mesAtual = { ini: ymd(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), fim: hojeStr };
  const mesPassado = { ini: ymd(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), fim: ymd(new Date(hoje.getFullYear(), hoje.getMonth(), 0)) };
  const params = periodo === 'todo' ? {}
    : periodo === 'hoje' ? { ini: hojeStr, fim: hojeStr }
      : periodo === 'ontem' ? { ini: ontemStr, fim: ontemStr }
        : periodo === 'semana' ? { ini: seganaStr, fim: hojeStr }
          : periodo === 'mes_atual' ? mesAtual : periodo === 'mes_passado' ? mesPassado
            : periodo === 'custom' ? (ini && fim ? { ini, fim } : null) : { dias: Number(periodo) };
  const dias = params && params.ini && params.fim
    ? Math.max(1, Math.round((new Date(params.fim) - new Date(params.ini)) / 86400000) + 1)
    : (params && params.dias) || 30;
  return { periodo, setPeriodo, ini, setIni, fim, setFim, params, dias };
}

export function CampoPeriodo({ periodo, setPeriodo, ini, setIni, fim, setFim, diasOpc = [7, 15, 30, 60, 90], comTodo = false }) {
  const opc = Array.isArray(diasOpc) ? diasOpc : [7, 15, 30, 60, 90];
  return (<>
    <label style={UI.fld}>Período<select value={periodo} onChange={e => setPeriodo(e.target.value)} style={UI.inp}>
      {comTodo && <option value="todo">Todo o período</option>}
      <option value="hoje">Hoje</option>
      <option value="ontem">Ontem</option>
      <option value="semana">Esta semana</option>
      <option value="mes_atual">Mês atual</option>
      <option value="mes_passado">Mês passado</option>
      {opc.map(n => <option key={n} value={String(n)}>últimos {n} dias</option>)}
      <option value="custom">Datas específicas…</option>
    </select></label>
    {periodo === 'custom' && <label style={UI.fld}>De–Até<span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <input type="date" value={ini} onChange={e => setIni(e.target.value)} style={{ ...UI.inp, padding: '5px 7px' }} />–
      <input type="date" value={fim} onChange={e => setFim(e.target.value)} style={{ ...UI.inp, padding: '5px 7px' }} />
    </span></label>}
  </>);
}
