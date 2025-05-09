// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockPriceFeed {
    int256 private price;
    uint8 private constant DECIMALS = 8;
    
    constructor() {
        price = 200000000000; // $3500 with 8 decimals (3500 * 10^8)
    }
    
    function setLatestPrice(int256 _price) external {
        // Assuming input is in whole dollars, convert to 8 decimal representation
        price = _price * int256(10**DECIMALS);
    }
    
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (0, price, block.timestamp, block.timestamp, 0);
    }
    
    function decimals() external pure returns (uint8) {
        return DECIMALS; // Chainlink typically uses 8 decimals for USD pairs
    }
    
    function description() external pure returns (string memory) {
        return "Mock ETH / USD Price Feed";
    }
    
    function version() external pure returns (uint256) {
        return 1;
    }
    
    function getRoundData(uint80 _roundId) external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (0, price, block.timestamp, block.timestamp, 0);
    }
}