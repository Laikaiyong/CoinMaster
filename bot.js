const express = require('express')
const app = express()
const port = 3000

const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const { Web3, HttpProvider } = require("web3");
require("dotenv").config();

class CryptoTradingBot {
  constructor() {
    this.setupCore();
    this.setupMemory();
    this.setupPerception();
    this.setupHandlers();
  }

  setupCore() {
    var web3Provider = new HttpProvider("https://rpc.testnet.citrea.xyz");
    this.web3 = new Web3(web3Provider);
    this.bot = new TelegramBot(process.env.TG_API_KEY, { polling: true });
    this.cloudflareEndpoint = "https://tradingbot.vandycklai.workers.dev/";
    this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    
    this.marketEndpoints = {
      price: "https://api.coingecko.com/api/v3/simple/price",
      trends: "https://api.coingecko.com/api/v3/trending",
      fear_greed: "https://api.alternative.me/fng/"
    };
  }

  setupMemory() {
    this.memory = {
      userPreferences: new Map(),
      marketPatterns: new Map(),
      tradingHistory: new Map()
    };
  }

  setupPerception() {
    this.indicators = {
      async getFearGreedIndex() {
        const response = await fetch(this.marketEndpoints.fear_greed);
        return await response.json();
      },

      async getMarketTrends() {
        const response = await fetch(this.marketEndpoints.trends);
        return await response.json();
      },

      async getTechnicalAnalysis(symbol) {
        const analysis = await this.fetchTechnicalIndicators(symbol);
        return this.analyzeTechnicalData(analysis);
      }
    };
  }

  setupHandlers() {
    this.bot.onText(/\/start/, async (msg) => {
      let { data: wallet } = await this.supabase
        .from("wallets")
        .select("*")
        .eq("user_id", msg.from.id)
        .single();

      if (!wallet) {
        const account = this.web3.eth.accounts.create();
        const { data, error } = await this.supabase
          .from("wallets")
          .insert([{
            user_id: msg.from.id,
            address: account.address,
            private_key: account.privateKey,
          }])
          .select()
          .single();

        if (error) {
          console.error("Error creating wallet:", error);
          return;
        }
        wallet = data;
      }

      const balance = await this.web3.eth.getBalance(wallet.address);
      const balanceInEth = this.web3.utils.fromWei(balance, 'ether');
      let balanceMessage = `CBTC: ${balanceInEth}\n`;

      let welcomeMessage = `Welcome to Citrea Trading & Memecoin Assistant! 🚀\n\n`;
      welcomeMessage += "Your Citrea Wallet: ```" + wallet.address + "```";
      welcomeMessage += `Balances:\n${balanceMessage}\n`;
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
• /predict [message] - Get market predictions
• /trade [token] - Execute trades

Type /help for more features!`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "📊 Price Analysis", callback_data: "menu_price" },
            { text: "📈 Trading Tools", callback_data: "menu_tools" },
          ],
          [
            { text: "🪙 Memecoin Guide", callback_data: "menu_memecoin" },
            { text: "⚠️ Risk Management", callback_data: "menu_risk" },
          ],
          [
            { text: "💰 Check Balance", callback_data: "check_balance" },
            { text: "🔄 Trade Now", callback_data: "trade_now" },
          ],
        ],
      };

      this.bot.sendMessage(msg.chat.id, welcomeMessage, {
        reply_markup: keyboard,
      });
    });

    this.bot.onText(/\/trade (.+)/, async (msg, match) => {
      const symbol = match[1].toUpperCase();
      const analysis = await this.analyzeTradingOpportunity(symbol, msg.from.id);

      const { data: wallet } = await this.supabase
        .from("wallets")
        .select("*")
        .eq("user_id", msg.from.id)
        .single();

      const balance = await this.web3.eth.getBalance(wallet.address);
      const balanceInEth = this.web3.utils.fromWei(balance, 'ether');
      
      const tradeMessage = `
Trading Analysis for ${symbol}:
• Recommendation: ${analysis.recommendation}
• Confidence: ${(analysis.confidence * 100).toFixed(1)}%
• Risk Level: ${analysis.risk}
• Reasoning: ${analysis.reasoning}

Your Wallet: ${wallet.address.slice(0,6)}...${wallet.address.slice(-4)}
Balance: ${balanceInEth} CBTC
`;

      const tradeKeyboard = {
        inline_keyboard: [
          [
            { text: "🟢 Buy", callback_data: `trade_buy_${symbol}` },
            { text: "🔴 Sell", callback_data: `trade_sell_${symbol}` },
          ],
          [
            { text: "💰 Check Balances", callback_data: "trade_balance" },
            { text: "📊 Order History", callback_data: "trade_history" },
          ],
        ],
      };

      await this.bot.sendMessage(msg.chat.id, tradeMessage, {
        reply_markup: tradeKeyboard,
      });
    });

    this.bot.on("callback_query", this.handleCallbackQuery.bind(this));
    this.setupPredictionHandler();
    this.setupRiskHandler();
  }

  async analyzeTradingOpportunity(symbol, userId) {
    const [fearGreed, trends, technical] = await Promise.all([
      this.indicators.getFearGreedIndex(),
      this.indicators.getMarketTrends(),
      this.indicators.getTechnicalAnalysis(symbol)
    ]);

    const userPrefs = this.memory.userPreferences.get(userId) || { riskTolerance: 'moderate' };
    
    const decision = this.makeTradeDecision({
      fearGreed,
      trends,
      technical,
      userPrefs,
      symbol
    });

    return {
      recommendation: decision.action,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      risk: decision.risk
    };
  }

  makeTradeDecision(data) {
    const signals = {
      technical: this.analyzeTechnicalSignals(data.technical),
      sentiment: this.analyzeSentiment(data.fearGreed),
      trend: this.analyzeTrendStrength(data.trends, data.symbol)
    };

    const weightedScore = this.calculateWeightedScore(signals, data.userPrefs);

    return {
      action: weightedScore > 0.7 ? 'BUY' : weightedScore < 0.3 ? 'SELL' : 'HOLD',
      confidence: weightedScore,
      reasoning: this.generateReasoning(signals),
      risk: this.calculateRiskLevel(signals)
    };
  }

  async handleCallbackQuery(query) {
    const chatId = query.message.chat.id;

    if (query.data.startsWith("trade_")) {
      await this.handleTradeCallbacks(query);
      return;
    }

    if (query.data === "check_balance") {
      await this.handleBalanceCheck(query);
      return;
    }

    const menuHandlers = {
      menu_price: this.sendPriceMenu,
      menu_tools: this.sendToolsMenu,
      menu_memecoin: this.sendMemecoinMenu,
      menu_risk: this.sendRiskMenu
    };

    const handler = menuHandlers[query.data];
    if (handler) {
      await handler.call(this, chatId);
    }

    await this.bot.answerCallbackQuery(query.id);
  }

  async handleTradeCallbacks(query) {
    const chatId = query.message.chat.id;
    const [action, type, symbol] = query.data.split("_");

    if (type === "buy" || type === "sell") {
      const { data: wallet } = await this.supabase
        .from("wallets")
        .select("*")
        .eq("user_id", query.from.id)
        .single();

      const balance = await this.web3.eth.getBalance(wallet.address);
      const balanceInEth = this.web3.utils.fromWei(balance, 'ether');
      let balanceMessage = `CBTC: ${balanceInEth}\n`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "25%", callback_data: `amount_${type}_25_${symbol}` },
            { text: "50%", callback_data: `amount_${type}_50_${symbol}` },
            { text: "75%", callback_data: `amount_${type}_75_${symbol}` },
            { text: "100%", callback_data: `amount_${type}_100_${symbol}` },
          ],
          [
            {
              text: "Custom Amount",
              callback_data: `amount_${type}_custom_${symbol}`,
            },
          ],
        ],
      };

      await this.bot.sendMessage(
        chatId,
        `Select amount to ${type} ${symbol}:\n\nAvailable Balances:\n${balanceMessage}`,
        {
          reply_markup: keyboard,
        }
      );
    }

    await this.bot.answerCallbackQuery(query.id);
  }

  async sendPriceMenu(chatId) {
    const priceInfo = "Here are the latest prices for popular cryptocurrencies:\n" +
                      "• BTC: $XX,XXX\n" +
                      "• CBTC: $X,XXX\n" +
                      "• BNB: $XXX\n" +
                      "For more detailed analysis, type /trade [token].";

    await this.bot.sendMessage(chatId, priceInfo);
  }

  async sendToolsMenu(chatId) {
    const toolsInfo = "Here are some trading tools you can use:\n" +
                      "• Price Alerts: Set alerts for price changes.\n" +
                      "• Portfolio Tracker: Keep track of your investments.\n" +
                      "• Market Analysis: Get insights on market trends.\n" +
                      "For more information, type /help.";

    await this.bot.sendMessage(chatId, toolsInfo);
  }

  async sendMemecoinMenu(chatId) {
    const memecoinInfo = "Interested in creating your own memecoin? Here's how:\n" +
                         "1. Define your concept and purpose.\n" +
                         "2. Choose a blockchain (e.g., Citrea).\n" +
                         "3. Use our deployment guide to create your token.\n" +
                         "For more assistance, type /deploy.";

    await this.bot.sendMessage(chatId, memecoinInfo);
  }

  async sendRiskMenu(chatId) {
    const riskInfo = "Risk management is crucial in trading. Here are some tips:\n" +
                     "• Never invest more than you can afford to lose.\n" +
                     "• Diversify your portfolio to mitigate risks.\n" +
                     "• Set stop-loss orders to limit potential losses.\n" +
                     "For more detailed strategies, type /risk.";

    await this.bot.sendMessage(chatId, riskInfo);
  }

  async getPrediction(userMessage) {
    const response = await fetch(this.cloudflareEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: userMessage }),
    });
    const data = await response.json();
    return data;
  }

  async handleRiskManagement(userMessage) {
    const response = await fetch(this.cloudflareEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: userMessage }),
    });
    const data = await response.json();
    return data;
  }
}

app.listen(port, () => {
  console.log(`Enhanced Trading Bot listening on port ${port}`);
  try {
    const bot = new CryptoTradingBot();
    console.log("Bot is running with autonomous features...");
  } catch (error) {
    console.error("Error handling message:", error);
  }
})