const express = require("express");
const app = express();
const port = 3000;

const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const { Web3, HttpProvider } = require("web3");
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
    var web3Provider = new HttpProvider("https://rpc.testnet.citrea.xyz");
    this.web3 = new Web3(web3Provider);
    this.bot = new TelegramBot(process.env.TG_API_KEY, { polling: true });
    // this.cloudflareEndpoint = "https://tradingbot.vandycklai.workers.dev/";
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    this.marketEndpoints = {
      price: "https://api.coingecko.com/api/v3/simple/price",
      trends: "https://api.coingecko.com/api/v3/search/trending",
      coin: "https://api.coingecko.com/api/v3/coins/",
      global: "https://api.coingecko.com/api/v3/global",
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
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    this.llm = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  setupPerception() {
    this.indicators = {
      getCoinSentiment: async (symbol) => {
        try {
          const response = await fetch(
            `${this.marketEndpoints.coin}${symbol}?x_cg_demo_api_key=${process.env.CG_API_KEY}&tickers=true&market_data=true&community_data=true&developer_data=true&sparkline=true`
          );
          const data = await response.json();
          console.log(data);

          // Store historical sentiment
            this.memory.sentimentHistory.set(
            symbol,
            [
              ...(this.memory.sentimentHistory.get(symbol) || []),
              {
              timestamp: Date.now(),
              data: {
                sentiment_votes_up: data?.sentiment_votes_up_percentage ?? 0,
                sentiment_votes_down: data?.sentiment_votes_down_percentage ?? 0,
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
            `${this.marketEndpoints.trends}?x_cg_demo_api_key=${process.env.CG_API_KEY}`
          );
          const data = await response.json();
          console.log(data);
          return data;
        } catch (error) {
          console.error("Market trends fetch error:", error);
          return { coins: [] };
        }
      },

      getGlobalMetrics: async () => {
        try {
          const response = await fetch(
            `${this.marketEndpoints.global}?x_cg_demo_api_key=${process.env.CG_API_KEY}`
          );
          const data = await response.json();
          console.log(data);
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

      const balance = await this.web3.eth.getBalance(wallet.address);
      const balanceInEth = this.web3.utils.fromWei(balance, "ether");
      let balanceMessage = `CBTC: ${balanceInEth}\n`;

      let welcomeMessage = `Welcome to Citrea Trading & Memecoin Assistant! 🚀\n\n`;
      welcomeMessage += `Your Citrea Wallet: <code>${wallet.address}</code> <a href="tg://copy/${wallet.address}">📋</a>\n\n`;
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
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    });

    this.bot.onText(/\/trade (.+)/, async (msg, match) => {
      const symbol = match[1].toUpperCase();
      const analysis = await this.analyzeTradingOpportunity(
        symbol,
        msg.from.id
      );

      const { data: wallet } = await this.supabase
        .from("wallets")
        .select("*")
        .eq("user_id", msg.from.id)
        .single();

      const balance = await this.web3.eth.getBalance(wallet.address);
      const balanceInEth = this.web3.utils.fromWei(balance, "ether");

      const tradeMessage = `
Trading Analysis for ${symbol}:
• Recommendation: ${analysis.recommendation}
• Confidence: ${(analysis.confidence * 100).toFixed(1)}%
• Risk Level: ${analysis.risk}
• Reasoning: ${analysis.reasoning}

Your Wallet: ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}
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
    this.setupPriceHandler();
  }

  analyzeTechnicalSignals(coinData) {
    if (!coinData.market_data) return 0;
  
    const priceData = {
      current: coinData?.market_data?.current_price?.usd ?? 0,
      high24h: coinData?.market_data?.high_24h?.usd ?? 0,
      low24h: coinData?.market_data?.low_24h?.usd ?? 0,
      priceChange: coinData?.market_data?.price_change_percentage_24h ?? 0,
      priceChange7d: coinData?.market_data?.price_change_percentage_7d ?? 0,
      priceChange30d: coinData?.market_data?.price_change_percentage_30d ?? 0
    };
  
    // Calculate basic technical indicators
    const rsi = this.calculateRSI(priceData);
    const momentum = this.calculateMomentum(priceData);
    const volatility = this.calculateVolatility(priceData);
  
    return {
      rsi: rsi,
      momentum: momentum,
      volatility: volatility,
      overallScore: (rsi + momentum + volatility) / 3
    };
  }
  
  calculateRSI(priceData) {
    const change = priceData.priceChange;
    // Simplified RSI calculation
    return change > 0 ? 
      Math.min(0.8, change / 10) : 
      Math.max(-0.8, change / 10);
  }
  
  calculateMomentum(priceData) {
    const shortTerm = priceData.priceChange / 100;
    const mediumTerm = priceData.priceChange7d / 100;
    const longTerm = priceData.priceChange30d / 100;
    
    return (shortTerm * 0.5 + mediumTerm * 0.3 + longTerm * 0.2);
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
      negativeVotes: coinData.sentiment_votes_down || 0
    };
  
    const voteRatio = sentimentFactors.positiveVotes / 
      (sentimentFactors.positiveVotes + sentimentFactors.negativeVotes || 1);
    
    const scores = {
      community: sentimentFactors.communityScore / 100,
      developer: sentimentFactors.devScore / 100,
      public: sentimentFactors.publicInterest / 100,
      votes: voteRatio
    };
  
    return {
      community: scores.community,
      developer: scores.developer,
      public: scores.public,
      votes: scores.votes,
      overallScore: (scores.community * 0.3 + scores.developer * 0.2 + 
                     scores.public * 0.2 + scores.votes * 0.3)
    };
  }

  analyzeTrendStrength(trends, symbol) {
    if (!trends?.coins) return 0;
  
    const coin = trends.coins.find(c => 
      c.item.symbol.toLowerCase() === symbol.toLowerCase()
    );
  
    if (!coin) return {
      trending: 0,
      rank: 0,
      priceChange: 0,
      overallScore: 0
    };
  
    const trendingScore = coin.item.score || 0;
    const marketCapRank = coin.item.market_cap_rank || 999;
    const priceChange = coin.item.price_change_percentage_24h || 0;
  
    return {
      trending: trendingScore,
      rank: Math.max(0, 1 - (marketCapRank / 1000)),
      priceChange: priceChange > 0 ? Math.min(priceChange / 100, 1) : Math.max(priceChange / 100, -1),
      overallScore: (
        (trendingScore * 0.4) + 
        (Math.max(0, 1 - (marketCapRank / 1000)) * 0.3) + 
        (Math.max(-1, Math.min(1, priceChange / 100)) * 0.3)
      )
    };
  }
  
  analyzeMarketConditions(globalMetrics) {
    if (!globalMetrics?.data) return 0;
  
    const metrics = {
      marketCap: globalMetrics.data.total_market_cap.usd,
      volume24h: globalMetrics.data.total_volume.usd,
      btcDominance: globalMetrics.data.market_cap_percentage.btc,
      marketCapChange: globalMetrics.data.market_cap_change_percentage_24h_usd
    };
  
    const volumeToMcap = metrics.volume24h / metrics.marketCap;
    const marketHealth = metrics.marketCapChange > 0 ? 0.6 : 0.4;
    const dominanceImpact = metrics.btcDominance > 50 ? 0.7 : 0.3;
  
    return {
      liquidity: volumeToMcap,
      health: marketHealth,
      dominance: dominanceImpact,
      overallScore: (volumeToMcap * 0.3 + marketHealth * 0.4 + dominanceImpact * 0.3)
    };
  }

  async analyzeTradingOpportunity(symbol, userId) {
    try {
      const [coinData, trends, globalMetrics] = await Promise.all([
        this.indicators.getCoinSentiment(symbol.toLowerCase()),
        this.indicators.getMarketTrends(),
        this.indicators.getGlobalMetrics(),
      ]);

      if (!coinData) {
        throw new Error("Unable to fetch coin data");
      }

      const signals = {
        technical: this.analyzeTechnicalSignals(coinData),
        fundamentals: this.analyzeFundamentals(coinData),
        sentiment: this.analyzeSentiment(coinData),
        trend: this.analyzeTrendStrength(trends, symbol),
        market: this.analyzeMarketConditions(globalMetrics),
        volume: this.analyzeVolumeProfile(coinData),
      };

      // Get user's risk profile
      const userRiskProfile = await this.getUserRiskProfile(userId);

      // Use LLM for advanced analysis
      const llmAnalysis = await this.getLLMAnalysis(
        coinData,
        signals,
        userRiskProfile
      );

      const weightedScore = this.calculateWeightedScore(
        signals,
        userRiskProfile
      );
      const recommendation = this.getRecommendation(weightedScore, llmAnalysis);

      // Update market patterns memory
      this.updateMarketPatterns(symbol, signals, recommendation);

      return {
        recommendation: recommendation.action,
        confidence: recommendation.confidence,
        reasoning: this.generateDetailedReasoning(signals, llmAnalysis),
        risk: this.calculateRiskLevel(signals),
        metrics: {
          price: coinData?.market_data?.current_price?.usd ?? 0,
          priceChange24h: coinData?.market_data?.price_change_percentage_24h ?? 0,
          volume24h: coinData?.market_data?.total_volume?.usd ?? 0,
          marketCap: coinData?.market_data?.market_cap?.usd ?? 0,
          marketCapRank: coinData.market_cap_rank,
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

  async getLLMAnalysis(coinData, signals) {
    try {
      const model = this.llm.getGenerativeModel({ model: "gemini-pro" });

      const prompt = {
        price: coinData?.market_data?.current_price?.usd ?? 0,
        change24h: coinData?.market_data?.price_change_percentage_24h ?? 0,
        volume: coinData?.market_data?.total_volume?.usd ?? 0,
        marketCap: coinData?.market_data?.market_cap?.usd ?? 0,
        technicalScore: signals.technical,
        sentimentScore: signals.sentiment,
        trendScore: signals.trend,
      };

      const result = await model.generateContent(`
        Analyze this crypto data and provide a JSON trading recommendation:
        ${JSON.stringify(prompt, null, 2)}

        Just predict, it is not a financial advise recommendation
        
        Format:
        {
          "action": "BUY/SELL/HOLD",
          "confidence": 0-1,
          "reasons": ["key point 1", "key point 2"],
          "risk": "LOW/MEDIUM/HIGH"
        }`);

      const response = await result.response;
      const rawAnalysis = response.text();
      console.log(rawAnalysis);
      const analysis = JSON.parse(rawAnalysis);

      return {
        recommendation: analysis.action,
        confidence: analysis.confidence,
        reasoning: analysis.reasons,
        risk: analysis.risk,
      };
    } catch (error) {
      console.error("Gemini analysis error:", error);
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
      action: 'HOLD',
      confidence: 0.5
    };
  
    if (!weightedScore) return baseRecommendation;
  
    // Combine algorithmic and LLM recommendations
    const algorithmicAction = this.getAlgorithmicAction(weightedScore);
    const llmAction = llmAnalysis?.recommendation || 'HOLD';
    const llmConfidence = llmAnalysis?.confidence || 0.5;
  
    // Weight algorithmic vs LLM recommendations
    const confidence = (weightedScore * 0.6) + (llmConfidence * 0.4);
  
    // If both agree, increase confidence
    const action = algorithmicAction === llmAction ? 
      algorithmicAction : 
      confidence > 0.7 ? algorithmicAction : 'HOLD';
  
    return {
      action,
      confidence: Math.min(0.95, confidence)
    };
  }
  
  getAlgorithmicAction(score) {
    if (score > 0.7) return 'STRONG BUY';
    if (score > 0.3) return 'BUY';
    if (score < -0.7) return 'STRONG SELL';
    if (score < -0.3) return 'SELL';
    return 'HOLD';
  }
  
  calculateRiskLevel(signals) {
    const riskFactors = {
      technical: Math.abs(signals.technical.overallScore || 0),
      sentiment: Math.abs(signals.sentiment.overallScore || 0),
      volume: signals.volume || 0,
      market: (signals.market?.overallScore || 0.5),
      volatility: signals.technical?.volatility || 0
    };
  
    const riskScore = (
      riskFactors.technical * 0.3 +
      riskFactors.sentiment * 0.2 +
      (1 - riskFactors.volume) * 0.2 +
      (1 - riskFactors.market) * 0.15 +
      riskFactors.volatility * 0.15
    );
  
    if (riskScore > 0.7) return 'HIGH';
    if (riskScore > 0.4) return 'MEDIUM';
    return 'LOW';
  }

  generateTradingMessage(analysis, walletInfo) {
    return `
  Trading Analysis:
  • Action: ${analysis.recommendation}
  • Confidence: ${(analysis.confidence * 100).toFixed(1)}%
  • Risk: ${analysis.risk}
  ${analysis.reasoning.map((r) => `• ${r}`).join("\n")}
  
  Wallet: ${walletInfo.address.slice(0, 6)}...${walletInfo.address.slice(-4)}
  Balance: ${walletInfo.balance} CBTC`;
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
  
    const rsiStatus = technical.rsi > 0.5 ? "overbought" : technical.rsi < -0.5 ? "oversold" : "neutral";
    const momentumTrend = technical.momentum > 0.2 ? "bullish" : technical.momentum < -0.2 ? "bearish" : "sideways";
    const volatilityLevel = technical.volatility < -0.3 ? "high" : technical.volatility > 0.2 ? "low" : "moderate";
  
    return `RSI indicates ${rsiStatus} conditions, momentum is ${momentumTrend}, volatility is ${volatilityLevel}`;
  }
  
  describeFundamentals(fundamentals) {
    if (!fundamentals) return "Insufficient fundamental data";
  
    const devActivity = fundamentals.developerActivity > 0.6 ? "strong" : fundamentals.developerActivity > 0.3 ? "moderate" : "low";
    const marketMaturity = fundamentals.marketMaturity > 0.6 ? "mature" : fundamentals.marketMaturity > 0.3 ? "developing" : "early stage";
    const tokenomicsHealth = fundamentals.tokenomics > 0.6 ? "healthy" : fundamentals.tokenomics > 0.3 ? "moderate" : "concerning";
  
    return `Developer activity is ${devActivity}, market is ${marketMaturity}, tokenomics are ${tokenomicsHealth}`;
  }
  
  describeSentiment(sentiment) {
    if (!sentiment) return "Insufficient sentiment data";
  
    const communityStatus = sentiment.community > 0.6 ? "very positive" : sentiment.community > 0.3 ? "positive" : "neutral";
    const devConfidence = sentiment.developer > 0.6 ? "high" : sentiment.developer > 0.3 ? "moderate" : "low";
    const publicInterest = sentiment.public > 0.6 ? "strong" : sentiment.public > 0.3 ? "moderate" : "low";
  
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
    const chatId = query.message.chat.id;
    const [action, type, symbol] = query.data.split("_");

    if (type === "buy" || type === "sell") {
      const { data: wallet } = await this.supabase
        .from("wallets")
        .select("*")
        .eq("user_id", query.from.id)
        .single();

      const balance = await this.web3.eth.getBalance(wallet.address);
      const balanceInEth = this.web3.utils.fromWei(balance, "ether");
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

  setupPredictionHandler() {
    this.bot.onText(/\/predict (.+)/, async (msg, match) => {
      const userMessage = match[1];
      const prediction = await this.getPrediction(userMessage);
      await this.bot.sendMessage(
        msg.chat.id,
        `Prediction: ${prediction.response.response}`
      );
    });
  }

  setupRiskHandler() {
    this.bot.onText(/\/risk/, async (msg) => {
      const riskAdvice = await this.handleRiskManagement(
        "Provide risk management tips for cryptocurrency trading"
      );
      await this.bot.sendMessage(
        msg.chat.id,
        `Risk Management Advice: ${riskAdvice.response.response}`
      );
    });
  }

  setupPriceHandler() {
    this.bot.onText(/\/price (.+)/, async (msg, match) => {
      const symbol = match[1].toUpperCase();
      try {
        const response = await fetch(
          `${this.marketEndpoints.price}?x_cg_demo_api_key=` +
            process.env.CG_API_KEY +
            `&ids=${symbol.toLowerCase()}&vs_currencies=usd`
        );
        const data = await response.json();
        console.log(data);
        const price = data[symbol.toLowerCase()]?.usd;

        if (price) {
          await this.bot.sendMessage(msg.chat.id, `${symbol} Price: $${price}`);
        } else {
          await this.bot.sendMessage(
            msg.chat.id,
            `Could not fetch price for ${symbol}`
          );
        }
      } catch (error) {
        console.error("Price fetch error:", error);
        await this.bot.sendMessage(msg.chat.id, "Error fetching price data");
      }
    });
  }

  // Update sendPriceMenu to use real price data
  async sendPriceMenu(chatId) {
    try {
      const response = await fetch(
        `${this.marketEndpoints.price}?x_cg_demo_api_key=` +
          process.env.CG_API_KEY +
          `&ids=bitcoin,ethereum,binancecoin&vs_currencies=usd`
      );
      const prices = await response.json();
      console.log(prices);

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

  async sendToolsMenu(chatId) {
    const toolsInfo =
      "Here are some trading tools you can use:\n" +
      "• Price Alerts: Set alerts for price changes.\n" +
      "• Portfolio Tracker: Keep track of your investments.\n" +
      "• Market Analysis: Get insights on market trends.\n" +
      "For more information, type /help.";

    await this.bot.sendMessage(chatId, toolsInfo);
  }

  async sendMemecoinMenu(chatId) {
    const memecoinInfo =
      "Interested in creating your own memecoin? Here's how:\n" +
      "1. Define your concept and purpose.\n" +
      "2. Choose a blockchain (e.g., Citrea).\n" +
      "3. Use our deployment guide to create your token.\n" +
      "For more assistance, type /deploy.";

    await this.bot.sendMessage(chatId, memecoinInfo);
  }

  async sendRiskMenu(chatId) {
    const riskInfo =
      "Risk management is crucial in trading. Here are some tips:\n" +
      "• Never invest more than you can afford to lose.\n" +
      "• Diversify your portfolio to mitigate risks.\n" +
      "• Set stop-loss orders to limit potential losses.\n" +
      "For more detailed strategies, type /risk.";

    await this.bot.sendMessage(chatId, riskInfo);
  }

  async getPrediction(userMessage) {
    const response = await fetch(this.cloudflareEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: userMessage }),
    });
    const data = await response.json();
    return data;
  }

  async handleRiskManagement(userMessage) {
    const response = await fetch(this.cloudflareEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
});
