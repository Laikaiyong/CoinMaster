const { CryptoTradingBot } = require("../../bot");
require("dotenv").config();
require("node-telegram-bot-api");
require("@supabase/supabase-js");
require("web3");

exports.handler = async (event) => {
  const { message } = JSON.parse(event.body);
  try {
    const bot = new CryptoTradingBot();
    console.log("Bot is running...");
  } catch (error) {
    console.error("Error starting bot:", error);
  }
  return { statusCode: 200 };
};
