// migrar-pendentes.js — mantido pelo nome (os .bat e o INSTALAR-NA-MAQUINA chamam este
// arquivo). Desde 2026-10-15 ele só delega para o migrar.js, que descobre as migrações
// sozinho e anota as aplicadas na tabela schema_migracoes. Não há mais lista para manter.
require('./migrar');
