// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract HoodCoinToken is ERC20, Ownable {
    // Only the manager (owner) can mint or burn tokens
    
    constructor(
        string memory name,
        string memory symbol,
        address manager
    ) ERC20(name, symbol) Ownable(manager) {}
    
    // Called by the manager to mint tokens
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    // Called by the manager to burn tokens
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}