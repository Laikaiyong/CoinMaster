const { CryptoTradingBot } = require("../../bot");
require("dotenv").config();
require("node-telegram-bot-api");
require("@supabase/supabase-js");
require("web3");

try {
    console.log("Starting BSC Trading & Memecoin Assistant...");
    const bot = new CryptoTradingBot();
    console.log("Bot is running...");
  } catch (error) {
    console.error("Error starting bot:", error);
  }