/* test/test-utils.js
const { ethers } = require("hardhat");

// Helper to convert ETH to wei
function eth(amount) {
  return ethers.parseEther(amount.toString());
}

// Helper to convert wei to ETH
function fromWei(wei) {
  return ethers.formatEther(wei);
}

// Helper to create a simple bonding curve step configuration
function createDefaultSteps() {
  return [
    { rangeTo: eth("10000000"), price: eth("0.001") },  // 0.001 ETH per token
    { rangeTo: eth("50000000"), price: eth("0.005") },  // 0.005 ETH
    { rangeTo: eth("200000000"), price: eth("0.01") },  // 0.01 ETH
    { rangeTo: eth("500000000"), price: eth("0.05") },  // 0.05 ETH
    { rangeTo: eth("800000000"), price: eth("0.1") }    // 0.1 ETH
  ];
}

// Helper to deploy contracts for testing
async function deployForTesting() {
  const [owner, treasury, user1, user2, verifier] = await ethers.getSigners();
  
  // Deploy a mock Uniswap router for testing
  const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
  const uniswapRouter = await MockUniswapRouter.deploy();

   // Deploy a mock price feed for testing
   const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
   const priceFeed = await MockPriceFeed.deploy();
  
  // Deploy the bonding math library
  const HoodCoinBondingMath = await ethers.getContractFactory("HoodCoinBondingMath");
  const bondingMath = await HoodCoinBondingMath.deploy();
  
  // Deploy the manager
  const HoodCoinManager = await ethers.getContractFactory("HoodCoinManager", {
    libraries: {
      HoodCoinBondingMath: await bondingMath.getAddress()
    }
  });
  const manager = await HoodCoinManager.deploy(treasury.address, await uniswapRouter.getAddress(), await priceFeed.getAddress());
  
  return { 
    manager, 
    bondingMath, 
    uniswapRouter,
    priceFeed, 
    owner, 
    treasury, 
    user1, 
    user2, 
    verifier 
  };
}

module.exports = {
  eth,
  fromWei,
  createDefaultSteps,
  deployForTesting
}; */

// test/test-utils.js
const { ethers } = require("hardhat");

// Helper to convert ETH to wei
function eth(amount) {
  return ethers.parseEther(amount.toString());
}

// Helper to convert wei to ETH
function fromWei(wei) {
  return ethers.formatEther(wei);
}

// Helper to create a simple bonding curve step configuration
function createDefaultSteps() {
  return [
    { rangeTo: eth("10000000"), price: eth("0.000000428") },   // ~0.000000428 ETH
    { rangeTo: eth("50000000"), price: eth("0.00000214") },    // ~0.00000214 ETH
    { rangeTo: eth("200000000"), price: eth("0.00000428") },   // ~0.00000428 ETH
    { rangeTo: eth("500000000"), price: eth("0.0000214") },    // ~0.0000214 ETH
    { rangeTo: eth("800000000"), price: eth("0.0000428") }     // ~0.0000428 ETH
  ];
}

// Helper to deploy contracts for testing
async function deployForTesting() {
  const [owner, treasury, user1, user2, verifier] = await ethers.getSigners();
  
  // Deploy a mock Uniswap router for testing
  const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
  const uniswapRouter = await MockUniswapRouter.deploy();
  
  // Deploy a mock price feed for testing
  const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
  const priceFeed = await MockPriceFeed.deploy();
  
  // Deploy the bonding math library
  const HoodCoinBondingMath = await ethers.getContractFactory("HoodCoinBondingMath");
  const bondingMath = await HoodCoinBondingMath.deploy();
  
  // Deploy the manager - using the updated constructor that only takes treasury and router
  const HoodCoinManager = await ethers.getContractFactory("HoodCoinManager", {
    libraries: {
      HoodCoinBondingMath: await bondingMath.getAddress()
    }
  });
  
  // The updated constructor only takes two parameters: treasury and uniswapRouter
  const manager = await HoodCoinManager.deploy(
    treasury.address,
    await uniswapRouter.getAddress()
  );
  
  return { 
    manager, 
    bondingMath, 
    uniswapRouter,
    priceFeed, 
    owner, 
    treasury, 
    user1, 
    user2, 
    verifier 
  };
}

module.exports = {
  eth,
  fromWei,
  createDefaultSteps,
  deployForTesting
};