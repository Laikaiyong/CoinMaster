const express = require("express");

const app = express();
const port = 3000;

const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const { Web3, HttpProvider } = require("web3");
const axios = require("axios");
const Groq = require("groq-sdk");

const res = require("express/lib/response");
require("dotenv").config();

class CryptoTradingBot {
  constructor() {
    this.setupCore();
    this.setupMemory();
    this.setupPerception();
    this.setupHandlers();
    this.setupLLM();
  }

  setupCore() {
    var web3Provider = new HttpProvider(process.env.RPC_URL);
    this.web3 = new Web3(web3Provider);
    this.bot = new TelegramBot(process.env.TG_API_KEY, { polling: true });
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    this.scannerUrl = process.env.SCANNER_URL;

    this.marketEndpoints = {
      coingecko: {
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
      getCoinSentiment: async (symbol) => {
        try {
          const response = await fetch(
            `${this.marketEndpoints.coingecko.base}${this.marketEndpoints.coingecko.coin}/${symbol}?x_cg_demo_api_key=${process.env.CG_API_KEY}&tickers=true&market_data=true&community_data=true&developer_data=true&sparkline=true`
          );
          const data = await response.json();

          // Store historical sentiment
          this.memory.sentimentHistory.set(
            symbol,
            [
              ...(this.memory.sentimentHistory.get(symbol) || []),
              {
                timestamp: Date.now(),
                data: {
                  sentiment_votes_up: data?.sentiment_votes_up_percentage ?? 0,
                  sentiment_votes_down:
                    data?.sentiment_votes_down_percentage ?? 0,
                  community_score: data?.community_data?.twitter_followers ?? 0,
                  developer_score: data?.developer_data?.stars ?? 0,
                  public_interest_score: data?.trust_score ?? 0,
                },
              },
            ].slice(-100)
          ); // Keep last 100 entries

          return data;
        } catch (error) {
          console.error("Coin sentiment fetch error:", error);
          return null;
        }
      },

      getMarketTrends: async () => {
        try {
          const response = await fetch(
            `${this.marketEndpoints.coingecko.base}${this.marketEndpoints.coingecko.trends}?x_cg_demo_api_key=${process.env.CG_API_KEY}`
          );
          const data = await response.json();
          return data;
        } catch (error) {
          console.error("Market trends fetch error:", error);
          return { coins: [] };
        }
      },

      getGlobalMetrics: async () => {
        try {
          const response = await fetch(
            `${this.marketEndpoints.coingecko.base}${this.marketEndpoints.coingecko.global}?x_cg_demo_api_key=${process.env.CG_API_KEY}`
          );
          const data = await response.json();
          return data;
        } catch (error) {
          console.error("Global metrics fetch error:", error);
          return null;
        }
      },
    };
  }

  setupHandlers() {
    this.bot.onText(/\/start/, async (msg) => {
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

      // const balance = await this.web3.eth.getBalance(wallet.address);
      // const balanceInEth = this.web3.utils.fromWei(balance, "ether");
      // let balanceMessage = `CBTC: ${balanceInEth}\n`;
      let balanceMessage = `BNB: ${wallet.balance}\n`;

      let welcomeMessage = `Welcome to CoinMaster! 🚀\n\n`;
      welcomeMessage += `Your Wallet: <code>${wallet.address}</code> <a href="tg://copy/${wallet.address}">📋</a>\n\n`;
      welcomeMessage += `Balances:\n${balanceMessage}\n`;
      welcomeMessage += `I can help you with:

📊 Trading Analysis & Strategies
💹 Market Analysis

Type /help for more features!`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "🛒 Buy", callback_data: "buy_menu" },
            { text: "🤑 Sell", callback_data: "sell_menu" },
            { text: "💰 Check Balance", callback_data: "check_balance" },
          ],
        ],
      };

      this.bot.sendMessage(msg.chat.id, welcomeMessage, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    });

    this.bot.onText(/\/help/, async (msg, match) => {
      // Try these commands:
      // • /hot - Get Popular token current price
      //   Example: /hot
      
      // • /price [token_address] - Get Price of a token
      //   Example: /price 
      
      // • /order [token_address] - Place an order
      //   Example: /order 0xbfef0d8d73f3d8c11ae7b8d5a25814fc4cece5e04b913e03bccf22eebddd35f0
      
      // • /trade [token_name] - Trade Decision Making
      //   Example: /trade bitcoin
      //   Refer: <a href="https://docs.coingecko.com/v3.0.1/reference/coins-list">Coingecko coin list</a>
      
    });
    this.bot.onText(/\/hot/, async (msg, match) => {
      await this.sendPriceMenu(msg.chat.id);
    });

    this.bot.onText(/\/price (.+)/, async (msg, match) => {
      const tokenAddress = match[1];
      await this.handlePrice(msg.chat.id, tokenAddress);
    });

    this.bot.onText(/\/order (.+)/, async (msg, match) => {
      const tokenAddress = match[1];
      await this.handleOrder(msg.chat.id, tokenAddress);
    });

    this.bot.onText(/\/trade (.+)/, async (msg, match) => {
      const symbol = match[1].toUpperCase();
      const analysis = await this.analyzeTradingOpportunity(
        symbol,
        msg.from.id
      );

      let { data: wallet } = await this.supabase
        .from("wallets")
        .select("*")
        .eq("user_id", msg.from.id)
        .single();

      if (!wallet) {
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

      const tradeMessage = `
Trading Analysis for ${symbol}:
• Recommendation: ${analysis.recommendation}
• Confidence: ${(analysis.confidence * 100).toFixed(1)}%
• Risk Level: ${analysis.risk}
• Reasoning:\n${analysis.reasoning}
`;

      const tradeKeyboard = {
        inline_keyboard: [
          [
            { text: "🟢 Buy", callback_data: `trade_buy_${symbol}` },
            { text: "🔴 Sell", callback_data: `trade_sell_${symbol}` },
          ],
          [
            { text: "💰 Check Balance", callback_data: "trade_balance" },
          ],
        ],
      };

      await this.bot.sendMessage(msg.chat.id, tradeMessage, {
        reply_markup: tradeKeyboard,
      });
    });

    this.bot.on("callback_query", this.handleCallbackQuery.bind(this));
  }

  async handlePrice(chatId, tokenAddress) {
    try {
      // Fetch token info from GeckoTerminal
      const onchainData = await this.getOnchainMetrics(tokenAddress);

      // Get price chart image from GeckoTerminal 
      const chartUrl = `https://www.coingecko.com/en/coins/${onchainData.name.toLowerCase()}`;
      
      // Get BSCScan preview
      const bscscanUrl = `${this.scannerUrl}token/${tokenAddress}`;

      const message = `
      🪙 <b>${onchainData.name} (${onchainData.symbol})</b>

💰 Price: $${onchainData.price}
📊 Change: 
• 5m: ${onchainData.priceChange.m5}%
• 1h: ${onchainData.priceChange.h1}%
• 6h: ${onchainData.priceChange.h6}%
• 24h: ${onchainData.priceChange.h24}%
💎 24h Volume: $${(onchainData.volume24h).toLocaleString()}
👥 Holders: ${""}
🔄 24h Transactions: 
• Buys: ${onchainData.transactions.h24.buys} (${onchainData.transactions.h24.buyers} buyers)
• Sells: ${onchainData.transactions.h24.sells} (${onchainData.transactions.h24.sellers} sellers)

🏊‍♂️ Top Liquidity Pool:
• Pool: ${onchainData.pool.name}
• Address: <code>${onchainData.pool.address}</code>
      `;

      const keyboard = {
        inline_keyboard: [
          [
        { text: "📈 Price Chart", url: chartUrl },
        { text: "🔍 BSCScan", url: bscscanUrl }
          ],
          [
        { text: "🛒 Buy", callback_data: `buy_token_${tokenAddress}` },
        { text: "💰 Analysis", callback_data: `sell_token_${tokenAddress}` },
          ],
        ],
      };

      // Send message with chart image
      await this.bot.sendPhoto(chatId, onchainData.image_url);
      await this.bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: keyboard 
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
              callback_data: `market_buy_${tokenAddress}`,
            },
            {
              text: "💰 Market Sell",
              callback_data: `market_sell_${tokenAddress}`,
            },
          ],
          [
            {
              text: "📊 Limit Buy",
              callback_data: `limit_buy_${tokenAddress}`,
            },
            {
              text: "📈 Limit Sell",
              callback_data: `limit_sell_${tokenAddress}`,
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
      marketCap: globalMetrics.data.total_market_cap.usd,
      volume24h: globalMetrics.data.total_volume.usd,
      btcDominance: globalMetrics.data.market_cap_percentage.btc,
      marketCapChange: globalMetrics.data.market_cap_change_percentage_24h_usd,
    };

    const volumeToMcap = metrics.volume24h / metrics.marketCap;
    const marketHealth = metrics.marketCapChange > 0 ? 0.6 : 0.4;
    const dominanceImpact = metrics.btcDominance > 50 ? 0.7 : 0.3;

    return {
      liquidity: volumeToMcap,
      health: marketHealth,
      dominance: dominanceImpact,
      overallScore:
        volumeToMcap * 0.3 + marketHealth * 0.4 + dominanceImpact * 0.3,
    };
  }

  async analyzeTradingOpportunity(symbol, userId) {
    try {
      // Fetch basic coin data and market conditions
      const [coinData, trends, globalMetrics] = await Promise.all([
        this.indicators.getCoinSentiment(symbol.toLowerCase()),
        this.indicators.getMarketTrends(),
        this.indicators.getGlobalMetrics(),
      ]);

      if (!coinData) {
        throw new Error("Unable to fetch coin data");
      }

      console.log(coinData.contract_address);
      // Fetch onchain metrics from GeckoTerminal
      const onchainMetrics = await this.getOnchainMetrics(
        coinData.contract_address
      );

      // Combine all signals including onchain data
      const signals = {
        technical: this.analyzeTechnicalSignals(coinData),
        fundamentals: this.analyzeFundamentals(coinData),
        sentiment: this.analyzeSentiment(coinData),
        trend: this.analyzeTrendStrength(trends, symbol),
        market: this.analyzeMarketConditions(globalMetrics),
        volume: this.analyzeVolumeProfile(coinData),
        onchain: this.analyzeOnchainMetrics(onchainMetrics), // New analysis
      };

      // Get user's risk profile and LLM analysis
      const userRiskProfile = await this.getUserRiskProfile(userId);
      const llmAnalysis = await this.getLLMAnalysis(
        coinData,
        signals,
        userRiskProfile,
        onchainMetrics // Pass onchain data to LLM
      );

      const weightedScore = this.calculateWeightedScore(
        signals,
        userRiskProfile
      );
      const recommendation = this.getRecommendation(weightedScore, llmAnalysis);

      // Update market patterns
      this.updateMarketPatterns(symbol, signals, recommendation);

      return {
        recommendation: recommendation.action,
        confidence: recommendation.confidence,
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
          onchain: {
            name: onchainMetrics.name,
            symbol: onchainMetrics.symbol,
            currentPrice: onchainMetrics.price,
            volume24h: onchainMetrics.volume24h,
            liquidityUSD: onchainMetrics.liquidity,
            holders: onchainMetrics.holders,
            priceChange: onchainMetrics.priceChange,
            transactions24h: onchainMetrics.transactions,
          },
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
        image_url:  data.attributes.image_url ?? "",
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
        }
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

    const liquidityScore = Math.min(metrics.liquidity / 1000000, 1); // Normalize to 0-1
    const holdersScore = Math.min(metrics.holders / 10000, 1); // Normalize to 0-1
    const transactionScore = Math.min(metrics.transactions / 1000, 1); // Normalize to 0-1

    const volumeToLiquidity = metrics.volume24h / (metrics.liquidity || 1);
    const healthScore =
      volumeToLiquidity > 0.5 ? 0.8 : volumeToLiquidity > 0.1 ? 0.5 : 0.2;

    return {
      liquidity: liquidityScore,
      holders: holdersScore,
      transactions: transactionScore,
      health: healthScore,
      score:
        (liquidityScore + holdersScore + transactionScore + healthScore) / 4,
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

      // Log the order for debugging
      console.log("Order created:", order);

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
          trend_strength: signals.trend?.overallScore || 0,
          market_health: signals.market?.health || 0,
          liquidity: signals.market?.liquidity || 0,
        },
        volume_profile: signals.volume || 0,
        onchain_metrics: {
          name: onchainMetrics.name,
          symbol: onchainMetrics.symbol,
          current_price: onchainMetrics.price,
          volume_24h: onchainMetrics.volume24h,
          liquidity: onchainMetrics.liquidity,
          holders_count: onchainMetrics.holders,
          price_change: onchainMetrics.priceChange,
          transactions_24h: onchainMetrics.transactions,
        },
      };
      console.log(signals);

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
            content: `Provide a trading analysis in JSON format for this data: ${JSON.stringify(
              prompt,
              null,
              2
            )}. Include action (BUY/SELL/HOLD), confidence (0-1), reasons (string), and risk (LOW/MEDIUM/HIGH) without markdown and explanation`,
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
      const analysis = JSON.parse(cleanContent);

      // Validate the response has required fields
      if (
        !analysis.trading_analysis.action ||
        !analysis.trading_analysis.confidence ||
        !analysis.trading_analysis.reasons ||
        !analysis.trading_analysis.risk
      ) {
        throw new Error("Invalid analysis format from Groq");
      }

      return {
        recommendation: analysis.trading_analysis.action,
        confidence: analysis.trading_analysis.confidence,
        reasoning: analysis.trading_analysis.reasons,
        risk: analysis.trading_analysis.risk,
      };
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

    return `RSI indicates ${rsiStatus} conditions, momentum is ${momentumTrend}, volatility is ${volatilityLevel}`;
  }

  describeFundamentals(fundamentals) {
    if (!fundamentals) return "Insufficient fundamental data";

    const devActivity =
      fundamentals.developerActivity > 0.6
        ? "strong"
        : fundamentals.developerActivity > 0.3
        ? "moderate"
        : "low";
    const marketMaturity =
      fundamentals.marketMaturity > 0.6
        ? "mature"
        : fundamentals.marketMaturity > 0.3
        ? "developing"
        : "early stage";
    const tokenomicsHealth =
      fundamentals.tokenomics > 0.6
        ? "healthy"
        : fundamentals.tokenomics > 0.3
        ? "moderate"
        : "concerning";

    return `Developer activity is ${devActivity}, market is ${marketMaturity}, tokenomics are ${tokenomicsHealth}`;
  }

  describeSentiment(sentiment) {
    if (!sentiment) return "Insufficient sentiment data";

    const communityStatus =
      sentiment.community > 0.6
        ? "very positive"
        : sentiment.community > 0.3
        ? "positive"
        : "neutral";
    const devConfidence =
      sentiment.developer > 0.6
        ? "high"
        : sentiment.developer > 0.3
        ? "moderate"
        : "low";
    const publicInterest =
      sentiment.public > 0.6
        ? "strong"
        : sentiment.public > 0.3
        ? "moderate"
        : "low";

    return `Community sentiment is ${communityStatus}, developer confidence is ${devConfidence}, public interest is ${publicInterest}`;
  }

  updateMarketPatterns(symbol, signals, recommendation) {
    const pattern = {
      timestamp: Date.now(),
      signals,
      recommendation,
      outcome: null, // To be updated later when price change is known
    };

    this.memory.marketPatterns.set(
      symbol,
      [...(this.memory.marketPatterns.get(symbol) || []), pattern].slice(-50)
    ); // Keep last 50 patterns
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
      menu_risk: this.sendRiskMenu,
    };

    const handler = menuHandlers[query.data];
    if (handler) {
      await handler.call(this, chatId);
    }

    await this.bot.answerCallbackQuery(query.id);
  }

  async handleTradeCallbacks(query) {
    const [action, type, tokenAddress] = query.data.split("_");

    if (action === "market" || action === "limit") {
      try {
        const { data: wallet } = await this.supabase
          .from("wallets")
          .select("*")
          .eq("user_id", query.from.id)
          .single();

        // Get quote from DODO
        const quote = await axios.post(
          `${this.marketEndpoints.dodoex.base}/quote`,
          {
            fromToken: type === "buy" ? "BNB" : tokenAddress,
            toToken: type === "buy" ? tokenAddress : "BNB",
            fromAddress: wallet.address,
          }
        );

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
          `Select amount to ${type}:\nPrice Impact: ${quote.data.priceImpact}%`,
          { reply_markup: keyboard }
        );
      } catch (error) {
        console.error("Trade setup error:", error);
        await this.bot.sendMessage(
          query.message.chat.id,
          "Error setting up trade"
        );
      }
    }
  }

  // Update sendPriceMenu to use real price data
  async sendPriceMenu(chatId) {
    try {
      const response = await fetch(
        `${this.marketEndpoints.coingecko.base}${this.marketEndpoints.coingecko.price}?x_cg_demo_api_key=` +
          process.env.CG_API_KEY +
          `&ids=bitcoin,ethereum,binancecoin&vs_currencies=usd`
      );
      const prices = await response.json();

      const priceInfo =
        `Latest Prices:\n` +
        `• BTC: $${prices.bitcoin.usd}\n` +
        `• ETH: $${prices.ethereum.usd}\n` +
        `• BNB: $${prices.binancecoin.usd}\n\n` +
        `For more analysis, type /trade [token]`;

      await this.bot.sendMessage(chatId, priceInfo);
    } catch (error) {
      console.error("Price menu error:", error);
      await this.bot.sendMessage(chatId, "Error fetching price data");
    }
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
});
