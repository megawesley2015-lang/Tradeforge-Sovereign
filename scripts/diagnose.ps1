# =============================================================================
# diagnose.ps1 — Diagnóstico do ambiente de dev do TradeForge Sovereign
# =============================================================================
# Uso (PowerShell na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File scripts/diagnose.ps1
#
# Verifica em sequência:
#  1) Node/npm instalados
#  2) .env.local com todas as variáveis Supabase
#  3) Porta 3000 livre (ou já ocupada por outro processo)
#  4) Conectividade com o Supabase
#  5) Limpa cache do .next (se travado)
# =============================================================================

$ErrorActionPreference = 'Continue'
Write-Host "`n=== TradeForge Sovereign — Diagnóstico de Dev ===`n" -ForegroundColor Cyan

# --- 1) Node / npm ---------------------------------------------------------
Write-Host "[1/5] Verificando Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>$null
    Write-Host "  ✅ Node: $nodeVersion"
} catch {
    Write-Host "  ❌ Node não encontrado. Instale: https://nodejs.org" -ForegroundColor Red
    exit 1
}

# --- 2) .env.local ---------------------------------------------------------
Write-Host "`n[2/5] Verificando .env.local..." -ForegroundColor Yellow
if (-not (Test-Path ".env.local")) {
    Write-Host "  ❌ .env.local NÃO existe. Crie-o e adicione as variáveis Supabase." -ForegroundColor Red
    exit 1
}
$required = @(
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_APP_URL'
)
$envContent = Get-Content .env.local -Raw
$missing = @()
foreach ($key in $required) {
    if ($envContent -notmatch "(?m)^$key=.+") {
        $missing += $key
    }
}
if ($missing.Count -gt 0) {
    Write-Host "  ❌ Variáveis ausentes ou vazias: $($missing -join ', ')" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Todas as variáveis estão presentes."

# --- 3) Porta 3000 ---------------------------------------------------------
Write-Host "`n[3/5] Verificando porta 3000..." -ForegroundColor Yellow
$portInUse = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    $pid = $portInUse[0].OwningProcess
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    Write-Host "  ⚠️  Porta 3000 ocupada por: $($proc.ProcessName) (PID $pid)" -ForegroundColor Yellow
    Write-Host "      Se for um dev server antigo travado, mate com: Stop-Process -Id $pid -Force"
} else {
    Write-Host "  ✅ Porta 3000 livre."
}

# --- 4) Supabase reachable -------------------------------------------------
# Endpoint /auth/v1/health requer header apikey — sem ele retorna 401.
# Usamos a NEXT_PUBLIC_SUPABASE_ANON_KEY do .env.local.
Write-Host "`n[4/5] Testando conectividade com Supabase..." -ForegroundColor Yellow
$supabaseUrl = ($envContent | Select-String -Pattern 'NEXT_PUBLIC_SUPABASE_URL=(.+)').Matches[0].Groups[1].Value.Trim()
$anonKey     = ($envContent | Select-String -Pattern 'NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)').Matches[0].Groups[1].Value.Trim()
try {
    $resp = Invoke-WebRequest `
        -Uri "$supabaseUrl/auth/v1/health" `
        -Headers @{ apikey = $anonKey } `
        -UseBasicParsing `
        -TimeoutSec 5
    if ($resp.StatusCode -eq 200) {
        Write-Host "  ✅ Supabase Auth acessível ($supabaseUrl)"
    } else {
        Write-Host "  ⚠️  Supabase Auth respondeu HTTP $($resp.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code) {
        Write-Host "  ❌ Supabase Auth respondeu HTTP $code — apikey inválida ou projeto pausado." -ForegroundColor Red
    } else {
        Write-Host "  ❌ Falha de rede para $supabaseUrl — verifique internet/firewall." -ForegroundColor Red
    }
}

# --- 5) Cache .next --------------------------------------------------------
Write-Host "`n[5/5] Verificando cache .next..." -ForegroundColor Yellow
if (Test-Path ".next") {
    $size = (Get-ChildItem .next -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "  ℹ️  .next existe ($([math]::Round($size,1)) MB)."
    Write-Host "      Se o build estiver com sintomas estranhos, rode: Remove-Item -Recurse -Force .next"
} else {
    Write-Host "  ✅ .next limpo."
}

Write-Host "`n=== Pronto para subir o dev server ===" -ForegroundColor Green
Write-Host "Execute:  npm run dev"
Write-Host "Acesse:   http://localhost:3000"
Write-Host ""
Write-Host "IMPORTANTE para o erro chrome-error://chromewebdata/:" -ForegroundColor Cyan
Write-Host "  1) Mantenha o 'npm run dev' rodando ANTES de clicar no link"
Write-Host "     de confirmação de email do Supabase."
Write-Host "  2) Limpe o cache do Chrome (DevTools → Application → Clear storage)."
Write-Host "  3) Confira em Supabase Dashboard → Authentication → URL Configuration:"
Write-Host "     - Site URL = http://localhost:3000  (para dev)"
Write-Host "     - Redirect URLs deve incluir:"
Write-Host "         http://localhost:3000/auth/callback"
Write-Host "         https://SEU-DOMINIO.vercel.app/auth/callback  (para prod)"
Write-Host ""
