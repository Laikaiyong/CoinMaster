const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const { Web3, HttpProvider } = require("web3");
require("dotenv").config();

class CryptoTradingBot {
  constructor() {
    var web3Provider = new HttpProvider("https://data-seed-prebsc-1-s1.binance.org:8545");
    this.web3 = new Web3(web3Provider);
    this.bot = new TelegramBot(process.env.TG_API_KEY, { polling: true });
    this.cloudflareEndpoint = "https://tradingbot.vandycklai.workers.dev/";
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
    this.setupHandlers();
  }

  setupHandlers() {
    // Welcome message with inline keyboard
    this.bot.onText(/\/start/, async (msg) => {
      // Check if user has wallet
      let { data: wallet } = await this.supabase
        .from("wallets")
        .select("*")
        .eq("user_id", msg.from.id)
        .single();

      // Create wallet if doesn't exist
      if (!wallet) {
        const account = this.web3.eth.accounts.create();
        console.log(msg.from.id);
        console.log(account);
        const walletAddress = account.address;
        const { data, error } = await this.supabase
          .from("wallets")
          .insert([
            {
              user_id: msg.from.id,
              address: walletAddress,
              private_key: account.privateKey,
            },
          ])
          .select()
          .single();

        if (error) {
          console.error("Error creating wallet:", error);
          return;
        }
        wallet = data;
      }

      // Get account balance
      const balance = await this.web3.eth.getBalance(wallet.address);
      const balanceInEth = this.web3.utils.fromWei(balance, 'ether');
      let balanceMessage = `BNB: ${balanceInEth}\n`;

      let welcomeMessage = `Welcome to BSC Trading & Memecoin Assistant! 🚀\n\n`;
      welcomeMessage += `Your BSC Wallet: ${wallet.address.slice(
        0,
        6
      )}...${wallet.address.slice(-4)}\n`;
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
• /predict [message] - Get market predictions based on your input
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

    // Handle trading command
    this.bot.onText(/\/trade (.+)/, async (msg, match) => {
      const symbol = match[1].toUpperCase();

      // Get user's wallet
      const { data: wallet } = await this.supabase
        .from("wallets")
        .select("*")
        .eq("user_id", msg.from.id)
        .single();

      // Get account balance
      const balance = await this.web3.eth.getBalance(wallet.address);
      const balanceInEth = this.web3.utils.fromWei(balance, 'ether');
      let balanceMessage = `BNB: ${balanceInEth}\n`;

      const tradeKeyboard = {
        inline_keyboard: [
          [
            { text: "🟢 Buy", callback_data: `trade_buy_${symbol}` },
            { text: "🔴 Sell", callback_data: `trade_sell_${symbol}` },
          ],
          [
            {
              text: "💰 Check Balances",
              callback_data: "trade_balance",
            },
            { text: "📊 Order History", callback_data: "trade_history" },
          ],
        ],
      };

      await this.bot.sendMessage(
        msg.chat.id,
        `Trading Interface for ${symbol}\nWallet: ${wallet.address.slice(
          0,
          6
        )}...${wallet.address.slice(-4)}\nChain: BSC\n\nBalances:\n${balanceMessage}`,
        {
          reply_markup: tradeKeyboard,
        }
      );
    });

    // Handle callback queries from inline keyboard
    this.bot.on("callback_query", async (query) => {
      const chatId = query.message.chat.id;

      if (query.data.startsWith("trade_")) {
        await this.handleTradeCallbacks(query);
        return;
      }

      if (query.data === "check_balance") {
        const { data: wallet } = await this.supabase
          .from("wallets")
          .select("*")
          .eq("user_id", query.from.id)
          .single();

        const balance = await this.web3.eth.getBalance(wallet.address);
        const balanceInEth = this.web3.utils.fromWei(balance, 'ether');
        let balanceMessage = `BNB: ${balanceInEth}\n`;

        await this.bot.sendMessage(
          chatId,
          `💰 Wallet Balance\n\nAddress: ${wallet.address.slice(
            0,
            6
          )}...${wallet.address.slice(-4)}\n\nBalances:\n${balanceMessage}\nChain: BSC`
        );
        return;
      }

      switch (query.data) {
        case "menu_price":
          await this.sendPriceMenu(chatId);
          break;
        case "menu_tools":
          await this.sendToolsMenu(chatId);
          break;
        case "menu_memecoin":
          await this.sendMemecoinMenu(chatId);
          break;
        case "menu_risk":
          await this.sendRiskMenu(chatId);
          break;
      }

      await this.bot.answerCallbackQuery(query.id);
    });

    // Handle prediction command
    this.bot.onText(/\/predict (.+)/, async (msg, match) => {
      const userMessage = match[1];
      const prediction = await this.getPrediction("Predict the market for crypto: " +userMessage);
      const responseMessage = prediction.response.response; // Extracting the response from the LLM response

      await this.bot.sendMessage(msg.chat.id, `Prediction: ${responseMessage}`);
    });

    // Handle risk management command
    this.bot.onText(/\/risk/, async (msg, match) => {
      const userMessage = match[1];
      const riskAdvice = await this.handleRiskManagement("Provide some risk management tips on cryptocurrency trading");
      const responseMessage = riskAdvice.response.response; // Extracting the response from the LLM response

      await this.bot.sendMessage(msg.chat.id, `Risk Management Advice: ${responseMessage}`);
    });
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
      let balanceMessage = `BNB: ${balanceInEth}\n`;

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
                      "• ETH: $X,XXX\n" +
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
    const memecoinInfo = "Interested in creating your own memecoin? Here’s how:\n" +
                         "1. Define your concept and purpose.\n" +
                         "2. Choose a blockchain (e.g., BSC).\n" +
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
    return data; // Assuming the response contains the prediction
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
    return data; // Assuming the response contains the risk management advice
  }
}

try {
  const bot = new CryptoTradingBot();
  console.log("Bot is running...");
  
} catch (error) {
  console.error("Error handling message:", error);
}

