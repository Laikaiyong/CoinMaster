// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol"; // Import the Ownable contract
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TokenBridge is Ownable { // Inherit Ownable
    event TokensLocked(address indexed user, uint256 amount, string destinationAddress);

    IERC20 public token;

    constructor(address _token) Ownable(msg.sender) { // Pass msg.sender to Ownable
        token = IERC20(_token);
    }

    function lockTokens(uint256 amount, string calldata destinationAddress) external {
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit TokensLocked(msg.sender, amount, destinationAddress);
    }

    function releaseTokens(address to, uint256 amount) external onlyOwner {
        require(token.transfer(to, amount), "Transfer failed");
    }
}
