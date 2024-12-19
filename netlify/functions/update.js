import { CryptoTradingBot } from "../../newBot.js";
import messageParts from "../../messageParts.js";


exports.handler = async (event) => {
  const { message } = JSON.parse(event.body);
  try {
    const bot = new CryptoTradingBot();
    console.log("Bot is running...");
    
    // Parse message and handle command
    const { command, botName, extra } = messageParts(message.text);
    
    // Create a message object compatible with the bot's expectations
    const msg = {
      from: {
        id: message.from.id,
        // Add other necessary user details if needed
      },
      chat: {
        id: message.chat.id,
        // Add other necessary chat details if needed
      },
      text: message.text,
    };

    // Check for command and invoke the appropriate handler
    if (command === 'start') {
      await bot.handleStart(msg, extra);
    } else if (command === 'trade') {
      // Handle trade command directly if needed
      await bot.handleTrade(msg); // This will trigger the /trade handler
    }
    
  } catch (error) {
    console.error("Error handling message:", error);
  }
  return { statusCode: 200 };
};
