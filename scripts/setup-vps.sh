#!/bin/bash
# =============================================================
# TradeForge Sovereign — Setup VPS Hostinger (Ubuntu 22.04)
# =============================================================
# Execute como root ou com sudo:
#   chmod +x setup-vps.sh && bash setup-vps.sh
# =============================================================

set -e  # Para imediatamente em caso de erro

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   TradeForge — Setup VPS Hostinger               ║"
echo "║   Ubuntu 22.04 / Debian 12                       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 1. Atualiza o sistema ────────────────────────────────────
echo ">>> [1/7] Atualizando sistema..."
apt-get update -y && apt-get upgrade -y

# ── 2. Instala dependências essenciais ───────────────────────
echo ">>> [2/7] Instalando dependências..."
apt-get install -y curl git unzip wget build-essential

# ── 3. Instala Node.js 22 (LTS) via NodeSource ───────────────
echo ">>> [3/7] Instalando Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

node --version
npm --version

# ── 4. Instala PM2 globalmente ───────────────────────────────
echo ">>> [4/7] Instalando PM2..."
npm install -g pm2

pm2 --version

# ── 5. Instala tsx (runner TypeScript sem compilar) ──────────
echo ">>> [5/7] Instalando tsx..."
npm install -g tsx

tsx --version

# ── 6. Cria diretório de logs ────────────────────────────────
echo ">>> [6/7] Configurando diretórios..."
mkdir -p /root/tradeforge/logs

# ── 7. Configura PM2 para reiniciar com a VPS ───────────────
echo ">>> [7/7] Configurando startup do PM2..."
pm2 startup systemd -u root --hp /root
# ATENÇÃO: o comando acima vai imprimir um comando. Execute-o!

echo ""
echo "════════════════════════════════════════════════════"
echo "✅ Setup concluído!"
echo ""
echo "Próximos passos:"
echo ""
echo "  1. Clone seu repositório:"
echo "     cd /root && git clone https://github.com/SEU_USUARIO/tradeforge-sovereign.git"
echo "     cd tradeforge-sovereign"
echo ""
echo "  2. Instale as dependências do projeto:"
echo "     npm install"
echo ""
echo "  3. Crie o arquivo de variáveis de ambiente:"
echo "     nano .env.local"
echo "     # Cole o conteúdo do seu .env.local local"
echo ""
echo "  4. Adicione a variável extra que o bot precisa:"
echo "     SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key"
echo "     (pegue em: supabase.com → projeto → Settings → API)"
echo ""
echo "  5. Inicie o bot com PM2:"
echo "     pm2 start ecosystem.config.js"
echo "     pm2 logs TradeForge-Bot"
echo ""
echo "  6. Salve a configuração do PM2:"
echo "     pm2 save"
echo ""
echo "  7. Para monitorar:"
echo "     pm2 monit                  # dashboard em tempo real"
echo "     pm2 logs TradeForge-Bot    # logs do bot"
echo "     pm2 restart TradeForge-Bot # reinicia"
echo "     pm2 stop TradeForge-Bot    # para"
echo ""
echo "════════════════════════════════════════════════════"
