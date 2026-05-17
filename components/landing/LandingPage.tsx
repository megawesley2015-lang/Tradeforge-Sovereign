'use client';

import Link from 'next/link';
import './landing.css';

const MODULES = [
  {
    tag: '01 — BACKTEST',
    title: 'Backtest Single-Ativo',
    desc: 'Simule qualquer estratégia com dados reais de Binance e Yahoo Finance. RSI + EMA200 + ATR stop, trailing stop, saídas escalonadas.',
    stat: '1000+ candles',
    href: '/trading/backtest',
    color: '#F5A623',
  },
  {
    tag: '02 — BASKET',
    title: 'Basket Multi-Ativo',
    desc: 'Backteste uma cesta inteira ao mesmo tempo — BTC + ETH + SOL sincronizados candle a candle. Cap de risco global incluído.',
    stat: 'Até 10 ativos',
    href: '/trading/backtest-basket',
    color: '#3B82F6',
  },
  {
    tag: '03 — ARBITRAGEM',
    title: 'Scanner de Arbitragem',
    desc: 'Detecta spreads entre Binance, Kraken e Coinbase em tempo real. Radar de preços com Δ% por par. Atualiza a cada 15s.',
    stat: 'Binance · Kraken · Coinbase',
    href: '/trading/arbitrage',
    color: '#22C55E',
  },
  {
    tag: '04 — SINAIS',
    title: 'Sinais ao Vivo',
    desc: 'Sinais gerados pelo motor real — RSI, EMA200, ADX, ATR. Histórico completo com P&L, win rate e curva de equity.',
    stat: 'Tempo real · WebSocket',
    href: '/trading/signals',
    color: '#9945FF',
  },
];

function EquityCurve() {
  const pts = [
    [0, 90], [60, 80], [120, 85], [180, 60], [240, 70],
    [300, 50], [360, 55], [420, 30], [480, 38], [540, 20], [600, 10],
  ];
  const pathD = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const areaD = `M 0 90 ${pts.map(([x, y]) => `L ${x} ${y}`).join(' ')} L 600 100 L 0 100 Z`;

  return (
    <svg viewBox="0 0 600 100" style={{ width: '100%', height: 72 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22C55E" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#eqGrad)" />
      <path d={pathD} fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="540" cy="20" r="3" fill="#22C55E" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="tf-landing">

      {/* ─── NAV ─── */}
      <nav className="tf-nav">
        <div className="tf-nav-logo">trade<span>forge</span></div>
        <ul className="tf-nav-links">
          <li><a href="#modulos">Módulos</a></li>
          <li><a href="#como-funciona">Como Funciona</a></li>
          <li><a href="#numeros">Números</a></li>
          <li><Link href="/auth/login">Entrar</Link></li>
        </ul>
        <Link href="/auth/register" className="tf-nav-cta">Criar conta</Link>
      </nav>

      {/* ─── HERO ─── */}
      <section className="tf-hero">
        <div className="tf-hero-left">
          <div>
            <div className="tf-hero-eyebrow">
              <span className="tf-eyebrow-tag">● Beta aberto</span>
              <span className="tf-eyebrow-label">Trading automatizado · B3 e Cripto</span>
            </div>

            <h1 className="tf-hero-headline">
              Opera.<br />
              Monitora.<br />
              <span className="amber">Lucra.</span>
            </h1>

            <p className="tf-hero-sub">
              O TradeForge executa suas estratégias 24h por dia, com backtest real,
              arbitragem entre exchanges e controle total na palma da mão.
            </p>

            <div className="tf-hero-actions">
              <Link href="/auth/register" className="tf-btn-primary">Começar agora</Link>
              <Link href="/trading/dashboard" className="tf-btn-ghost">Ver demo ao vivo →</Link>
            </div>
          </div>

          <div className="tf-hero-metrics">
            <div className="tf-metric-item">
              <span className="tf-metric-val">98.7%</span>
              <span className="tf-metric-label">Uptime</span>
            </div>
            <div className="tf-metric-item">
              <span className="tf-metric-val">14ms</span>
              <span className="tf-metric-label">Latência</span>
            </div>
            <div className="tf-metric-item">
              <span className="tf-metric-val">200+</span>
              <span className="tf-metric-label">Pares</span>
            </div>
            <div className="tf-metric-item">
              <span className="tf-metric-val">4</span>
              <span className="tf-metric-label">Módulos</span>
            </div>
          </div>
        </div>

        {/* Terminal mock */}
        <div className="tf-hero-right">
          <div className="tf-terminal-header">
            <span className="tf-terminal-title">Posições abertas</span>
            <span className="tf-terminal-live">
              <span className="tf-live-dot" /> Ao vivo
            </span>
          </div>

          <table className="tf-table">
            <thead>
              <tr>
                <th>Par</th>
                <th>Entrada</th>
                <th>Atual</th>
                <th>P&amp;L</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="tf-par-nome">BTC/USDT</span><span className="tf-par-tipo tf-long">LONG</span></td>
                <td>$42.380</td>
                <td>$43.120</td>
                <td className="tf-pnl-pos">+1.74%</td>
                <td><span className="tf-status tf-status-ativo">Ativo</span></td>
              </tr>
              <tr>
                <td><span className="tf-par-nome">ETH/USDT</span><span className="tf-par-tipo tf-short">SHORT</span></td>
                <td>$2.640</td>
                <td>$2.598</td>
                <td className="tf-pnl-pos">+1.59%</td>
                <td><span className="tf-status tf-status-ativo">Ativo</span></td>
              </tr>
              <tr>
                <td><span className="tf-par-nome">SOL/USDT</span><span className="tf-par-tipo tf-long">LONG</span></td>
                <td>$98.20</td>
                <td>$96.40</td>
                <td className="tf-pnl-neg">-1.83%</td>
                <td><span className="tf-status tf-status-ativo">Ativo</span></td>
              </tr>
              <tr>
                <td><span className="tf-par-nome">ARB/USDT</span><span className="tf-par-tipo tf-long">LONG</span></td>
                <td>$1.124</td>
                <td>$1.124</td>
                <td className="tf-pnl-neu">0.00%</td>
                <td><span className="tf-status tf-status-aguard">Aguard.</span></td>
              </tr>
            </tbody>
          </table>

          <div className="tf-equity-panel">
            <div className="tf-equity-header">
              <span className="tf-equity-title">Equity — últimas 7 semanas</span>
              <span className="tf-equity-val">+18.4%</span>
            </div>
            <EquityCurve />
          </div>

          <div className="tf-sinais-strip">
            {[
              { dir: 'COMPRA', par: 'BNB/USDT',  preco: '$312.40' },
              { dir: 'VENDA',  par: 'MATIC/USDT', preco: '$0.892'  },
              { dir: 'COMPRA', par: 'AVAX/USDT',  preco: '$38.10'  },
            ].map(({ dir, par, preco }) => (
              <div key={par} className="tf-sinal-chip">
                <span className={`tf-sinal-icon ${dir === 'COMPRA' ? 'tf-compra' : 'tf-venda'}`}>{dir}</span>
                <span className="tf-sinal-par">{par}</span>
                <span className="tf-sinal-preco">{preco}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── MÓDULOS ─── */}
      <section id="modulos" className="tf-modulos">
        <div className="tf-modulos-header">
          <p className="tf-secao-label">Módulos</p>
          <h2 className="tf-secao-titulo">Quatro ferramentas.<br />Uma plataforma.</h2>
        </div>
        <div className="tf-modulos-grid">
          {MODULES.map((m) => (
            <Link key={m.tag} href={m.href} className="tf-modulo-card">
              <div className="tf-modulo-tag" style={{ color: m.color, borderColor: `${m.color}30`, background: `${m.color}0D` }}>
                {m.tag}
              </div>
              <h3 className="tf-modulo-title">{m.title}</h3>
              <p className="tf-modulo-desc">{m.desc}</p>
              <div className="tf-modulo-footer">
                <span className="tf-modulo-stat" style={{ color: m.color }}>{m.stat}</span>
                <span className="tf-modulo-arrow">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── COMO FUNCIONA ─── */}
      <section id="como-funciona" className="tf-como-funciona">
        <div className="tf-como-left">
          <p className="tf-secao-label">Como funciona</p>
          <h2 className="tf-secao-titulo">De estratégia a execução em minutos</h2>
          <p className="tf-secao-desc">Configure uma vez. O robô opera enquanto você vive.</p>
        </div>

        <ol className="tf-steps-lista">
          {[
            {
              num: '01 —',
              titulo: 'Configure sua estratégia',
              desc: 'Escolha entre estratégias pré-configuradas ou crie a sua. Defina pares, gerenciamento de risco, take profit e stop loss com precisão.',
              tag: 'Backtest incluído',
            },
            {
              num: '02 —',
              titulo: 'Conecte sua corretora',
              desc: 'Integração direta via API com Binance, Bybit e outras. Suas chaves ficam criptografadas — nunca armazenamos acesso a saques.',
              tag: 'Zero custódia',
            },
            {
              num: '03 —',
              titulo: 'Ative e monitore',
              desc: 'O sistema entra e sai de posições automaticamente. Você acompanha em tempo real pelo dashboard e recebe alertas via Telegram.',
              tag: 'Alertas em tempo real',
            },
            {
              num: '04 —',
              titulo: 'Analise e otimize',
              desc: 'Relatórios detalhados de performance, histórico de operações e sugestões de otimização baseadas nos seus resultados reais.',
              tag: 'Relatórios detalhados',
            },
          ].map(({ num, titulo, desc, tag }) => (
            <div key={num} className="tf-step">
              <span className="tf-step-num">{num}</span>
              <div className="tf-step-corpo">
                <h3>{titulo}</h3>
                <p>{desc}</p>
                <span className="tf-step-tag">{tag}</span>
              </div>
            </div>
          ))}
        </ol>
      </section>

      {/* ─── NÚMEROS ─── */}
      <section id="numeros" className="tf-numeros">
        {[
          { val: 'R$', amber: '2.4M', label: 'Volume operado',       desc: 'Nos últimos 30 dias pela plataforma' },
          { val: '',   amber: '14ms', label: 'Latência de execução',  desc: 'Da decisão ao preenchimento da ordem' },
          { val: '',   amber: '98.7', label: 'Uptime garantido',      desc: 'Com monitoramento contínuo 24/7', suffix: '%' },
          { val: '',   amber: '0',    label: 'Custódia de ativos',    desc: 'Seus fundos ficam na sua corretora' },
        ].map(({ val, amber, label, desc, suffix }) => (
          <div key={label} className="tf-numero-item">
            <div className="tf-numero-val">{val}<span className="amber">{amber}</span>{suffix}</div>
            <div className="tf-numero-label">{label}</div>
            <div className="tf-numero-desc">{desc}</div>
          </div>
        ))}
      </section>

      {/* ─── CTA FINAL ─── */}
      <section className="tf-cta-final">
        <h2 className="tf-cta-titulo">
          Pronto para operar<br />
          com <span className="amber">precisão</span><br />
          cirúrgica?
        </h2>
        <div className="tf-cta-right">
          <Link href="/auth/register" className="tf-btn-primary" style={{ width: 'fit-content' }}>
            Criar conta grátis
          </Link>
          <p className="tf-cta-note">
            Sem cartão de crédito.<br />
            7 dias de teste completo.<br />
            Cancele a qualquer momento.
          </p>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="tf-footer">
        <div className="tf-footer-logo">trade<span>forge</span></div>
        <ul className="tf-footer-links">
          <li><a href="#">Termos</a></li>
          <li><a href="#">Privacidade</a></li>
          <li><a href="#">Docs</a></li>
          <li><a href="#">Suporte</a></li>
        </ul>
      </footer>

    </div>
  );
}
