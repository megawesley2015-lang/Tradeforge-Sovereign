# ================================================================
# TRADEFORGE SOVEREIGN — Script de teste da API (PowerShell)
# Uso: cd tradeforge-sovereign && .\test-api.ps1
# ================================================================

# Gera 35 candles simulados para BTCUSDT (mínimo 30 exigido)
$basePrice = 94000
$candles = @()
$timestamp = [DateTime]::UtcNow.AddHours(-35)

for ($i = 0; $i -lt 35; $i++) {
    $change   = (Get-Random -Minimum -200 -Maximum 200)
    $open     = [math]::Round($basePrice, 2)
    $close    = [math]::Round($basePrice + $change, 2)
    $high     = [math]::Round([math]::Max($open, $close) + (Get-Random -Minimum 50 -Maximum 200), 2)
    $low      = [math]::Round([math]::Min($open, $close) - (Get-Random -Minimum 50 -Maximum 200), 2)
    $volume   = Get-Random -Minimum 5000000 -Maximum 20000000
    $ts       = $timestamp.AddMinutes($i).ToString("yyyy-MM-ddTHH:mm:ssZ")

    $candles += @{
        open      = $open
        high      = $high
        low       = $low
        close     = $close
        volume    = $volume
        timestamp = $ts
    }
    $basePrice = $close
}

# Monta o body da requisição
$body = @{
    ticker  = "BTCUSDT"
    candles = $candles
    config  = @{
        capitalTotal = 50
        maxRiskPct   = 0.02
        winRate      = 0.55
    }
} | ConvertTo-Json -Depth 10

Write-Host "`n[TradeForge] Enviando $($candles.Count) candles para o SignalEngine..." -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest `
        -Uri "http://localhost:3000/api/signals" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body

    $result = $response.Content | ConvertFrom-Json

    Write-Host "`n===== RESULTADO DO SIGNAL ENGINE =====" -ForegroundColor Green
    Write-Host "Ticker    : $($result.signal.ticker)"
    Write-Host "Direção   : $($result.signal.direction)" -ForegroundColor $(
        if ($result.signal.direction -eq 'BUY')  { 'Green' }
        elseif ($result.signal.direction -eq 'SELL') { 'Red' }
        else { 'Gray' }
    )
    Write-Host "Força     : $([math]::Round($result.signal.strength * 100, 0))%"
    Write-Host "Preço     : R$ $($result.signal.currentPrice)"
    Write-Host "Stop Loss : R$ $($result.signal.stopLoss)"
    Write-Host "Take Prof : R$ $($result.signal.takeProfit)"
    Write-Host "Posição   : R$ $($result.signal.suggestedPositionSizeR)"
    Write-Host "Indicadores: $($result.signal.indicatorsFired -join ', ')"

    if ($result.persisted) {
        Write-Host "`n✅ Sinal salvo no Supabase! ID: $($result.signalId)" -ForegroundColor Green
        Write-Host "   → Abra /trading/signals para ver em tempo real" -ForegroundColor Cyan
    } else {
        Write-Host "`nℹ️  Sinal HOLD — não persistido (nenhuma ação necessária)" -ForegroundColor Yellow
    }

} catch {
    $statusCode = $_.Exception.Response.StatusCode.Value__
    Write-Host "`n[ERRO $statusCode] $($_.Exception.Message)" -ForegroundColor Red

    # Tenta mostrar o corpo do erro
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $errorBody = $reader.ReadToEnd() | ConvertFrom-Json
        Write-Host "Detalhe: $($errorBody.error)" -ForegroundColor Red
    } catch {}
}
