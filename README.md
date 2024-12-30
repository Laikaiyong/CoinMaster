# Crypto Trading Bot Documentation

## Overview
A sophisticated cryptocurrency trading bot built with Node.js that integrates with Telegram for user interaction. The bot provides trading analysis, market insights, and automated trading capabilities using various APIs and blockchain interactions.

## Agent Capabilities
- Autonomous market analysis and trading decisions
- Real-time response to market changes
- Pattern recognition in price movements
- Risk assessment and management
- Multi-source data aggregation
- Predictive analytics using AI
- User preference learning and adaptation
- Quality-focused trade selection with win-rate tracking
- Transparent reasoning process for each trade decision
- Adaptive interface based on user experience level

## Agent Limitations
- No guarantee of profitable trades
- Limited to supported cryptocurrencies
- Dependent on API availability and response times
- Processing delays during high volatility
- Memory constraints for historical data
- Network-dependent reliability
- Rate limits from external APIs

## Core Features
- Real-time cryptocurrency price tracking and analysis
- Sentiment analysis using multiple data points
- Technical analysis with various indicators
- Integration with Telegram for user interface
- Wallet management on Citrea blockchain
- Market trend analysis and predictions using Gemini AI
- Trade quality metrics and performance analytics
- Step-by-step reasoning documentation
- User experience customization (beginner to expert)

## Main Components

#### Core Setup Methods
- `setupCore()`: Initializes Web3, Telegram bot, and Supabase connections
- `setupMemory()`: Creates memory maps for storing user preferences and market data
- `setupLLM()`: Configures Google's Generative AI (Gemini)
- `setupPerception()`: Initializes market indicators and API endpoints
- `setupHandlers()`: Sets up Telegram command handlers

#### Analysis Methods
- `analyzeTechnicalSignals()`: Processes technical indicators (RSI, momentum, volatility)
- `analyzeSentiment()`: Evaluates market sentiment from multiple sources
- `analyzeTrendStrength()`: Assesses current market trends
- `analyzeMarketConditions()`: Evaluates overall market health
- `analyzeTradeQuality()`: Evaluates historical trade performance
- `analyzeTradingOpportunity()`: Combines all analyses for trading decisions
- `documentTradeReasoning()`: Records step-by-step decision process

#### Trading Features
- Real-time price tracking
- Automated trading recommendations
- Risk management analysis
- Wallet balance monitoring
- Trading execution capabilities
- Trade quality tracking
- User-level adapted interfaces

## User Commands
- `/start`: Initialize bot and display main menu
- `/trade [symbol]`: Analyze and trade specific cryptocurrency
- `/price [symbol]`: Get current price information
- `/predict [message]`: Get AI-powered market predictions
- `/risk`: Display risk management advice
- `/quality`: Display trade quality metrics
- `/reasoning`: Show last trade decision process

## Database Schema
Requires Supabase tables:
- `wallets`: Stores user wallet information
- `user_profiles`: Stores user preferences and risk profiles
- `trade_quality`: Stores trade performance metrics
- `reasoning_logs`: Stores decision-making processes

## Technical Stack
- Node.js with Express
- Web3.js for blockchain interaction
- Telegram Bot API
- Supabase for database
- Google Gemini AI for analysis
- CoinGecko API for market data

## Memory Management
Maintains in-memory storage for:
- User preferences
- Market patterns
- Trading history
- Price history
- Sentiment data
- Quality metrics
- Reasoning logs

## Risk Management
Implements multiple risk control mechanisms:
- User risk profiling
- Market condition analysis
- Volatility monitoring
- Position sizing recommendations
- Trade quality assessment
- Experience-based risk adjustments
## Demonstration of Reasoning Steps
1. Market Analysis
    - Price trend evaluation
    - Volume pattern analysis
    - Technical indicator signals
    - Sentiment score calculation

2. Risk Assessment
    - Volatility measurement
    - Market depth analysis
    - Liquidity evaluation
    - Position size calculation

3. Trade Decision
    - Entry/exit point determination
    - Risk-reward ratio calculation
    - Quality score assignment
    - Final recommendation generation

## Impact Across User Types

### First-Time Crypto Users
- Simplified interface
- Educational content
- Risk-averse recommendations
- Basic market explanations

### Intermediate Traders
- Detailed technical analysis
- Customizable strategies
- Advanced market metrics
- Risk management tools

### High-Volume Traders
- Complex trading patterns
- Market depth analysis
- Multiple pair correlations
- Custom API integration