# Monta o pacote do sistema para instalar em outra maquina.
# Leva o codigo e a TELA JA COMPILADA (frontend/build) — assim a outra maquina pula a
# instalacao do frontend, que e a parte mais lenta.
# NAO leva: node_modules, .env (tem senha), sessoes/ (sao os logins), o banco.

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$nome = 'mutti-sistema-' + (Get-Date -Format 'yyyy-MM-dd')
$tmp  = Join-Path $env:TEMP $nome
$zip  = Join-Path ([Environment]::GetFolderPath('Desktop')) ($nome + '.zip')

if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null

$excluir = @('node_modules', '.git', 'build\static\js\*.map')

function Copiar($de, $para) {
  $origem  = Join-Path $raiz $de
  if (-not (Test-Path $origem)) { return }
  $destino = Join-Path $tmp $para
  New-Item -ItemType Directory -Path (Split-Path $destino) -Force | Out-Null
  if (Test-Path $origem -PathType Container) {
    robocopy $origem $destino /E /XD node_modules .git /XF *.map /NFL /NDL /NJH /NJS /NP | Out-Null
  } else {
    Copy-Item $origem $destino -Force
  }
  Write-Host ("  + " + $de)
}

Write-Host "`nMontando o pacote..."

Copiar 'backend\src'            'backend\src'
Copiar 'backend\scripts'        'backend\scripts'
Copiar 'backend\package.json'   'backend\package.json'
Copiar 'backend\package-lock.json' 'backend\package-lock.json'
Copiar 'backend\.env.example'   'backend\.env.example'

# a tela ja compilada — e o que faz a instalacao ser rapida do outro lado
Copiar 'frontend\build'         'frontend\build'
Copiar 'frontend\src'           'frontend\src'
Copiar 'frontend\public'        'frontend\public'
Copiar 'frontend\package.json'  'frontend\package.json'
Copiar 'frontend\package-lock.json' 'frontend\package-lock.json'

Copiar 'coletor'                'coletor'
Copiar 'docs'                   'docs'
Copiar '.claude'                '.claude'
Copiar 'CLAUDE.md'              'CLAUDE.md'
Copiar 'README.md'              'README.md'
Copiar 'INSTALAR-NA-MAQUINA.bat' 'INSTALAR-NA-MAQUINA.bat'
Copiar 'INICIAR-SISTEMA.bat'    'INICIAR-SISTEMA.bat'

# limpeza de seguranca: nada de senha, login ou dado dentro do pacote
Get-ChildItem $tmp -Recurse -Force -Include '.env', '.env.local', '*.db', '*.db-wal', '*.db-shm' |
  ForEach-Object { Write-Host ("  - removido: " + $_.Name); Remove-Item $_.FullName -Force }
foreach ($p in @('coletor\sessoes', 'coletor\baixados', 'coletor\logs')) {
  $alvo = Join-Path $tmp $p
  if (Test-Path $alvo) { Remove-Item $alvo -Recurse -Force; Write-Host ("  - removido: " + $p) }
}

Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $zip -CompressionLevel Optimal
Remove-Item $tmp -Recurse -Force

$mb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "`n============================================================"
Write-Host "  Pronto:  $zip"
Write-Host "  Tamanho: $mb MB"
Write-Host ""
Write-Host "  Na outra maquina:"
Write-Host "    1. Descompacte em C:\mutti-sistema"
Write-Host "    2. Rode INSTALAR-NA-MAQUINA.bat"
Write-Host "    3. Rode INICIAR-SISTEMA.bat  (ele mostra o link de acesso)"
Write-Host "============================================================"
