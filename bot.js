const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

class CryptoTradingBot {
  constructor() {
    this.bot = new TelegramBot(process.env.TG_API_KEY, { polling: true });
    this.cloudflareEndpoint = "https://tradingbot.vandycklai.workers.dev/";
    this.setupHandlers();
  }

  setupHandlers() {
    // Welcome message with inline keyboard
    this.bot.onText(/\/start/, (msg) => {
      const welcomeMessage = `Welcome to BSC Trading & Memecoin Assistant! 🚀

I can help you with:
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
          ]
        ]
      };

      this.bot.sendMessage(msg.chat.id, welcomeMessage, {
        reply_markup: keyboard
      });
    });

    // Handle callback queries from inline keyboard
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      
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

    this.bot.onText(/\/help/, (msg) => {
      const helpMessage = `🤖 *Available Commands:*

*Trading Commands:*
/price [symbol] - Get price analysis
/chart [symbol] - Technical analysis
/trend [symbol] - Market trend analysis
/volume [symbol] - Trading volume insights
/alert [symbol] [price] - Set price alert
/portfolio - Track your portfolio
/convert [amount] [from] [to] - Currency converter

*Memecoin Development:*
/deploy - Token deployment guide
/contract - Contract creation steps
/liquidity - LP setup guide
/marketing - Marketing strategies
/audit - Security check guide
/tokenomics - Tokenomics calculator
/whitepaper - Whitepaper template

*Risk Management:*
/risk - Risk management tips
/security - Security best practices
/scam - Scam prevention guide
/calculator - Position size calculator
/leverage - Leverage risk calculator

*Market Research:*
/wallet [address] - BSC wallet analysis
/gas - Current BSC gas fees
/new - Latest BSC tokens
/trending - Trending memecoins
/sentiment - Market sentiment analysis
/news - Latest crypto news
/events - Upcoming crypto events

*Social Features:*
/community - Join our community
/feedback - Submit feedback
/donate - Support development
/report [issue] - Report issues

_Always DYOR and trade responsibly!_ 💡`;

      this.bot.sendMessage(msg.chat.id, helpMessage, {
        parse_mode: "Markdown",
      });
    });

    // Price command handler with custom keyboard
    this.bot.onText(/\/price (.+)/, async (msg, match) => {
      const symbol = match[1].toUpperCase();
      const keyboard = {
        keyboard: [
          ['1H Chart', '4H Chart', '1D Chart'],
          ['Buy/Sell Signals', 'Volume Analysis'],
          ['Back to Main Menu']
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      };
      
      await this.bot.sendMessage(msg.chat.id, `Analyzing ${symbol}...`, {
        reply_markup: keyboard
      });
      
      await this.getTradeAnalysis(
        msg.chat.id,
        `Analyze current price action for ${symbol}`
      );
    });

    // Portfolio tracking
    this.bot.onText(/\/portfolio/, async (msg) => {
      const portfolioKeyboard = {
        inline_keyboard: [
          [
            { text: "Add Asset", callback_data: "portfolio_add" },
            { text: "Remove Asset", callback_data: "portfolio_remove" }
          ],
          [
            { text: "View Portfolio", callback_data: "portfolio_view" },
            { text: "Performance", callback_data: "portfolio_performance" }
          ]
        ]
      };
      
      await this.bot.sendMessage(msg.chat.id, "Portfolio Management:", {
        reply_markup: portfolioKeyboard
      });
    });

    // Price alerts
    this.bot.onText(/\/alert (.+) (.+)/, async (msg, match) => {
      const symbol = match[1].toUpperCase();
      const targetPrice = match[2];
      await this.bot.sendMessage(
        msg.chat.id,
        `⚡ Alert set for ${symbol} at ${targetPrice} USDT`
      );
    });

    // Chart analysis handler with timeframe options
    this.bot.onText(/\/chart (.+)/, async (msg, match) => {
      const symbol = match[1].toUpperCase();
      const timeframes = {
        inline_keyboard: [
          [
            { text: "15m", callback_data: `chart_15m_${symbol}` },
            { text: "1h", callback_data: `chart_1h_${symbol}` },
            { text: "4h", callback_data: `chart_4h_${symbol}` }
          ],
          [
            { text: "1d", callback_data: `chart_1d_${symbol}` },
            { text: "1w", callback_data: `chart_1w_${symbol}` }
          ]
        ]
      };
      
      await this.bot.sendMessage(msg.chat.id, "Select Timeframe:", {
        reply_markup: timeframes
      });
      
      await this.getTradeAnalysis(
        msg.chat.id,
        `Provide detailed technical analysis for ${symbol} including support/resistance levels`
      );
    });

    // Other existing handlers...
    this.bot.onText(/\/deploy/, async (msg) => {
      await this.getTradeAnalysis(
        msg.chat.id,
        "Provide step-by-step guide for deploying a new memecoin on BSC"
      );
    });

    this.bot.onText(/\/liquidity/, async (msg) => {
      await this.getTradeAnalysis(
        msg.chat.id,
        "Explain how to properly set up and manage liquidity pools on BSC"
      );
    });

    this.bot.onText(/\/risk/, async (msg) => {
      await this.getTradeAnalysis(
        msg.chat.id,
        "Provide comprehensive risk management strategies for BSC trading"
      );
    });

    this.bot.on("message", async (msg) => {
      if (msg.text?.startsWith("/")) return;

      try {
        await this.getTradeAnalysis(msg.chat.id, msg.text);
      } catch (error) {
        console.error("Error processing message:", error);
        await this.bot.sendMessage(
          msg.chat.id,
          "❌ Sorry, I encountered an error. Please try again or use /help for available commands.",
          { reply_to_message_id: msg.message_id }
        );
      }
    });
  }

  async sendPriceMenu(chatId) {
    const menu = {
      inline_keyboard: [
        [
          { text: "BTC Price", callback_data: "price_btc" },
          { text: "ETH Price", callback_data: "price_eth" }
        ],
        [
          { text: "Custom Token", callback_data: "price_custom" },
          { text: "Price Alerts", callback_data: "price_alerts" }
        ]
      ]
    };
    
    await this.bot.sendMessage(chatId, "Price Analysis Menu:", {
      reply_markup: menu
    });
  }

  async sendToolsMenu(chatId) {
    const menu = {
      inline_keyboard: [
        [
          { text: "Position Calculator", callback_data: "tool_position" },
          { text: "Profit Calculator", callback_data: "tool_profit" }
        ],
        [
          { text: "Trading Journal", callback_data: "tool_journal" },
          { text: "Market Scanner", callback_data: "tool_scanner" }
        ]
      ]
    };
    
    await this.bot.sendMessage(chatId, "Trading Tools Menu:", {
      reply_markup: menu
    });
  }

  async getTradeAnalysis(chatId, prompt) {
    try {
      const response = await fetch(this.cloudflareEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error("API request failed");
      }

      const data = await response.json();

      // Format and send the response
      const formattedResponse = `🤖 *Analysis Results:*\n\n${data.response}`;

      await this.bot.sendMessage(chatId, formattedResponse, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
    } catch (error) {
      console.error("Error getting analysis:", error);
      throw error;
    }
  }
}

try {
  console.log("Starting BSC Trading & Memecoin Assistant...");
  const bot = new CryptoTradingBot();
  console.log("Bot is running...");
} catch (error) {
  console.error("Error starting bot:", error);
}
