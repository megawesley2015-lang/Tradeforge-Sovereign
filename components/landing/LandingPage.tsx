'use client';

import Link from 'next/link';
import './landing.css';

export default function LandingPage() {
  return (
    <div className="tf-landing">

      {/* ─── NAV ─── */}
      <nav className="tf-nav">
        <div className="tf-nav-logo">
          trade<span>forge</span>
        </div>
        <ul className="tf-nav-links">
          <li><a href="#como-funciona">Produto</a></li>
          <li><a href="#como-funciona">Estrategias</a></li>
          <li><a href="#numeros">Numeros</a></li>
          <li><Link href="/auth/login">Docs</Link></li>
        </ul>
        <Link href="/auth/register" className="tf-nav-cta">
          Criar conta
        </Link>
      </nav>

      {/* ─── HERO ─── */}
      <section className="tf-hero">
        <div className="tf-hero-left">
          <div>
            <div className="tf-hero-eyebrow">
              <span className="tf-eyebrow-tag">Beta aberto</span>
              <span className="tf-eyebrow-label">Trading automatizado para B3 e cripto</span>
            </div>

            <h1 className="tf-hero-headline">
              Opera.<br />
              Monitora.<br />
              <span className="amber">Lucra.</span>
            </h1>

            <p className="tf-hero-sub">
              O TradeForge executa suas estrategias 24h por dia, com backtest real,
              sinais em tempo real e controle total na palma da mao.
            </p>

            <div className="tf-hero-actions">
              <Link href="/auth/register" className="tf-btn-primary">
                Comecar agora
              </Link>
              <Link href="/auth/login" className="tf-btn-ghost">
                Ver demo ao vivo
              </Link>
            </div>
          </div>

          <div className="tf-hero-metrics">
            <div className="tf-metric-item">
              <span className="tf-metric-val">98.7%</span>
              <span className="tf-metric-label">Uptime do sistema</span>
            </div>
            <div className="tf-metric-item">
              <span className="tf-metric-val">14ms</span>
              <span className="tf-metric-label">Latencia media</span>
            </div>
            <div className="tf-metric-item">
              <span className="tf-metric-val">200+</span>
              <span className="tf-metric-label">Pares disponiveis</span>
            </div>
          </div>
        </div>

        {/* Terminal preview */}
        <div className="tf-hero-right">
          <div className="tf-terminal-header">
            <span className="tf-terminal-title">Posicoes abertas</span>
            <span className="tf-terminal-live">
              <span className="tf-live-dot" />
              Ao vivo
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
                <td>
                  <span className="tf-par-nome">BTC/USDT</span>
                  <span className="tf-par-tipo tf-long">LONG</span>
                </td>
                <td>$42.380</td>
                <td>$43.120</td>
                <td className="tf-pnl-pos">+1.74%</td>
                <td><span className="tf-status tf-status-ativo">Ativo</span></td>
              </tr>
              <tr>
                <td>
                  <span className="tf-par-nome">ETH/USDT</span>
                  <span className="tf-par-tipo tf-short">SHORT</span>
                </td>
                <td>$2.640</td>
                <td>$2.598</td>
                <td className="tf-pnl-pos">+1.59%</td>
                <td><span className="tf-status tf-status-ativo">Ativo</span></td>
              </tr>
              <tr>
                <td>
                  <span className="tf-par-nome">SOL/USDT</span>
                  <span className="tf-par-tipo tf-long">LONG</span>
                </td>
                <td>$98.20</td>
                <td>$96.40</td>
                <td className="tf-pnl-neg">-1.83%</td>
                <td><span className="tf-status tf-status-ativo">Ativo</span></td>
              </tr>
              <tr>
                <td>
                  <span className="tf-par-nome">ARB/USDT</span>
                  <span className="tf-par-tipo tf-long">LONG</span>
                </td>
                <td>$1.124</td>
                <td>$1.124</td>
                <td className="tf-pnl-neu">0.00%</td>
                <td><span className="tf-status tf-status-aguard">Aguardando</span></td>
              </tr>
            </tbody>
          </table>

          <div className="tf-equity-panel">
            <div className="tf-equity-header">
              <span className="tf-equity-title">Equity — ultimas 7 semanas</span>
              <span className="tf-equity-val">+18.4%</span>
            </div>
            <div className="tf-equity-bars">
              <div className="tf-eq-bar tf-eq-pos"  style={{ height: '40%' }} />
              <div className="tf-eq-bar tf-eq-pos"  style={{ height: '55%' }} />
              <div className="tf-eq-bar tf-eq-neg"  style={{ height: '30%' }} />
              <div className="tf-eq-bar tf-eq-pos"  style={{ height: '65%' }} />
              <div className="tf-eq-bar tf-eq-pos"  style={{ height: '72%' }} />
              <div className="tf-eq-bar tf-eq-neg"  style={{ height: '25%' }} />
              <div className="tf-eq-bar tf-eq-dest" style={{ height: '88%' }} />
            </div>
            <div className="tf-equity-xaxis">
              {['S1','S2','S3','S4','S5','S6','S7'].map((s) => (
                <span key={s} className="tf-eq-xlabel">{s}</span>
              ))}
            </div>
          </div>

          <div className="tf-sinais-strip">
            {[
              { dir: 'compra', par: 'BNB/USDT',   preco: '$312.40' },
              { dir: 'venda',  par: 'MATIC/USDT',  preco: '$0.892'  },
              { dir: 'compra', par: 'AVAX/USDT',   preco: '$38.10'  },
            ].map(({ dir, par, preco }) => (
              <div key={par} className="tf-sinal-chip">
                <span className={`tf-sinal-icon ${dir === 'compra' ? 'tf-compra' : 'tf-venda'}`}>
                  {dir.toUpperCase()}
                </span>
                <span className="tf-sinal-par">{par}</span>
                <span className="tf-sinal-preco">{preco}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── COMO FUNCIONA ─── */}
      <section id="como-funciona" className="tf-como-funciona">
        <div className="tf-como-left">
          <p className="tf-secao-label">Como funciona</p>
          <h2 className="tf-secao-titulo">De estrategia a execucao em minutos</h2>
          <p className="tf-secao-desc">
            Configure uma vez. O robo opera enquanto voce vive.
          </p>
        </div>

        <ol className="tf-steps-lista">
          {[
            {
              num: '01 —',
              titulo: 'Configure sua estrategia',
              desc: 'Escolha entre estrategias pre-configuradas ou crie a sua. Defina pares, gerenciamento de risco, take profit e stop loss com precisao.',
              tag: 'Backtest incluido',
            },
            {
              num: '02 —',
              titulo: 'Conecte sua corretora',
              desc: 'Integracao direta via API com Binance, Bybit e outras. Suas chaves ficam criptografadas — nunca armazenamos acesso a saques.',
              tag: 'Zero custodia',
            },
            {
              num: '03 —',
              titulo: 'Ative e monitore',
              desc: 'O sistema entra e sai de posicoes automaticamente. Voce acompanha em tempo real pelo dashboard e recebe alertas via Telegram.',
              tag: 'Alertas em tempo real',
            },
            {
              num: '04 —',
              titulo: 'Analise e otimize',
              desc: 'Relatorios detalhados de performance, historico de operacoes e sugestoes de otimizacao baseadas nos seus resultados reais.',
              tag: 'Relatorios detalhados',
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

      {/* ─── NUMEROS ─── */}
      <section id="numeros" className="tf-numeros">
        {[
          { val: 'R$', amber: '2.4M', label: 'Volume operado',      desc: 'Nos ultimos 30 dias pela plataforma' },
          { val: '',   amber: '14ms', label: 'Latencia de execucao', desc: 'Da decisao ao preenchimento da ordem' },
          { val: '',   amber: '98.7', label: 'Uptime garantido',     desc: 'Com monitoramento continuo 24/7', suffix: '%' },
          { val: '',   amber: '0',    label: 'Custodia de ativos',   desc: 'Seus fundos ficam na sua corretora' },
        ].map(({ val, amber, label, desc, suffix }) => (
          <div key={label} className="tf-numero-item">
            <div className="tf-numero-val">
              {val}<span className="amber">{amber}</span>{suffix}
            </div>
            <div className="tf-numero-label">{label}</div>
            <div className="tf-numero-desc">{desc}</div>
          </div>
        ))}
      </section>

      {/* ─── CTA FINAL ─── */}
      <section className="tf-cta-final">
        <h2 className="tf-cta-titulo">
          Pronto para operar<br />
          com <span className="amber">precisao</span><br />
          cirurgica?
        </h2>
        <div className="tf-cta-right">
          <Link href="/auth/register" className="tf-btn-primary" style={{ width: 'fit-content' }}>
            Criar conta gratis
          </Link>
          <p className="tf-cta-note">
            Sem cartao de credito.<br />
            7 dias de teste completo.<br />
            Cancele a qualquer momento.
          </p>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="tf-footer">
        <div className="tf-footer-logo">
          trade<span>forge</span>
        </div>
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
