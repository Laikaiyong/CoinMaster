const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();
const { createClient } = require('@supabase/supabase-js');

class CryptoTradingBot {
  constructor() {
    this.bot = new TelegramBot(process.env.TG_API_KEY, { polling: true });
    this.cloudflareEndpoint = "https://tradingbot.vandycklai.workers.dev/";
    this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    this.setupHandlers();
  }

  setupHandlers() {
    // Welcome message with inline keyboard
    this.bot.onText(/\/start/, async (msg) => {
      // Check if user has wallet
      const { data: wallet } = await this.supabase
        .from('wallets')
        .select('*')
        .eq('user_id', msg.from.id)
        .single();

      let welcomeMessage = `Welcome to BSC Trading & Memecoin Assistant! 🚀\n\n`;

      if (!wallet) {
        welcomeMessage += `❗ Please set up your trading wallet first using /setup_wallet\n\n`;
      }

      welcomeMessage += `I can help you with:
📊 Trading Analysis & Strategies
🪙 Memecoin Creation & Deployment
📈 Token Contract Development
💹 Market Analysis

Try these commands:
• /price BTC - Get BTC price analysis
• /deploy - Guide to deploying your memecoin
• /liquidity - Learn about liquidity pool setup
• /chart [token] - Get technical analysis
• /risk - Important risk management tips
• /trade [token] - Execute trades (requires wallet setup)

Type /help for more features!`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "📊 Price Analysis", callback_data: "menu_price" },
            { text: "📈 Trading Tools", callback_data: "menu_tools" }
          ],
          [
            { text: "🪙 Memecoin Guide", callback_data: "menu_memecoin" },
            { text: "⚠️ Risk Management", callback_data: "menu_risk" }
          ],
          [
            { text: "💰 Setup Wallet", callback_data: "setup_wallet" },
            { text: "🔄 Trade Now", callback_data: "trade_now" }
          ]
        ]
      };

      this.bot.sendMessage(msg.chat.id, welcomeMessage, {
        reply_markup: keyboard
      });
    });

    // Handle wallet setup
    this.bot.onText(/\/setup_wallet/, async (msg) => {
      await this.setupWalletFlow(msg.chat.id, msg.from.id);
    });

    // Handle trading command
    this.bot.onText(/\/trade (.+)/, async (msg, match) => {
      const symbol = match[1].toUpperCase();
      
      // Check if user has wallet setup
      const { data: wallet } = await this.supabase
        .from('wallets')
        .select('*')
        .eq('user_id', msg.from.id)
        .single();

      if (!wallet) {
        await this.bot.sendMessage(msg.chat.id, 
          "❌ Please set up your trading wallet first using /setup_wallet");
        return;
      }

      const tradeKeyboard = {
        inline_keyboard: [
          [
            { text: "🟢 Buy", callback_data: `trade_buy_${symbol}` },
            { text: "🔴 Sell", callback_data: `trade_sell_${symbol}` }
          ],
          [
            { text: "💰 Check Balance", callback_data: "trade_balance" },
            { text: "📊 Order History", callback_data: "trade_history" }
          ]
        ]
      };

      await this.bot.sendMessage(msg.chat.id, 
        `Trading Interface for ${symbol}\nWallet: ${wallet.address.slice(0,6)}...${wallet.address.slice(-4)}`, {
        reply_markup: tradeKeyboard
      });
    });

    // Handle callback queries from inline keyboard
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      
      if (query.data.startsWith('trade_')) {
        await this.handleTradeCallbacks(query);
        return;
      }

      if (query.data === 'setup_wallet') {
        await this.setupWalletFlow(chatId, query.from.id);
        return;
      }
      
      switch(query.data) {
        case 'menu_price':
          await this.sendPriceMenu(chatId);
          break;
        case 'menu_tools':
          await this.sendToolsMenu(chatId);
          break;
        case 'menu_memecoin':
          await this.sendMemecoinMenu(chatId);
          break;
        case 'menu_risk':
          await this.sendRiskMenu(chatId);
          break;
      }
      
      await this.bot.answerCallbackQuery(query.id);
    });
  }

  async setupWalletFlow(chatId, userId) {
    const msg = `🔐 *Wallet Setup*\n\n` +
      `To enable trading functionality, you need to:\n\n` +
      `1. Create a new BSC wallet or import existing one\n` +
      `2. Securely store your private key\n` +
      `3. Add funds to start trading\n\n` +
      `Choose an option:`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: "Create New Wallet", callback_data: "wallet_create" },
          { text: "Import Existing", callback_data: "wallet_import" }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, msg, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });
  }

  async handleTradeCallbacks(query) {
    const chatId = query.message.chat.id;
    const [action, type, symbol] = query.data.split('_');

    if (type === 'buy' || type === 'sell') {
      const keyboard = {
        inline_keyboard: [
          [
            { text: "25%", callback_data: `amount_${type}_25_${symbol}` },
            { text: "50%", callback_data: `amount_${type}_50_${symbol}` },
            { text: "75%", callback_data: `amount_${type}_75_${symbol}` },
            { text: "100%", callback_data: `amount_${type}_100_${symbol}` }
          ],
          [
            { text: "Custom Amount", callback_data: `amount_${type}_custom_${symbol}` }
          ]
        ]
      };

      await this.bot.sendMessage(chatId, 
        `Select amount to ${type} ${symbol}:`, {
        reply_markup: keyboard
      });
    }

    await this.bot.answerCallbackQuery(query.id);
  }
}

try {
  console.log("Starting BSC Trading & Memecoin Assistant...");
  const bot = new CryptoTradingBot();
  console.log("Bot is running...");
} catch (error) {
  console.error("Error starting bot:", error);
}
