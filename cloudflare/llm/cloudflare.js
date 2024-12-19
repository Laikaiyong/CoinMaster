export default {
  async fetch(request, env) {
    let prompt;

    if (request.method === "POST") {
      try {
        const { prompt: userPrompt } = await request.json();
        prompt = userPrompt;
      } catch (error) {
        return Response.json(
          {
            error: "Invalid request format",
          },
          { status: 400 }
        );
      }
    } else {
      // Default prompt for non-POST requests
      prompt = "Tell me about trading trend for $BTC";
    }

    // Set up the chat with crypto-specific system instruction
    const chat = {
      messages: [
        {
          role: "system",
          content: `You are a specialized cryptocurrency expert focused on:
1. Trading strategies on Binance Smart Chain (BSC)
2. Memecoin creation and deployment
3. Token contract development and launch procedures

For trading-related queries:
- Provide technical analysis insights
- Explain entry/exit strategies
- Discuss risk management

For memecoin deployment:
- Guide through token contract creation
- Explain liquidity pool setup
- Detail marketing strategies
- Outline launch procedures
- Warn about potential risks and scams

Always include risk disclaimers and remind users to:
- Never invest more than they can afford to lose
- Always verify contract code
- Be cautious of potential scams
- Use proper security measures

Provide technical but accessible explanations.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    };

    // Get response from AI model
    const response = await env.AI.run("@cf/meta/llama-3-8b-instruct", chat);

    return Response.json({
      input: prompt,
      response,
    });
  },
};
