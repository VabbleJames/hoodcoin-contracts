// contracts/test/MockUniswapRouter.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IUniswapV2Interfaces.sol";

contract MockUniswapRouter {
    address public factory;
    address public WETH;
    
    constructor() {
        factory = address(this);
        WETH = address(1); // Dummy address
    }
    
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity) {
        // Simply return the values to simulate success
        return (amountTokenDesired, msg.value, amountTokenDesired);
    }
    
    function getPair(address tokenA, address tokenB) external view returns (address) {
        return address(2); // Dummy pair address
    }
    
    function createPair(address tokenA, address tokenB) external returns (address) {
        return address(2); // Dummy pair address
    }
}