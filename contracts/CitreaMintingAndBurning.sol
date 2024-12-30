// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SyntheticToken is ERC20, Ownable {
    constructor(address initialOwner) ERC20("USD Coin", "USDC") Ownable(initialOwner) {
        // The owner is explicitly set to the address provided during deployment
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
