// =============================================================
// PM2 Ecosystem Config — TradeForge Sovereign
// =============================================================
// Uso:
//   pm2 start ecosystem.config.js   → inicia todos os processos
//   pm2 stop all                     → para tudo
//   pm2 restart TradeForge-Bot       → reinicia o bot
//   pm2 logs TradeForge-Bot          → acompanha os logs
//   pm2 save && pm2 startup          → salva para reiniciar com a VPS
// =============================================================

module.exports = {
  apps: [
    // ── Bot de trading (paper trading / dry run) ─────────────
    {
      name:          'TradeForge-Bot',
      script:        'bot/start.ts',
      interpreter:   'node',
      // tsx executa TypeScript diretamente, sem compilar
      interpreter_args: '--import tsx/esm',
      // Ambiente de variáveis — NÃO coloque segredos aqui.
      // Use `pm2 set TradeForge-Bot:SUPABASE_KEY xxx` ou
      // um arquivo .env separado na VPS.
      env: {
        NODE_ENV:       'production',
        DRY_RUN:        'true',
        BOT_INTERVAL:   '4h',
        BOT_INITIAL_BALANCE: '1000',
        BOT_RISK_PER_TRADE:  '0.02',
      },
      // Reinicia automaticamente se crashar
      autorestart:   true,
      // Espera 5s antes de reiniciar (evita loop de crashes)
      restart_delay: 5000,
      // Máximo de reinicializações em 10 minutos
      max_restarts:  10,
      min_uptime:    '10s',
      // Logs
      out_file:      'logs/bot-out.log',
      error_file:    'logs/bot-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // Merge stdout + stderr em um arquivo só
      merge_logs:    true,
      // Watch: false — o bot não precisa reload automático em prod
      watch:         false,
    },

    // ── Servidor Next.js (dashboard) ─────────────────────────
    // Descomente se quiser servir o dashboard na mesma VPS
    // (alternativa ao Vercel)
    //
    // {
    //   name:        'TradeForge-Dashboard',
    //   script:      'node_modules/.bin/next',
    //   args:        'start',
    //   env: {
    //     NODE_ENV: 'production',
    //     PORT:     '3000',
    //   },
    //   autorestart: true,
    //   watch:       false,
    //   out_file:    'logs/dashboard-out.log',
    //   error_file:  'logs/dashboard-err.log',
    // },
  ],
};
