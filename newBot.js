import TelegramBot from "node-telegram-bot-api";
import { createClient } from "@supabase/supabase-js";
import { Web3, HttpProvider } from "web3";
import dotenv from "dotenv";

export class CryptoTradingBot {
  constructor() {
    dotenv.config();
    var web3Provider = new HttpProvider("https://data-seed-prebsc-1-s1.binance.org:8545");
    this.web3 = new Web3(web3Provider);
    this.bot = new TelegramBot(process.env.TG_API_KEY, { polling: true });
    this.cloudflareEndpoint = "https://tradingbot.vandycklai.workers.dev/";
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
  }

  async handleStart(msg) {
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
    }

    async handleTrade(msg, match) {
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
    }

  // setupHandlers() {
  //   // Handle callback queries from inline keyboard
  //   this.bot.on("callback_query", async (query) => {
  //     const chatId = query.message.chat.id;

  //     if (query.data.startsWith("trade_")) {
  //       await this.handleTradeCallbacks(query);
  //       return;
  //     }

  //     if (query.data === "check_balance") {
  //       const { data: wallet } = await this.supabase
  //         .from("wallets")
  //         .select("*")
  //         .eq("user_id", query.from.id)
  //         .single();

  //       const balance = await this.web3.eth.getBalance(wallet.address);
  //       const balanceInEth = this.web3.utils.fromWei(balance, 'ether');
  //       let balanceMessage = `BNB: ${balanceInEth}\n`;

  //       await this.bot.sendMessage(
  //         chatId,
  //         `💰 Wallet Balance\n\nAddress: ${wallet.address.slice(
  //           0,
  //           6
  //         )}...${wallet.address.slice(-4)}\n\nBalances:\n${balanceMessage}\nChain: BSC`
  //       );
  //       return;
  //     }

  //     switch (query.data) {
  //       case "menu_price":
  //         await this.sendPriceMenu(chatId);
  //         break;
  //       case "menu_tools":
  //         await this.sendToolsMenu(chatId);
  //         break;
  //       case "menu_memecoin":
  //         await this.sendMemecoinMenu(chatId);
  //         break;
  //       case "menu_risk":
  //         await this.sendRiskMenu(chatId);
  //         break;
  //     }

  //     await this.bot.answerCallbackQuery(query.id);
  //   });
  // }

  // async handleTradeCallbacks(query) {
  //   const chatId = query.message.chat.id;
  //   const [action, type, symbol] = query.data.split("_");

  //   if (type === "buy" || type === "sell") {
  //     const { data: wallet } = await this.supabase
  //       .from("wallets")
  //       .select("*")
  //       .eq("user_id", query.from.id)
  //       .single();

  //     const balance = await this.web3.eth.getBalance(wallet.address);
  //     const balanceInEth = this.web3.utils.fromWei(balance, 'ether');
  //     let balanceMessage = `BNB: ${balanceInEth}\n`;

  //     const keyboard = {
  //       inline_keyboard: [
  //         [
  //           { text: "25%", callback_data: `amount_${type}_25_${symbol}` },
  //           { text: "50%", callback_data: `amount_${type}_50_${symbol}` },
  //           { text: "75%", callback_data: `amount_${type}_75_${symbol}` },
  //           { text: "100%", callback_data: `amount_${type}_100_${symbol}` },
  //         ],
  //         [
  //           {
  //             text: "Custom Amount",
  //             callback_data: `amount_${type}_custom_${symbol}`,
  //           },
  //         ],
  //       ],
  //     };

  //     await this.bot.sendMessage(
  //       chatId,
  //       `Select amount to ${type} ${symbol}:\n\nAvailable Balances:\n${balanceMessage}`,
  //       {
  //         reply_markup: keyboard,
  //       }
  //     );
  //   }

  //   await this.bot.answerCallbackQuery(query.id);
  // }
}
