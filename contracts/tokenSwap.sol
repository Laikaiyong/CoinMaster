// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TokenSwap is ReentrancyGuard {
    mapping(address => mapping(address => uint256)) private tokenBalances;
    
    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdrawal(address indexed user, address indexed token, uint256 amount);
    event Swap(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    function deposit(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        tokenBalances[msg.sender][token] += amount;
        emit Deposit(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(tokenBalances[msg.sender][token] >= amount, "Insufficient balance");
        
        tokenBalances[msg.sender][token] -= amount;
        require(IERC20(token).transfer(msg.sender, amount), "Transfer failed");
        emit Withdrawal(msg.sender, token, amount);
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    ) external nonReentrant {
        require(amountIn > 0 && amountOut > 0, "Amounts must be greater than 0");
        require(tokenBalances[msg.sender][tokenIn] >= amountIn, "Insufficient balance");
        require(tokenBalances[address(this)][tokenOut] >= amountOut, "Insufficient liquidity");
        
        tokenBalances[msg.sender][tokenIn] -= amountIn;
        tokenBalances[msg.sender][tokenOut] += amountOut;
        
        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    function getBalance(address user, address token) external view returns (uint256) {
        return tokenBalances[user][token];
    }
}// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract TokenSwap is ReentrancyGuard {
    mapping(address => mapping(address => uint256)) private tokenBalances;
    
    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdrawal(address indexed user, address indexed token, uint256 amount);
    event Swap(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    function deposit(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        tokenBalances[msg.sender][token] += amount;
        emit Deposit(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(tokenBalances[msg.sender][token] >= amount, "Insufficient balance");
        
        tokenBalances[msg.sender][token] -= amount;
        require(IERC20(token).transfer(msg.sender, amount), "Transfer failed");
        emit Withdrawal(msg.sender, token, amount);
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    ) external nonReentrant {
        require(amountIn > 0 && amountOut > 0, "Amounts must be greater than 0");
        require(tokenBalances[msg.sender][tokenIn] >= amountIn, "Insufficient balance");
        require(tokenBalances[address(this)][tokenOut] >= amountOut, "Insufficient liquidity");
        
        tokenBalances[msg.sender][tokenIn] -= amountIn;
        tokenBalances[msg.sender][tokenOut] += amountOut;
        
        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    function getBalance(address user, address token) external view returns (uint256) {
        return tokenBalances[user][token];
    }
}