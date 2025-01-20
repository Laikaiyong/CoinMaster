const express = require("express");

const app = express();
const port = 3000;

const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const { Web3, HttpProvider } = require("web3");
const axios = require("axios");
const Groq = require("groq-sdk");
const ethers = require("ethers");
const erc20ABI = require("./erc20.json");
const res = require("express/lib/response");
require("dotenv").config();

const telegramBot = new TelegramBot(process.env.TG_API_KEY, { polling: true });

class TelegramDodoBot {

  constructor(telegramBot, supabaseUrl, supabaseKey, apiKey, rpcUrl) {
      this.bot = telegramBot;
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.rpcUrl = rpcUrl;
      this.apiKey = apiKey;
      this.dodoAPI = "https://api.dodoex.io/route-service/developer/swap";
      this.rpcProvider = new ethers.JsonRpcProvider(rpcUrl);
      this.setupPerception();
  }

  setupPerception() {
    this.indicators = {
      getCoinSentiment: async (contractAddress) => {
        try {
          // First fetch the coin list to find the id
          const coinListResponse = await fetch(
            `https://api.coingecko.com/api/v3/coins/list?include_platform=true&x_cg_demo_api_key=${process.env.CG_API_KEY}`
          );
          const coinList = await coinListResponse.json();

          // Find the coin with matching BSC contract address
          // const coin = coinList.find(
          //   (coin) =>
          //     coin.platforms &&
          //     coin.platforms["binance-smart-chain"] &&
          //     coin.platforms["binance-smart-chain"].toLowerCase() ===
          //       contractAddress.toLowerCase()
          // );

          const coin = coinList.find((coin) => {
            try {
                // Check if coin and platforms exist
                if (!coin || !coin.platforms || !coin.platforms["binance-smart-chain"]) {
                    return false;
                }
        
                // Ensure both addresses are strings and normalize them
                const platformAddress = String(coin.platforms["binance-smart-chain"]).toLowerCase();
                const searchAddress = String(contractAddress).toLowerCase();
        
                return platformAddress === searchAddress;
            } catch (error) {
                console.error("Error comparing addresses:", error);
                return false;
            }
          });

          if (!coin) {
            console.error(
              "Coin not found for contract address:",
              contractAddress
            );
            return null;
          }

          // Fetch detailed coin data using the found coin id
          const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/${coin.id}?x_cg_demo_api_key=${process.env.CG_API_KEY}&tickers=true&market_data=true&community_data=true&developer_data=true&sparkline=true`
          );
          const data = await response.json();
          return data;
        } catch (error) {
          console.error("Coin sentiment fetch error:", error);
          return null;
        }
      },

      getGlobalMetrics: async () => {
        try {
          const response = await fetch(
            "https://api.coingecko.com/api/v3/global/decentralized_finance_defi?x_cg_demo_api_key=${process.env.CG_API_KEY}"
          );
          const data = await response.json();
          return data;
        } catch (error) {
          console.error("Global DeFi metrics fetch error:", error);
          return null;
        }
      },
    };
  }

  async getUserPrivateKey(userId) {
      try {
          const { data, error } = await this.supabase
              .from('wallets')  // Replace with your table name
              .select('private_key')
              .eq('user_id', userId)
              .single();

          if (error) throw error;
          if (!data || !data.private_key) {
              throw new Error('No private key found for user');
          }

          return data.private_key;
      } catch (error) {
          console.error('Error fetching private key:', error);
          throw error;
      }
  }

  async handleBuyCommand(chatId, userId, tokenAddress, amount) {
      try {
          // Get user's private key from Supabase
          const privateKey = await this.getUserPrivateKey(userId);
          const wallet = new ethers.Wallet(privateKey, this.rpcProvider);

          await this.executeDodoSwap(chatId, tokenAddress, amount, wallet);

      } catch (error) {
          if (error.message === 'No private key found for user') {
              await this.bot.sendMessage(chatId, '❌ Please set up your private key first using the /setup command.');
          } else {
              console.error('Error in buy command:', error);
              await this.bot.sendMessage(chatId, '❌ An error occurred while processing your request.');
          }
      }
  }

  async executeDodoSwap(chatId, toTokenAddress, bnbAmount, wallet) {
      try {
          await this.bot.sendMessage(chatId, '🔄 Processing your swap request...');

          const fromTokenAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"; // BNB
          const fromAmount = ethers.parseUnits(bnbAmount.toString(), 18);

          // Get swap route from DODO API
          const response = await axios.get(this.dodoAPI, {
              params: {
                  fromTokenAddress,
                  toTokenAddress,
                  fromAmount: fromAmount.toString(),
                  slippage: 1.5,
                  userAddr: wallet.address,
                  chainId: 56,
                  rpc: this.rpcUrl,
                  apikey: this.apiKey,
              },
          });

          if (response.data.status === 200) {
              const routeObj = response.data.data;
              await this.bot.sendMessage(chatId, '📊 Got the best swap route. Preparing transaction...');

              // Check and handle allowance if needed
              if (fromTokenAddress !== "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
                  const hasApproved = await this.checkAllowance(
                      fromTokenAddress,
                      routeObj.to,
                      wallet.address,
                      fromAmount,
                      wallet
                  );

                  if (!hasApproved) {
                      await this.bot.sendMessage(chatId, '🔓 Approving tokens...');
                      await this.doApprove(fromTokenAddress, routeObj.to, fromAmount, wallet);
                      await this.bot.sendMessage(chatId, '✅ Tokens approved successfully');
                  }
              }

              // Estimate gas and prepare transaction
              const gasLimit = await wallet.estimateGas({
                  to: routeObj.to,
                  data: routeObj.data,
                  value: fromAmount,
              });

              const gasPrice = await wallet.getGasPrice();
              const nonce = await wallet.getTransactionCount();

              const tx = {
                  from: wallet.address,
                  to: routeObj.to,
                  value: fromAmount,
                  nonce,
                  gasLimit: ethers.utils.hexlify(gasLimit),
                  gasPrice: ethers.utils.hexlify(gasPrice),
                  data: routeObj.data,
              };

              // Execute the swap
              await this.bot.sendMessage(chatId, '🚀 Executing swap...');
              const result = await wallet.sendTransaction(tx);
              
              await this.bot.sendMessage(
                  chatId,
                  `✅ Swap successful!\nTransaction Hash: ${result.hash}\nView on BSCScan: https://bscscan.com/tx/${result.hash}`
              );
          }
      } catch (error) {
          console.error('Swap error:', error);
        
          let errorMessage = '❌ Error executing swap. Please try again later.';
          
          if (error.code === 'INSUFFICIENT_FUNDS') {
              errorMessage = '❌ Insufficient funds to complete the transaction.';
          } else if (error.message?.includes('user rejected')) {
              errorMessage = '❌ Transaction was rejected.';
          } else if (error.message?.includes('gas required exceeds allowance')) {
              errorMessage = '❌ Gas required exceeds balance. Please reduce the amount.';
          }
          
          await this.bot.sendMessage(chatId, errorMessage);
      }
  }

  async checkAllowance(tokenAddress, targetAddress, userAddress, fromAmount, wallet) {
      const erc20Contract = new ethers.Contract(tokenAddress, erc20ABI, wallet);
      const allowance = await erc20Contract.allowance(userAddress, targetAddress);
      return allowance.gt(fromAmount);
  }

  async doApprove(tokenAddress, targetAddress, fromAmount, wallet) {
      const erc20Contract = new ethers.Contract(tokenAddress, erc20ABI, wallet);
      const approveTx = await erc20Contract.approve(targetAddress, fromAmount);
      await approveTx.wait();
  }


  async handlePrice(chatId, tokenAddress) {
    try {
      // Fetch token info from GeckoTerminal
      const onchainData = await this.getOnchainMetrics(tokenAddress);
      const coinData = await this.indicators.getCoinSentiment(tokenAddress);

      // Get price chart image from GeckoTerminal
      const chartUrl = `${`https://www.geckoterminal.com/bsc/tokens/${tokenAddress}`}`;

      // Get BSCScan preview
      const bscscanUrl = `https://bscscan.com/token/${tokenAddress}`;

      const message = `
🪙 <b>${onchainData.name} (${onchainData.symbol})</b>

💰 Price: $${onchainData.price}

📊 Price Change: 
• 5m: ${onchainData.priceChange.m5}%
• 1h: ${onchainData.priceChange.h1}%
• 6h: ${onchainData.priceChange.h6}%
• 24h: ${onchainData.priceChange.h24}%

💎 24h Volume: $${onchainData.volume24h.toLocaleString()}

👥 Holders: ${""}

🔄 24h Transactions: 
• Buys: ${onchainData.transactions.h24.buys} (${
        onchainData.transactions.h24.buyers
      } buyers)
• Sells: ${onchainData.transactions.h24.sells} (${
        onchainData.transactions.h24.sellers
      } sellers)

🏊‍♂️ Top Liquidity Pool:
• Pool: ${onchainData.pool.name}
• Address: <code>${onchainData.pool.address}</code>
      `;
      const marketMessage = `
💼 Market Data:
• Market Cap Rank: #${coinData.market_cap_rank || 'N/A'}
• Market Cap: $${(coinData.market_data?.market_cap?.usd || 0).toLocaleString()}
• TVL: $${coinData.market_data?.total_value_locked || 0}
• MCap/TVL: ${coinData.market_data?.mcap_to_tvl_ratio || 'N/A'}
• FDV/TVL: ${coinData.market_data?.fdv_to_tvl_ratio || 'N/A'}
• MCap/FDV: ${coinData.market_data?.market_cap_fdv_ratio || 'N/A'}

📈 Price Info:
• Current: $${coinData.market_data?.current_price?.usd?.toFixed(8) || 0}
• ATH: $${coinData.market_data?.ath?.usd?.toFixed(8) || 0} (${coinData.market_data?.ath_change_percentage?.usd?.toFixed(2) || 0}%)
• ATL: $${coinData.market_data?.atl?.usd?.toFixed(8) || 0} (${coinData.market_data?.atl_change_percentage?.usd?.toFixed(2) || 0}%)

📊 Supply:
• Total: ${(coinData.market_data?.total_supply || 0)}
• Max: ${(coinData.market_data?.max_supply || 0)}
• FDV: $${(coinData.market_data?.fully_diluted_valuation?.usd || 0)}
• Circulating: ${(coinData.market_data?.circulating_supply || 0)}

📱 Trading Info:
• Spread: ${coinData.tickers?.[0]?.bid_ask_spread_percentage?.toFixed(4) || 'N/A'}%
• Trust Score: ${coinData.tickers?.[0]?.trust_score == "green" ? "✅" : "❌" || 'N/A'}
• Anomaly: ${coinData.tickers?.[0]?.is_anomaly ? "⚠️" : "✅" || 'N/A'}
• Stale: ${coinData.tickers?.[0]?.is_stale ? "⚠️" : "✅" || 'N/A'}

Last Updated: ${new Date(coinData.market_data?.last_updated).toLocaleString()}
    `;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "📈 Price Chart", url: chartUrl },
            { text: "🔍 BSCScan", url: bscscanUrl },
          ],
          [
            { text: "🛒 Buy", callback_data: `swap_execute_${tokenAddress}` },
            {
              text: "💰 Analysis",
              callback_data: `analysis_${tokenAddress}`,
            },
          ],
        ],
      };

      // Send message with chart image
      await this.bot.sendPhoto(chatId, onchainData.image_url);
      await this.bot.sendMessage(chatId, message, {
        parse_mode: "HTML"
      });
      await this.bot.sendMessage(chatId, marketMessage, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error("Price fetch error:", error);
      await this.bot.sendMessage(chatId, "Error fetching token information");
    }
  }


  async getOnchainMetrics(tokenAddress) {
    try {
      const response = await axios.get(
        `https://api.geckoterminal.com/api/v2/networks/bsc/tokens/${tokenAddress}?include=top_pools`
      );

      const { data, included } = response.data;
      const topPool = included[0];

      return {
        image_url: data.attributes.image_url ?? "",
        name: data.attributes.name,
        symbol: data.attributes.symbol,
        price: data.attributes.price_usd,
        volume24h: data.attributes.volume_usd.h24,
        liquidity: data.attributes.liquidity_usd,
        priceChange: topPool.attributes.price_change_percentage,
        transactions: topPool.attributes.transactions,
        pool: {
          address: topPool.attributes.address,
          name: topPool.attributes.name,
        },
      };
    } catch (error) {
      console.error("Error fetching onchain metrics:", error);
      return {
        name: "",
        symbol: "",
        price: 0,
        volume24h: 0,
        liquidity: 0,
        holders: 0,
        priceChange: 0,
        transactions: 0,
      };
    }
  }
}

class CryptoTradingBot {
  constructor(telegramBot) {
    this.bot = telegramBot;
    this.setupCore();
    this.setupMemory();
    this.setupPerception();
    this.setupHandlers();
    this.setupLLM();
  }

  setupCore() {
    var web3Provider = new HttpProvider(process.env.RPC_URL);
    this.web3 = new Web3(web3Provider);
    // this.bot = new TelegramBot(process.env.TG_API_KEY, { polling: true });
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    this.scannerUrl = process.env.SCANNER_URL;

    this.marketEndpoints = {
      coingecko: {
        proBase: "https://pro-api.coingecko.com/api/v3",
        base: "https://api.coingecko.com/api/v3",
        price: "/simple/price",
        trends: "/search/trending",
        coin: "/coins",
        global: "/global",
      },
      gecko_terminal: {
        base: "https://api.geckoterminal.com/api/v2",
        info: "/networks/bsc/tokens",
        dex: "/networks/bsc/dexes",
        pairs: "/networks/bsc/token_pairs",
      },
      dodoex: {
        base: "https://api.dodoex.io/api/v3",
        quote: "/quote",
        swap: "/swap",
      },
    };
  }

  setupMemory() {
    this.memory = {
      userPreferences: new Map(), // Store user risk tolerance, preferred coins, etc.
      marketPatterns: new Map(), // Store identified market patterns
      tradingHistory: new Map(), // Store past trades and their outcomes
      priceHistory: new Map(), // Store historical price data
      sentimentHistory: new Map(), // Store historical sentiment data
    };
  }

  setupLLM() {
    this.llm = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  setupPerception() {
    this.indicators = {
      getCoinSentiment: async (contractAddress) => {
        try {
          // First fetch the coin list to find the id
          const coinListResponse = await fetch(
            `${this.marketEndpoints.coingecko.base}/coins/list?include_platform=true&x_cg_demo_api_key=${process.env.CG_API_KEY}`
          );
          const coinList = await coinListResponse.json();

          // Find the coin with matching BSC contract address
          // const coin = coinList.find(
          //   (coin) =>
          //     coin.platforms &&
          //     coin.platforms["binance-smart-chain"] &&
          //     coin.platforms["binance-smart-chain"].toLowerCase() ===
          //       contractAddress.toLowerCase()
          // );

          const coin = coinList.find((coin) => {
            try {
                // Check if coin and platforms exist
                if (!coin || !coin.platforms || !coin.platforms["binance-smart-chain"]) {
                    return false;
                }
        
                // Ensure both addresses are strings and normalize them
                const platformAddress = String(coin.platforms["binance-smart-chain"]).toLowerCase();
                const searchAddress = String(contractAddress).toLowerCase();
        
                return platformAddress === searchAddress;
            } catch (error) {
                console.error("Error comparing addresses:", error);
                return false;
            }
          });

          if (!coin) {
            console.error(
              "Coin not found for contract address:",
              contractAddress
            );
            return null;
          }

          // Fetch detailed coin data using the found coin id
          const response = await fetch(
            `${this.marketEndpoints.coingecko.base}${this.marketEndpoints.coingecko.coin}/${coin.id}?x_cg_demo_api_key=${process.env.CG_API_KEY}&tickers=true&market_data=true&community_data=true&developer_data=true&sparkline=true`
          );
          const data = await response.json();
          return data;
        } catch (error) {
          console.error("Coin sentiment fetch error:", error);
          return null;
        }
      },

      getGlobalMetrics: async () => {
        try {
          const response = await fetch(
            "https://api.coingecko.com/api/v3/global/decentralized_finance_defi?x_cg_demo_api_key=${process.env.CG_API_KEY}"
          );
          const data = await response.json();
          return data;
        } catch (error) {
          console.error("Global DeFi metrics fetch error:", error);
          return null;
        }
      },
    };
  }

  setupHandlers() {
    // Start command handler
    this.bot.onText(/\/start/, async (msg) => {
      try {
        let { data: wallet } = await this.supabase
          .from("wallets")
          .select("*")
          .eq("user_id", msg.from.id)
          .single();
  
        if (!wallet || !wallet.address) {
          const account = this.web3.eth.accounts.create();
          const { data, error } = await this.supabase
            .from("wallets")
            .insert([
              {
                user_id: msg.from.id,
                address: account.address,
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
  
        // Get BNB balance
        const balance = await this.web3.eth.getBalance(wallet.address);
        const balanceInBNB = this.web3.utils.fromWei(balance, "ether");
  
        const message = `💰 Wallet Balance \n` +
          `BNB Balance: ${parseFloat(balanceInBNB).toFixed(4)} BNB\n\n`;
  
        let welcomeMessage = `Welcome to CoinMaster! 🚀\n\n`;
        welcomeMessage += `Your Wallet: <code>${wallet.address}</code> <a href="tg://copy/${wallet.address}">📋</a>\n\n`;
        welcomeMessage += message;
        welcomeMessage += `\nI can help you with:\n📊 Trading Analysis & Strategies\n💹 Market Analysis\n`;
  
        const keyboard = {
          inline_keyboard: [
            [
              { text: "🛒 Buy", callback_data: "buy" },
              { text: "🤑 Sell", callback_data: "sell" },
              { text: "💰 Check Balance", callback_data: "check_balance" }
            ],
            [
              { text: "📈 Price", callback_data: "price" },
              { text: "📊 Trending", callback_data: "trending" }
            ],
            [
              { text: "🤝 Help", callback_data: "help" },
              { text: "⚙️ Settings", callback_data: "settings" }
            ]
          ]
        };
  
        await this.bot.sendMessage(msg.chat.id, welcomeMessage, {
          parse_mode: "HTML",
          reply_markup: keyboard
        });
      } catch (error) {
        console.error("Error in start command:", error);
        await this.bot.sendMessage(msg.chat.id, "❌ An error occurred while setting up your wallet.");
      }
    });
  
    // Analysis command handler
    this.bot.onText(/\/analysis (.+)/, async (msg, match) => {
      const tokenAddress = match[1];
      await this.sendAnalysis(msg.chat.id, tokenAddress, msg.from.id);
    });
    
    // this.bot.onText(/\/trade/ (.+)/, async (msg, match) => {
    //   const tokenAddress = match[1];
    //   await this.handleTradeCallbacks(query);
    // });
  
    // Bind the callback query handler correctly
    this.bot.on("callback_query", async (query) => {
      try {
        await this.handleCallbackQuery(query);
      } catch (error) {
        console.error("Error in callback query handler:", error);
        await this.bot.sendMessage(query.message.chat.id, "❌ An error occurred while processing your request.");
      }
    });
  }

  async sendAnalysis(chatId, tokenAddress, userId) {
    const analysis = await this.analyzeTradingOpportunity(tokenAddress, userId);
    const technical = this.describeTechnicalSignals(analysis.signals.technical);
    const fundamentals = this.describeFundamentals(analysis.signals.fundamentals);
    const sentiment = this.describeSentiment(analysis.signals.sentiment);
  
    const tradeMessage = `
  ${technical}
  • Price Change: ${analysis.metrics.priceChange.h24}% (24h)

  ${fundamentals}

  ${sentiment}

  📊 Market Metrics:
  • Volume: $${analysis.metrics.volume24h}
  • Liquidity: $${analysis.metrics.liquidityUSD}
  • Market Cap: $${analysis.metrics.marketCap}
  `;
  
    const analysisMessage = `
  🤖 AI Analysis:
  ${analysis.analysis}
    `;
  
    const tradeKeyboard = {
      inline_keyboard: [
        [
          { text: "🛒 Buy", callback_data: `swap_execute_${tokenAddress}` },
          { text: "🔎 Analysis", callback_data: `analysis_${tokenAddress}` },
        ],
        [{ text: "💰 Check Balance", callback_data: "check_balance" }],
      ],
    };
  
    await this.bot.sendMessage(chatId, tradeMessage, {
      parse_mode: "Markdown",
    });
    await this.bot.sendMessage(chatId, analysisMessage, {
      parse_mode: "Markdown",
      reply_markup: tradeKeyboard,
    });
  }
  

  async handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    try {
      this.bot.answerCallbackQuery(query.id);
      
      if (query.data.startsWith('swap_execute_')) {
        const tokenAddress = query.data.replace('swap_execute_', '');
        try {
          const amountMessage = await this.bot.sendMessage(
            chatId,
            'Enter the amount of BNB you want to spend:',
            { reply_markup: { force_reply: true } }
          );
  
          const amountHandler = async (amountReply) => {
            try {
              this.bot.removeReplyListener(amountHandler);
              const amount = parseFloat(amountReply.text);
              if (isNaN(amount)) {
                await this.bot.sendMessage(amountReply.chat.id, '❌ Invalid amount. Please enter a valid number.');
                return;
              }
              await dodoBot.handleBuyCommand(amountReply.chat.id, amountReply.from.id, tokenAddress, amount);
            } catch (error) {
              console.error('Error processing amount:', error);
              await this.bot.sendMessage(amountReply.chat.id, '❌ Error processing the amount. Please try again.');
            }
          };
  
          this.bot.onReplyToMessage(amountMessage.chat.id, amountMessage.message_id, amountHandler);
        } catch (error) {
          console.error('Error in swap execution:', error);
          await this.bot.sendMessage(chatId, '❌ An error occurred while processing your request.');
        }
      } else if (query.data.startsWith('analysis_')) {
        const tokenAddress = query.data.replace('analysis_', '');
        await this.sendAnalysis(chatId ,tokenAddress, query.from.id);
      } else {
        // Handle other menu items
        switch (query.data) {
          case "buy":
            try {
              const sentMessage = await this.bot.sendMessage(
                chatId,
                'Enter the token contract address you want to buy (Eg: 0x...dac):',
                { reply_markup: { force_reply: true } }
              );
  
              const addressHandler = async (addressReply) => {
                try {
                  this.bot.removeReplyListener(addressHandler);
  
                  if (!addressReply.text) {
                    await this.bot.sendMessage(addressReply.chat.id, 'Invalid input. Please provide a valid contract address.');
                    return;
                  }
  
                  const tokenAddress = addressReply.text;
  
                  if (!ethers.isAddress(tokenAddress)) {
                    await this.bot.sendMessage(addressReply.chat.id, '❌ Invalid token address format. Please provide a valid address.');
                    return;
                  }
  
                  await dodoBot.handlePrice(addressReply.chat.id, tokenAddress);
                } catch (error) {
                  console.error('Error in buy handler:', error);
                  await this.bot.sendMessage(addressReply.chat.id, '❌ An error occurred while processing your request.');
                }
              };
  
              this.bot.onReplyToMessage(sentMessage.chat.id, sentMessage.message_id, addressHandler);
            } catch (error) {
              console.error('Error in buy command:', error);
              await this.bot.sendMessage(chatId, '❌ An error occurred while processing your request.');
            }
            break;
  
          case "sell":
            await this.bot.sendMessage(chatId, "Enter the token contract address you want to sell (Eg: 0x...dac):", 
              { reply_markup: { force_reply: true } });
            break;
  
          case "check_balance":
            await this.handleBalanceCheck(query);
            break;
  
          case "price":
            await this.sendPriceMenu(chatId);
            break;
  
          case "trending":
            await this.sendPool(chatId);
            break;
  
          case "help":
            const helpMessage = `
  🔄 *Wallet Commands*
  /start - Create or view your wallet
  
  *Menu*
  🛒 Buy - Buy any token on BNB Chain
  🤑 Sell - Sell any token you bought
  💰 Balance - Check current holdings of your wallet
  📈 Price - Check the current price
  📊 Trending - Find trending coins and pools on BNB Chain 
  🤝 Help - A helpful guide on CoinMaster 
  ⚙️ Settings - Check your wallet settings here
            `;
  
            await this.bot.sendMessage(chatId, helpMessage, {
              parse_mode: "Markdown",
              disable_web_page_preview: true
            });
            break;
  
          case "settings":
            await this.bot.sendMessage(chatId, "Test");
            break;
        }
      }
    } catch (error) {
      console.error('Callback query error:', error);
      await this.bot.sendMessage(chatId, "Error processing your request");
    }
  }
  
  async sendTrending(chatId) {
    try {
      // Fetch trending data
      const response = await fetch(
        `${this.marketEndpoints.coingecko.base}${this.marketEndpoints.coingecko.trends}?x_cg_demo_api_key=${process.env.CG_API_KEY}`
      );
      const data = await response.json();

      // First fetch coin list with platforms
      const coinListResponse = await fetch(
        `${this.marketEndpoints.coingecko.base}/coins/list?include_platform=true&x_cg_demo_api_key=${process.env.CG_API_KEY}`
      );
      const coinList = await coinListResponse.json();

      // Format trending coins message
      await this.bot.sendMessage(chatId, "🔥 *Trending Coins*\n\n", {
        parse_mode: "Markdown",
      });

      let bscAddress = "Not available on BSC";
      for (const { item } of data.coins) {
        try {
          // Find coin details including platform addresses
          const coinDetails = coinList.find((c) => c.id === item.id);
          bscAddress =
            coinDetails?.platforms?.["binance-smart-chain"] ||
            "Not available on BSC";

          await this.bot.sendPhoto(chatId, item.large);
          let coinMessage = `*${item.name}* (${item.symbol.toUpperCase()})\n`;
          coinMessage += `💰 Price: $${item.data.price}\n`;
          coinMessage += `📊 24h Volume: $${item.data.total_volume}\n`;

          if (bscAddress !== "Not available on BSC") {
            coinMessage += `🔗 BSC Address: ${bscAddress}\n\n`;

            // Add buy/sell options for BSC tokens
            const keyboard = {
              inline_keyboard: [
                [
                  { text: "🛒 Buy", callback_data: `swap_execute_${tokenAddress}` },
                  {
                    text: "💰 Sell",
                    callback_data: `trade_sell_${bscAddress}`,
                  },
                ],
              ],
            };

            await this.bot.sendMessage(chatId, coinMessage, {
              parse_mode: "Markdown",
              reply_markup: keyboard,
            });
          } else {
            await this.bot.sendMessage(chatId, coinMessage, {
              parse_mode: "Markdown",
            });
          }
        } catch (e) {
          console.log(e);
        }
      }
    } catch (error) {
      console.error("Error fetching trending:", error);
      await this.bot.sendMessage(chatId, "Error fetching market data");
    }
  }

  async sendPool(chatId) {
    try {
      // Fetch trending pool data from GeckoTerminal
      const response = await axios.get(
        `${this.marketEndpoints.gecko_terminal.base}/networks/bsc/trending_pools?page=1`
      );

      await this.bot.sendMessage(chatId, "🔥 *Trending Pools*\n\n", {
        parse_mode: "Markdown",
      });

      for (const pool of response.data.data) {
        try {
          const {
            attributes: {
              name,
              base_token_price_usd,
              volume_usd,
              price_change_percentage,
              transactions,
            },
            relationships: {
              base_token: { data: baseToken },
              dex: { data: dex },
            },
          } = pool;

          // Extract base token address by removing "bsc_" prefix
          const baseTokenAddress = baseToken.id.replace("bsc_", "");

          // Create GeckoTerminal chart URL
          const geckoTerminalUrl = `https://www.geckoterminal.com/bsc/pools/${pool.id.replace(
            "bsc_",
            ""
          )}`;

          let poolMessage = `*${name}*\n`;
          poolMessage += `💰 Price: $${parseFloat(base_token_price_usd).toFixed(
            4
          )}\n`;
          poolMessage += `📊 24h Volume: $${parseFloat(
            volume_usd.h24
          ).toLocaleString()}\n`;
          poolMessage += `📈 Price Change:\n`;
          poolMessage += `• 5m: ${price_change_percentage.m5}%\n`;
          poolMessage += `• 1h: ${price_change_percentage.h1}%\n`;
          poolMessage += `• 24h: ${price_change_percentage.h24}%\n\n`;
          poolMessage += `👥 24h Transactions:\n`;
          poolMessage += `• Buys: ${transactions.h24.buys} (${transactions.h24.buyers} buyers)\n`;
          poolMessage += `• Sells: ${transactions.h24.sells} (${transactions.h24.sellers} sellers)\n`;
          poolMessage += `🏦 DEX: ${dex.id}\n`;

          const keyboard = {
            inline_keyboard: [
              [{ text: "📈 View Chart", url: geckoTerminalUrl }],
              [
                {
                  text: "🛒 Buy",
                  callback_data: `swap_execute_${baseTokenAddress}`,
                },
                {
                  text: "💰 Analysis",
                  callback_data: `analysis_${baseTokenAddress}`,
                },
              ],
            ],
          };

          await this.bot.sendMessage(chatId, poolMessage, {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          });
        } catch (e) {
          console.log("Error processing pool:", e);
        }
      }
    } catch (error) {
      console.error("Error fetching trending pools:", error);
      await this.bot.sendMessage(chatId, "Error fetching trending pools data");
    }
  }

  async handlePrice(chatId, tokenAddress) {
    try {
      // Fetch token info from GeckoTerminal
      const onchainData = await this.getOnchainMetrics(tokenAddress);
      const coinData = await this.indicators.getCoinSentiment(tokenAddress);

      // Get price chart image from GeckoTerminal
      const chartUrl = `${`https://www.geckoterminal.com/bsc/tokens/${tokenAddress}`}`;

      // Get BSCScan preview
      const bscscanUrl = `${this.scannerUrl}token/${tokenAddress}`;

      const message = `
      🪙 <b>${onchainData.name} (${onchainData.symbol})</b>

💰 Price: $${onchainData.price}

📊 Price Change: 
• 5m: ${onchainData.priceChange.m5}%
• 1h: ${onchainData.priceChange.h1}%
• 6h: ${onchainData.priceChange.h6}%
• 24h: ${onchainData.priceChange.h24}%

💎 24h Volume: $${onchainData.volume24h.toLocaleString()}

👥 Holders: ${""}

🔄 24h Transactions: 
• Buys: ${onchainData.transactions.h24.buys} (${
        onchainData.transactions.h24.buyers
      } buyers)
• Sells: ${onchainData.transactions.h24.sells} (${
        onchainData.transactions.h24.sellers
      } sellers)

🏊‍♂️ Top Liquidity Pool:
• Pool: ${onchainData.pool.name}
• Address: <code>${onchainData.pool.address}</code>
      `;

      const marketMessage = `
💼 Market Data:
• Market Cap Rank: #${coinData.market_cap_rank || 'N/A'}
• Market Cap: $${(coinData.market_data?.market_cap?.usd || 0).toLocaleString()}
• TVL: $${coinData.market_data?.total_value_locked?.usd || 0}
• MCap/TVL: ${coinData.market_data?.mcap_to_tvl_ratio || 'N/A'}
• FDV/TVL: ${coinData.market_data?.fdv_to_tvl_ratio || 'N/A'}
• MCap/FDV: ${coinData.market_data?.market_cap_fdv_ratio || 'N/A'}

📈 Price Info:
• Current: $${coinData.market_data?.current_price?.usd?.toFixed(8) || 0}
• ATH: $${coinData.market_data?.ath?.usd?.toFixed(8) || 0} (${coinData.market_data?.ath_change_percentage?.usd?.toFixed(2) || 0}%)
• ATL: $${coinData.market_data?.atl?.usd?.toFixed(8) || 0} (${coinData.market_data?.atl_change_percentage?.usd?.toFixed(2) || 0}%)

📊 Supply:
• Total: ${(coinData.market_data?.total_supply || 0)}
• Max: ${(coinData.market_data?.max_supply || 0)}
• FDV: $${(coinData.market_data?.fully_diluted_valuation?.usd || 0)}
• Circulating: ${(coinData.market_data?.circulating_supply || 0)}

📱 Trading Info:
• Spread: ${coinData.tickers?.[0]?.bid_ask_spread_percentage?.toFixed(4) || 'N/A'}%
• Trust Score: ${coinData.tickers?.[0]?.trust_score == "green" ? "✅" : "❌" || 'N/A'}
• Anomaly: ${coinData.tickers?.[0]?.is_anomaly ? "⚠️" : "❌" || 'N/A'}
• Stale: ${coinData.tickers?.[0]?.is_stale ? "⚠️" : "❌" || 'N/A'}

Last Updated: ${new Date(coinData.market_data?.last_updated).toLocaleString()}
    `;

      const keyboard = {
        inline_keyboard: [
          [
        { text: "📈 Price Chart", url: chartUrl },
        { text: "🔍 BSCScan", url: bscscanUrl },
          ],
          [
        { text: "🛒 Buy", callback_data: `swap_execute_${tokenAddress}` },
        {
          text: "🔎 Analysis",
          callback_data: `analysis_${tokenAddress}`,
        },
          ],
        ],
      };

      // Send message with chart image
      await this.bot.sendPhoto(chatId, onchainData.image_url);
      await this.bot.sendMessage(chatId, message, {
        parse_mode: "HTML"
      });
      await this.bot.sendMessage(chatId, marketMessage, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error("Price fetch error:", error);
      await this.bot.sendMessage(chatId, "Error fetching token information");
    }
  }

  async handleOrder(chatId, tokenAddress) {
    try {
      // Get token data from GeckoTerminal
      const tokenData = await axios.get(
        `${this.marketEndpoints.gecko_terminal.base}/info/${tokenAddress}`
      );

      // Get DODO quote
      const quoteData = await axios.get(
        `${this.marketEndpoints.dodoex.base}/quote`,
        {
          params: {
            fromToken: tokenAddress,
            toToken: "BNB",
            amount: "1000000000000000000", // 1 token
          },
        }
      );

      const message = `
  Order Info for ${tokenData.data.name}:
  Current Price: $${tokenData.data.price_usd}
  Slippage: ${quoteData.data.priceImpact}%
  Gas Price: ${quoteData.data.gasPrice} GWEI
  
  Select action:
  `;

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "🛒 Market Buy",
              callback_data: `trade_buy_${tokenAddress}`,
            },
            {
              text: "💰 Market Sell",
              callback_data: `trade_sell_${tokenAddress}`,
            },
          ],
        ],
      };

      await this.bot.sendMessage(chatId, message, { reply_markup: keyboard });
    } catch (error) {
      console.error("Order info error:", error);
      await this.bot.sendMessage(chatId, "Error fetching order information");
    }
  }

  analyzeTechnicalSignals(coinData) {
    if (!coinData.market_data) return 0;

    const priceData = {
      current: coinData?.market_data?.current_price?.usd ?? 0,
      high24h: coinData?.market_data?.high_24h?.usd ?? 0,
      low24h: coinData?.market_data?.low_24h?.usd ?? 0,
      priceChange: coinData?.market_data?.price_change_percentage_24h ?? 0,
      priceChange7d: coinData?.market_data?.price_change_percentage_7d ?? 0,
      priceChange30d: coinData?.market_data?.price_change_percentage_30d ?? 0,
    };

    // Calculate basic technical indicators
    const rsi = this.calculateRSI(priceData);
    const momentum = this.calculateMomentum(priceData);
    const volatility = this.calculateVolatility(priceData);

    return {
      rsi: rsi,
      momentum: momentum,
      volatility: volatility,
      overallScore: (rsi + momentum + volatility) / 3,
    };
  }

  calculateRSI(priceData) {
    const change = priceData.priceChange;
    // Simplified RSI calculation
    return change > 0
      ? Math.min(0.8, change / 10)
      : Math.max(-0.8, change / 10);
  }

  calculateMomentum(priceData) {
    const shortTerm = priceData.priceChange / 100;
    const mediumTerm = priceData.priceChange7d / 100;
    const longTerm = priceData.priceChange30d / 100;

    return shortTerm * 0.5 + mediumTerm * 0.3 + longTerm * 0.2;
  }

  calculateVolatility(priceData) {
    const range = (priceData.high24h - priceData.low24h) / priceData.current;
    return range > 0.2 ? -0.5 : range > 0.1 ? -0.2 : 0.3;
  }

  analyzeSentiment(coinData) {
    if (!coinData) return 0;

    const sentimentFactors = {
      communityScore: coinData.community_score || 0,
      devScore: coinData.developer_score || 0,
      publicInterest: coinData.public_interest_score || 0,
      positiveVotes: coinData.sentiment_votes_up || 0,
      negativeVotes: coinData.sentiment_votes_down || 0,
    };

    const voteRatio =
      sentimentFactors.positiveVotes /
      (sentimentFactors.positiveVotes + sentimentFactors.negativeVotes || 1);

    const scores = {
      community: sentimentFactors.communityScore / 100,
      developer: sentimentFactors.devScore / 100,
      public: sentimentFactors.publicInterest / 100,
      votes: voteRatio,
    };

    return {
      community: scores.community,
      developer: scores.developer,
      public: scores.public,
      votes: scores.votes,
      overallScore:
        scores.community * 0.3 +
        scores.developer * 0.2 +
        scores.public * 0.2 +
        scores.votes * 0.3,
    };
  }

  analyzeTrendStrength(trends, symbol) {
    if (!trends?.coins) return 0;

    const coin = trends.coins.find(
      (c) => c.item.symbol.toLowerCase() === symbol.toLowerCase()
    );

    if (!coin)
      return {
        trending: 0,
        rank: 0,
        priceChange: 0,
        overallScore: 0,
      };

    const trendingScore = coin.item.score || 0;
    const marketCapRank = coin.item.market_cap_rank || 999;
    const priceChange = coin.item.price_change_percentage_24h || 0;

    return {
      trending: trendingScore,
      rank: Math.max(0, 1 - marketCapRank / 1000),
      priceChange:
        priceChange > 0
          ? Math.min(priceChange / 100, 1)
          : Math.max(priceChange / 100, -1),
      overallScore:
        trendingScore * 0.4 +
        Math.max(0, 1 - marketCapRank / 1000) * 0.3 +
        Math.max(-1, Math.min(1, priceChange / 100)) * 0.3,
    };
  }

  analyzeMarketConditions(globalMetrics) {
    if (!globalMetrics?.data) return 0;

    const metrics = {
      defiMarketCap: parseFloat(globalMetrics.data.defi_market_cap),
      ethMarketCap: parseFloat(globalMetrics.data.eth_market_cap),
      defiToEthRatio: parseFloat(globalMetrics.data.defi_to_eth_ratio),
      volume24h: parseFloat(globalMetrics.data.trading_volume_24h),
      defiDominance: parseFloat(globalMetrics.data.defi_dominance),
      topCoinDominance: parseFloat(globalMetrics.data.top_coin_defi_dominance),
    };

    // Calculate key indicators
    const volumeToDefiMcap = metrics.volume24h / metrics.defiMarketCap;
    const marketHealth = metrics.defiToEthRatio > 20 ? 0.7 : 0.4; // Higher ratio indicates healthier DeFi market
    const dominanceImpact = metrics.defiDominance > 5 ? 0.8 : 0.3; // Higher DeFi dominance is positive
    const topCoinRisk = metrics.topCoinDominance > 25 ? 0.3 : 0.7; // Lower top coin dominance means less concentration risk

    return {
      liquidity: Math.min(volumeToDefiMcap, 1),
      health: marketHealth,
      dominance: dominanceImpact,
      concentration: topCoinRisk,
      overallScore:
        volumeToDefiMcap * 0.25 +
        marketHealth * 0.3 +
        dominanceImpact * 0.25 +
        topCoinRisk * 0.2,
    };
  }


  async analyzeTradingOpportunity(symbol, userId) {
    try {
      // Fetch basic coin data and market conditions
      const [coinData, globalMetrics] = await Promise.all([
        this.indicators.getCoinSentiment(symbol),
        this.indicators.getGlobalMetrics(),
      ]);

      if (!coinData) {
        throw new Error("Unable to fetch coin data");
      }

      // Fetch onchain metrics from GeckoTerminal
      const onchainMetrics = await this.getOnchainMetrics(symbol);

      // Combine all signals including onchain data
      const signals = {
        technical: this.analyzeTechnicalSignals(coinData),
        fundamentals: this.analyzeFundamentals(coinData),
        sentiment: this.analyzeSentiment(coinData),
        market: this.analyzeMarketConditions(globalMetrics),
        volume: this.analyzeVolumeProfile(coinData),
        onchain: this.analyzeOnchainMetrics(onchainMetrics), // New analysis
      };

      const llmAnalysis = await this.getLLMAnalysis(
        coinData,
        signals,
        onchainMetrics // Pass onchain data to LLM
      );

      return {
        signals: signals,
        analysis: llmAnalysis,
        reasoning: this.generateDetailedReasoning(signals, llmAnalysis),
        risk: this.calculateRiskLevel(signals),
        metrics: {
          // Basic metrics
          price: coinData?.market_data?.current_price?.usd ?? 0,
          priceChange24h:
            coinData?.market_data?.price_change_percentage_24h ?? 0,
          volume24h: coinData?.market_data?.total_volume?.usd ?? 0,
          marketCap: coinData?.market_data?.market_cap?.usd ?? 0,
          marketCapRank: coinData.market_cap_rank,
          // Onchain metrics
          name: onchainMetrics.name,
          symbol: onchainMetrics.symbol,
          currentPrice: onchainMetrics.price,
          volume24h: onchainMetrics.volume24h,
          liquidityUSD: onchainMetrics.liquidity,
          holders: onchainMetrics.holders,
          priceChange: onchainMetrics.priceChange,
          transactions24h: onchainMetrics.transactions,
        },
      };
    } catch (error) {
      console.error("Analysis error:", error);
      return {
        recommendation: "HOLD",
        confidence: 0.5,
        reasoning: "Error analyzing market conditions",
        risk: "UNKNOWN",
      };
    }
  }

  // Add new method to fetch onchain metrics
  async getOnchainMetrics(tokenAddress) {
    try {
      const response = await axios.get(
        `${this.marketEndpoints.gecko_terminal.base}/networks/bsc/tokens/${tokenAddress}?include=top_pools`
      );

      const { data, included } = response.data;
      const topPool = included[0];

      return {
        image_url: data.attributes.image_url ?? "",
        name: data.attributes.name,
        symbol: data.attributes.symbol,
        price: data.attributes.price_usd,
        volume24h: data.attributes.volume_usd.h24,
        liquidity: data.attributes.total_reserve_in_usd,
        priceChange: topPool.attributes.price_change_percentage,
        transactions: topPool.attributes.transactions,
        pool: {
          address: topPool.attributes.address,
          name: topPool.attributes.name,
        },
      };
    } catch (error) {
      console.error("Error fetching onchain metrics:", error);
      return {
        name: "",
        symbol: "",
        price: 0,
        volume24h: 0,
        liquidity: 0,
        holders: 0,
        priceChange: 0,
        transactions: 0,
      };
    }
  }

  // Add new method to analyze onchain metrics
  analyzeOnchainMetrics(metrics) {
    if (!metrics) return { score: 0 };

    // Normalize metrics to 0-1 scale
    const liquidityScore = Math.min(metrics.liquidity / 1000000, 1);
    const volumeScore = Math.min(metrics.volume24h / 100000, 1);
    const priceMovement = Math.abs(metrics.priceChange) / 100;

    // Analyze transaction activity from pool data
    const txActivity = metrics.transactions?.h24 || {};
    const totalTx = (txActivity.buys || 0) + (txActivity.sells || 0);
    const txScore = Math.min(totalTx / 1000, 1);

    // Calculate buy/sell ratio
    const buyRatio = txActivity.buys / (totalTx || 1);
    const sellRatio = txActivity.sells / (totalTx || 1);
    const buyPressure = buyRatio > 0.6 ? 0.8 : buyRatio > 0.4 ? 0.5 : 0.2;

    // Volume to liquidity ratio for health check
    const volumeToLiquidity = metrics.volume24h / (metrics.liquidity || 1);
    const healthScore =
      volumeToLiquidity > 0.5 ? 0.8 : volumeToLiquidity > 0.1 ? 0.5 : 0.2;

    return {
      liquidity: liquidityScore,
      volume: volumeScore,
      transactions: txScore,
      priceMovement: priceMovement,
      buyPressure: buyPressure,
      health: healthScore,
      poolInfo: {
        name: metrics.pool?.name || "Unknown",
        address: metrics.pool?.address || "",
      },
      score:
        (liquidityScore + volumeScore + txScore + buyPressure + healthScore) /
        5,
    };
  }

  async createOrder(symbol, type, side, amount, price = null, params = {}) {
    try {
      // Convert parameter format for Hyperliquid
      const orderParams = {
        ...params,
        marginMode: "cross", // Hyperliquid default
        leverage: params.leverage || 1,
      };

      let order;
      switch (type.toLowerCase()) {
        case "market":
          order = await this.exchange.createOrder(
            symbol,
            "market",
            side,
            amount,
            undefined,
            orderParams
          );
          break;

        case "limit":
          if (!price) throw new Error("Price required for limit orders");
          order = await this.exchange.createOrder(
            symbol,
            "limit",
            side,
            amount,
            price,
            orderParams
          );
          break;

        case "stop":
          if (!params.stopPrice) throw new Error("Stop price required");
          order = await this.exchange.createOrder(
            symbol,
            "stop",
            side,
            amount,
            price,
            {
              ...orderParams,
              stopPrice: params.stopPrice,
              triggerType: "mark_price",
            }
          );
          break;

        default:
          throw new Error(`Unsupported order type: ${type}`);
      }

      return {
        success: true,
        orderId: order.id,
        status: order.status,
        details: {
          symbol: order.symbol,
          side: order.side,
          amount: order.amount,
          price: order.price,
          type: order.type,
          timestamp: order.timestamp,
        },
      };
    } catch (error) {
      console.error("Order creation error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getLLMAnalysis(coinData, signals, onchainMetrics) {
    try {
      // Format metrics and signals into structured data for analysis
      const analysisData = {
        price_metrics: {
          current_price: coinData?.market_data?.current_price?.usd,
          price_change_24h: coinData?.market_data?.price_change_percentage_24h,
          market_cap: coinData?.market_data?.market_cap?.usd,
          volume_24h: coinData?.market_data?.total_volume?.usd,
        },
        technical_indicators: {
          rsi: signals.technical?.rsi || 0,
          momentum: signals.technical?.momentum || 0,
          volatility: signals.technical?.volatility || 0,
        },
        sentiment_metrics: {
          community_score: signals.sentiment?.community || 0,
          developer_score: signals.sentiment?.developer || 0,
          public_interest: signals.sentiment?.public || 0,
        },
        market_conditions: {
          defi_dominance: signals.market?.dominance || 0,
          market_health: signals.market?.health || 0,
          concentration_risk: signals.market?.concentration || 0,
          liquidity_score: signals.market?.liquidity || 0,
        },
        volume_profile: signals.volume || 0,
        onchain_metrics: {
          name: onchainMetrics.name || "",
          symbol: onchainMetrics.symbol || "",
          price: onchainMetrics.price || 0,
          volume24h: onchainMetrics.volume24h || 0,
          liquidity_usd: onchainMetrics.liquidity || 0,
          transactions: {
            h24: onchainMetrics.transactions?.h24 || {
              buys: 0,
              sells: 0,
              buyers: 0,
              sellers: 0,
            },
          },
          price_change: {
            m5: onchainMetrics.priceChange?.m5 || 0,
            h1: onchainMetrics.priceChange?.h1 || 0,
            h6: onchainMetrics.priceChange?.h6 || 0,
            h24: onchainMetrics.priceChange?.h24 || 0,
          },
          pool_info: {
            name: onchainMetrics.pool?.name || "",
            address: onchainMetrics.pool?.address || "",
          },
        },
      };

      const prompt = {
        market_data: analysisData,
        request:
          "Analyze this crypto data and provide a detailed trading recommendation",
      };

      const response = await this.llm.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are a crypto trading expert. Analyze market data and provide specific recommendations.",
          },
          {
            role: "user",
            content: `Provide a trading analysis for ${
              coinData.description
            } for this data: ${JSON.stringify(
              prompt,
              null,
              2
            )}. Include action (BUY/SELL/HOLD), confidence (0% - 100%), reasons (string), and risk (LOW/MEDIUM/HIGH) with comprehensive explanation, make sure it is within 3000 characters`,
          },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
      });

      if (
        !response ||
        !response.choices ||
        !response.choices[0]?.message?.content
      ) {
        throw new Error("Invalid response from Groq");
      }

      const cleanContent = response.choices[0].message.content; // Extract JSON object

      return cleanContent;
    } catch (error) {
      console.error("LlamaAI analysis error:", error);
      return {
        recommendation: "HOLD",
        confidence: 0.5,
        reasoning: ["Analysis unavailable"],
        risk: "MEDIUM",
      };
    }
  }

  getRecommendation(weightedScore, llmAnalysis) {
    const baseRecommendation = {
      action: "HOLD",
      confidence: 0.5,
    };

    if (!weightedScore) return baseRecommendation;

    // Combine algorithmic and LLM recommendations
    const algorithmicAction = this.getAlgorithmicAction(weightedScore);
    const llmAction = llmAnalysis?.recommendation || "HOLD";
    const llmConfidence = llmAnalysis?.confidence || 0.5;

    // Weight algorithmic vs LLM recommendations
    const confidence = weightedScore * 0.6 + llmConfidence * 0.4;

    // If both agree, increase confidence
    const action =
      algorithmicAction === llmAction
        ? algorithmicAction
        : confidence > 0.7
        ? algorithmicAction
        : "HOLD";

    return {
      action,
      confidence: Math.min(0.95, confidence),
    };
  }

  getAlgorithmicAction(score) {
    if (score > 0.7) return "STRONG BUY";
    if (score > 0.3) return "BUY";
    if (score < -0.7) return "STRONG SELL";
    if (score < -0.3) return "SELL";
    return "HOLD";
  }

  calculateRiskLevel(signals) {
    const riskFactors = {
      technical: Math.abs(signals.technical.overallScore || 0),
      sentiment: Math.abs(signals.sentiment.overallScore || 0),
      volume: signals.volume || 0,
      market: signals.market?.overallScore || 0.5,
      volatility: signals.technical?.volatility || 0,
    };

    const riskScore =
      riskFactors.technical * 0.3 +
      riskFactors.sentiment * 0.2 +
      (1 - riskFactors.volume) * 0.2 +
      (1 - riskFactors.market) * 0.15 +
      riskFactors.volatility * 0.15;

    if (riskScore > 0.7) return "HIGH";
    if (riskScore > 0.4) return "MEDIUM";
    return "LOW";
  }

  analyzeFundamentals(coinData) {
    return {
      developerActivity: this.analyzeDeveloperActivity(coinData.developer_data),
      marketMaturity: this.analyzeMarketMaturity(coinData.market_data),
      tokenomics: this.analyzeTokenomics(coinData),
    };
  }

  analyzeDeveloperActivity(devData) {
    if (!devData) return 0;

    const metrics = {
      commits: devData.commit_count_4_weeks || 0,
      contributors: devData.contributors_count || 0,
      stars: devData.stars || 0,
    };

    return (
      (metrics.commits * 0.4 +
        metrics.contributors * 0.4 +
        metrics.stars * 0.2) /
      100
    );
  }

  analyzeMarketMaturity(marketData) {
    if (!marketData) return 0;

    const liquidityScore =
      marketData.total_volume.usd / marketData.market_cap.usd;
    const priceStability =
      1 - Math.abs(marketData.price_change_percentage_24h / 100);

    return liquidityScore * 0.6 + priceStability * 0.4;
  }

  analyzeTokenomics(coinData) {
    if (!coinData.market_data) return 0;

    const circulatingSupply = coinData?.market_data?.circulating_supply ?? 0;
    const totalSupply = coinData?.market_data?.total_supply ?? 0;
    const supplyRatio = circulatingSupply / totalSupply;

    return supplyRatio > 0.7 ? 0.8 : supplyRatio > 0.4 ? 0.5 : 0.2;
  }

  analyzeVolumeProfile(coinData) {
    if (!coinData.market_data) return 0;

    const volume24h = coinData?.market_data?.total_volume?.usd ?? 0;
    const marketCap = coinData?.market_data?.market_cap?.usd ?? 0;
    const volumeToMcapRatio = volume24h / marketCap;

    // Higher ratio indicates higher liquidity and trading activity
    return Math.min(volumeToMcapRatio * 10, 1);
  }

  async getUserRiskProfile(userId) {
    try {
      const { data: profile } = await this.supabase
        .from("user_profiles")
        .select("risk_tolerance, investment_horizon, portfolio_size")
        .eq("user_id", userId)
        .single();

      return (
        profile || {
          risk_tolerance: "moderate",
          investment_horizon: "medium",
          portfolio_size: "small",
        }
      );
    } catch (error) {
      console.error("Error fetching user risk profile:", error);
      return {
        risk_tolerance: "moderate",
        investment_horizon: "medium",
        portfolio_size: "small",
      };
    }
  }

  calculateWeightedScore(signals, userRiskProfile) {
    const baseWeights = {
      technical: 0.25,
      fundamentals: 0.2,
      sentiment: 0.15,
      trend: 0.15,
      market: 0.15,
      volume: 0.1,
    };

    // Adjust weights based on user risk profile
    const adjustedWeights = this.adjustWeightsForRiskProfile(
      baseWeights,
      userRiskProfile
    );

    return Object.entries(signals).reduce((score, [key, value]) => {
      const weight = adjustedWeights[key] || baseWeights[key];
      return score + this.normalizeSignal(value) * weight;
    }, 0);
  }

  adjustWeightsForRiskProfile(weights, profile) {
    const adjusted = { ...weights };

    switch (profile.risk_tolerance) {
      case "conservative":
        adjusted.fundamentals *= 1.3;
        adjusted.technical *= 0.7;
        break;
      case "aggressive":
        adjusted.technical *= 1.3;
        adjusted.trend *= 1.2;
        adjusted.fundamentals *= 0.7;
        break;
    }

    // Normalize weights to sum to 1
    const sum = Object.values(adjusted).reduce((a, b) => a + b, 0);
    Object.keys(adjusted).forEach((key) => (adjusted[key] /= sum));

    return adjusted;
  }

  normalizeSignal(signal) {
    if (typeof signal === "number") return signal;
    if (typeof signal === "object") {
      return (
        Object.values(signal).reduce(
          (sum, val) => sum + this.normalizeSignal(val),
          0
        ) / Object.values(signal).length
      );
    }
    return 0;
  }

  generateDetailedReasoning(signals, llmAnalysis) {
    const reasons = [];

    // Technical Analysis
    if (signals.technical) {
      reasons.push(
        `Technical Analysis: ${this.describeTechnicalSignals(
          signals.technical
        )}`
      );
    }

    // Fundamental Analysis
    if (signals.fundamentals) {
      reasons.push(
        `Fundamental Analysis: ${this.describeFundamentals(
          signals.fundamentals
        )}`
      );
    }

    // Market Sentiment
    if (signals.sentiment) {
      reasons.push(
        `Market Sentiment: ${this.describeSentiment(signals.sentiment)}`
      );
    }

    // LLM Analysis
    if (llmAnalysis && llmAnalysis.reasoning) {
      reasons.push(`AI Analysis: ${llmAnalysis.reasoning}`);
    }

    return reasons.join("\n\n");
  }

  describeTechnicalSignals(technical) {
    if (!technical) return "Insufficient technical data";

    const rsiStatus =
      technical.rsi > 0.5
        ? "overbought"
        : technical.rsi < -0.5
        ? "oversold"
        : "neutral";
    const momentumTrend =
      technical.momentum > 0.2
        ? "bullish"
        : technical.momentum < -0.2
        ? "bearish"
        : "sideways";
    const volatilityLevel =
      technical.volatility < -0.3
        ? "high"
        : technical.volatility > 0.2
        ? "low"
        : "moderate";
    return `📊 Technical Analysis:

• RSI indicates ${rsiStatus} conditions
• Momentum is showing ${momentumTrend} trend  
• Volatility level is ${volatilityLevel}`;
  }
  describeFundamentals(fundamentals) {
    if (!fundamentals) return "❌ Insufficient fundamental data";

    const devActivity = 
      fundamentals.developerActivity > 0.6 
        ? "💪 strong"
        : fundamentals.developerActivity > 0.3
          ? "👍 moderate" 
          : "⚠️ low";

    const marketMaturity =
      fundamentals.marketMaturity > 0.6
        ? "🏛️ mature"
        : fundamentals.marketMaturity > 0.3 
          ? "🌱 developing"
          : "🐣 early stage";

    const tokenomicsHealth =
      fundamentals.tokenomics > 0.6
        ? "✅ healthy"
        : fundamentals.tokenomics > 0.3
          ? "⚖️ moderate"
          : "⚠️ concerning";

    return `📊 *Fundamental Analysis*:

• Developer Activity: ${devActivity}
• Market Maturity: ${marketMaturity} 
• Tokenomics Health: ${tokenomicsHealth}`;
  }

  describeSentiment(sentiment) {
    if (!sentiment) return "❌ Insufficient sentiment data";

    const communityStatus =
      sentiment.community > 0.6
        ? "🔥 very positive"
        : sentiment.community > 0.3
          ? "👍 positive"
          : "😐 neutral";

    const devConfidence =
      sentiment.developer > 0.6
        ? "⭐ high"
        : sentiment.developer > 0.3
          ? "👨‍💻 moderate"
          : "⚠️ low";

    const publicInterest =
      sentiment.public > 0.6
        ? "📈 strong"
        : sentiment.public > 0.3
          ? "👥 moderate"
          : "📉 low";

    return `🎯 *Market Sentiment*:

• Community Sentiment: ${communityStatus}
• Developer Confidence: ${devConfidence}
• Public Interest: ${publicInterest}`;
  }

  async handleBalanceCheck(query) {
    try {
      // Get user's wallet from Supabase
      const { data: wallet } = await this.supabase
        .from("wallets")
        .select("*")
        .eq("user_id", query.from.id)
        .single();

      if (!wallet) {
        await this.bot.sendMessage(
          query.message.chat.id,
          "No wallet found. Please use /start to create one."
        );
        return;
      }

      // Get BNB balance
      const balance = await this.web3.eth.getBalance(wallet.address);
      const balanceInBNB = this.web3.utils.fromWei(balance, "ether");

      const bscScanUrl = `${this.scannerUrl}address/${wallet.address}`;

      const message =
        `💰 *Wallet Balance*\n\n` +
        `Address: \`${wallet.address}\`\n` +
        `BNB Balance: ${parseFloat(balanceInBNB).toFixed(4)} BNB`;

      const keyboard = {
        inline_keyboard: [[{ text: "🔍 View on BSCScan", url: bscScanUrl }]],
      };

      await this.bot.sendMessage(query.message.chat.id, message, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error("Balance check error:", error);
      await this.bot.sendMessage(
        query.message.chat.id,
        "Error checking balance"
      );
    }
  }

  async handleTradeCallbacks(query) {
    const [action, type, tokenAddress] = query.data.split("_");

    if (!tokenAddress) {
      // Ask user for token address input
      const message = "Please enter the token address (BSC) to trade:";
      await this.bot.sendMessage(query.message.chat.id, message);

      // Set up one-time listener for the next message
      this.bot.once("message", async (msg) => {
        const tokenAddress = msg.text.trim();

        // Basic validation of token address format
        if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
          await this.bot.sendMessage(
            msg.chat.id,
            "Invalid token address format. Please try again."
          );
          return;
        }

        // Trigger the appropriate trade action
        const tradeAction = `trade_${type}_${tokenAddress}`;
        await this.handleTradeCallbacks({
          ...query,
          data: tradeAction,
          message: { ...query.message, text: tokenAddress },
        });
      });
    } else {
      if (type === "buy") {
        try {
          // Token address to be parsed in to buy
          // Get quote from DODO
        } catch (error) {
          console.error("Trade setup error:", error);
          await this.bot.sendMessage(
            query.message.chat.id,
            "Error setting up trade"
          );
        }
      } else {
        // Token address to be parsed in to sell
      }

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "25%",
              callback_data: `amount_${type}_25_${tokenAddress}`,
            },
            {
              text: "50%",
              callback_data: `amount_${type}_50_${tokenAddress}`,
            },
            {
              text: "75%",
              callback_data: `amount_${type}_75_${tokenAddress}`,
            },
            {
              text: "100%",
              callback_data: `amount_${type}_100_${tokenAddress}`,
            },
          ],
          [
            {
              text: "Custom Amount",
              callback_data: `amount_${type}_custom_${tokenAddress}`,
            },
          ],
          [{ text: "❌ Cancel", callback_data: "cancel_trade" }],
        ],
      };

      await this.bot.sendMessage(
        query.message.chat.id,
        `Select amount to ${type}:\nPrice Impact: %`,
        { reply_markup: keyboard }
      );
    }
  }

  // Update sendPriceMenu to use real price data
  async sendPriceMenu(chatId) {
    try {
      const response = await fetch(
        `${this.marketEndpoints.coingecko.base}${this.marketEndpoints.coingecko.price}?x_cg_demo_api_key=` +
          process.env.CG_API_KEY +
          `&ids=bitcoin,ethereum,binancecoin,ripple,solana,dogecoin,cardano&vs_currencies=usd`
      );
      const prices = await response.json();

      const priceInfo =
        `📈 Latest Prices:\n\n` +
        `• BTC: $${prices.bitcoin.usd}\n` +
        `• ETH: $${prices.ethereum.usd}\n` +
        `• XRP: $${prices.ripple.usd}\n` +
        `• BNB: $${prices.binancecoin.usd}\n` +
        `• SOLANA: $${prices.solana.usd}\n` +
        `• DOGE: $${prices.dogecoin.usd}\n` +
        `• ADA: $${prices.cardano.usd}\n\n` 


      const tokenAddress = {
        "bitcoin": "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c",
        "ethereum": "0x2170ed0880ac9a755fd29b2688956bd959f933f8",
        "ripple": "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe",
        "solana": "0x570a5d26f7765ecb712c0924e4de545b89fd43df",
        "dogecoin": "0xba2ae424d960c26247dd6c32edc70b295c744c43",
        "cardano": "0x3ee2200efb3400fabb9aacf31297cbdd1d435d47"
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: "🛒 Buy BTC", callback_data: `swap_execute_${tokenAddress.bitcoin}`},
            { text: "💰 BTC Analysis", callback_data: `analysis_${tokenAddress.bitcoin}`},
          ],
          [
            { text: "🛒 Buy ETH", callback_data: `swap_execute_${tokenAddress.ethereum}`},
            { text: "💰 ETH Analysis", callback_data: `analysis_${tokenAddress.ethereum}`},
          ],
          [
            { text: "🛒 Buy XRP", callback_data: `swap_execute_${tokenAddress.ripple}`},
            { text: "💰 XRP Analysis", callback_data: `analysis_${tokenAddress.ripple}`},
          ],
          [
            { text: "🛒 Buy SOL", callback_data: `swap_execute_${tokenAddress.solana}`},
            { text: "💰 SOL Analysis", callback_data: `analysis_${tokenAddress.solana}`},
          ],
          [
            { text: "🛒 Buy DOGE", callback_data: `swap_execute_${tokenAddress.dogecoin}`},
            { text: "💰 DOGE Analysis", callback_data: `analysis_${tokenAddress.dogecoin}`},
          ],
          [
            { text: "🛒 Buy ADA", callback_data:  `swap_execute_${tokenAddress.cardano}`},
            { text: "💰 ADA Analysis", callback_data: `analysis_${tokenAddress.cardano}`},
          ],
        ],
      };

      await this.bot.sendMessage(chatId, priceInfo, { reply_markup: keyboard });
    } catch (error) {
      console.error("Price menu error:", error);
      await this.bot.sendMessage(chatId, "Error fetching price data");
    }
  }
}

try {
  dodoBot = new TelegramDodoBot(
    telegramBot,
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY,
    process.env.DODO_API_KEY, 
    process.env.RPC_URL
  );
} catch (error) {
  console.error('Error initializing DodoBot:', error);
  process.exit(1);
}

let cryptoBot;
let dodoBot;

try {
    // Initialize bots with the same telegram bot instance
    dodoBot = new TelegramDodoBot(
        telegramBot,
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY, 
        process.env.DODO_API_KEY,
        process.env.RPC_URL
    );
    console.log("Bots initialized successfully");
} catch (error) {
    console.error("Error initializing bots:", error);
    process.exit(1);
}

// Add cleanup handlers
process.on('SIGINT', () => {
    console.log('Received SIGINT. Performing cleanup...');
    if (telegramBot) {
        telegramBot.stopPolling();
    }
    process.exit(0);
});

app.listen(port, () => {
    console.log(`Enhanced Trading Bot listening on port ${port}`);
    console.log("Bot is running with autonomous features...");
});