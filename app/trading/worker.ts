/**
 * DEPRECADO - node-cron nao funciona em ambiente serverless (Vercel).
 *
 * O agendamento agora e feito via Vercel Cron Jobs:
 *  - Configuracao: vercel.json (raiz do projeto)
 *  - Handler:      app/api/cron/route.ts
 *
 * O bot roda a cada 15 minutos automaticamente em producao,
 * para todos os ativos configurados no portfolio.
 */
export { };
