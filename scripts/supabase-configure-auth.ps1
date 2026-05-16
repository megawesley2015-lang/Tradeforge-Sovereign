# =============================================================================
# supabase-configure-auth.ps1
# Configura Site URL + Redirect URLs (uri_allow_list) do projeto via
# Supabase Management API. Use SEMPRE que mudar de domínio ou adicionar
# previews da Vercel.
# =============================================================================
# Pré-requisito (1 minuto, uma vez só):
#   1) Crie um Personal Access Token em:
#        https://supabase.com/dashboard/account/tokens
#   2) Salve-o como variável de ambiente do usuário no Windows:
#        [Environment]::SetEnvironmentVariable(
#          "SUPABASE_ACCESS_TOKEN", "sbp_xxx...", "User")
#      Feche e reabra o PowerShell para a variável aparecer.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts/supabase-configure-auth.ps1
#
# Doc do endpoint:
#   https://api.supabase.com/api/v1#/projects%20config/updateV1AuthConfig
# =============================================================================

$ErrorActionPreference = 'Stop'

# ── Edite SOMENTE este bloco quando precisar trocar valores ────────────────
$ProjectRef = 'olxhfdawehxpmwuijxbw'

# Site URL: domínio "principal" — Supabase usa como fallback em todo email.
# Em dev: localhost. Em prod: troque para o domínio da Vercel.
$SiteUrl = 'http://localhost:3000'

# Allow-list de redirect URLs. Wildcards (**) cobrem subrotas e previews.
$RedirectUrls = @(
    'http://localhost:3000/auth/callback',
    'http://localhost:3000/**',
    'https://SEU-DOMINIO.vercel.app/auth/callback',
    'https://SEU-DOMINIO.vercel.app/**'
)
# ───────────────────────────────────────────────────────────────────────────

$pat = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
if (-not $pat) { $pat = $env:SUPABASE_ACCESS_TOKEN }
if (-not $pat) {
    Write-Host "❌ SUPABASE_ACCESS_TOKEN não está definido." -ForegroundColor Red
    Write-Host "   Crie em https://supabase.com/dashboard/account/tokens e exporte:"
    Write-Host "   [Environment]::SetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','sbp_...','User')"
    exit 1
}

$body = @{
    site_url       = $SiteUrl
    uri_allow_list = ($RedirectUrls -join ',')
} | ConvertTo-Json -Depth 5

Write-Host "→ PATCH https://api.supabase.com/v1/projects/$ProjectRef/config/auth" -ForegroundColor Cyan
Write-Host "  site_url       = $SiteUrl"
Write-Host "  uri_allow_list ="
$RedirectUrls | ForEach-Object { Write-Host "    - $_" }
Write-Host ""

try {
    $resp = Invoke-RestMethod `
        -Method Patch `
        -Uri "https://api.supabase.com/v1/projects/$ProjectRef/config/auth" `
        -Headers @{
            Authorization  = "Bearer $pat"
            'Content-Type' = 'application/json'
        } `
        -Body $body
    Write-Host "✅ Auth config atualizada com sucesso." -ForegroundColor Green
    Write-Host "   site_url       = $($resp.site_url)"
    Write-Host "   uri_allow_list = $($resp.uri_allow_list)"
} catch {
    Write-Host "❌ Erro ao chamar Management API:" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)"
    if ($_.ErrorDetails) { Write-Host "   $($_.ErrorDetails.Message)" }
    exit 1
}
