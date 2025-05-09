// test/bonding-curve-step-test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HoodCoin Bonding Curve Step Test", function () {
  // Increase timeout for complex operations
  this.timeout(180000);
  
  let manager, bondingMath, uniswapRouter, priceFeed;
  let owner, treasury, creator, buyer;
  let tokenAddress, tokenContract;
  
  // Function to log details of each transaction
  async function logTransaction(tx, description) {
    const receipt = await tx.wait();
    console.log(`\n----- ${description} -----`);
    console.log(`Gas used: ${receipt.gasUsed.toString()} units`);
    return receipt;
  }
  
  // Function to get token balance
  async function getTokenBalance(address) {
    const balance = await tokenContract.balanceOf(address);
    console.log(`Token balance: ${ethers.formatEther(balance)}`);
    return balance;
  }
  
  // Function to get reserves and supply
  async function getTokenInfo() {
    const tokenInfo = await manager.tokenInfo(tokenAddress);
    const totalSupply = await tokenContract.totalSupply();
    console.log(`Reserve balance: ${ethers.formatEther(tokenInfo.reserveBalance)} ETH`);
    console.log(`Total supply: ${ethers.formatEther(totalSupply)} tokens`);
    return { reserveBalance: tokenInfo.reserveBalance, totalSupply };
  }
  
  before(async function () {
    [owner, treasury, creator, buyer] = await ethers.getSigners();
    
    console.log("Deploying test environment...");
    
    // Deploy mock contracts
    const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
    uniswapRouter = await MockUniswapRouter.deploy();
    
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    priceFeed = await MockPriceFeed.deploy();
    
    // Deploy bonding math library
    const HoodCoinBondingMath = await ethers.getContractFactory("HoodCoinBondingMath");
    bondingMath = await HoodCoinBondingMath.deploy();
    
    // Deploy manager - FIX: Use proper constructor parameters
    const HoodCoinManager = await ethers.getContractFactory("HoodCoinManager", {
      libraries: {
        HoodCoinBondingMath: await bondingMath.getAddress()
      }
    });
    
    // Check the constructor signature of HoodCoinManager to pass correct params
    manager = await HoodCoinManager.deploy(
      treasury.address,
      await uniswapRouter.getAddress()
    );
    
    console.log("Contracts deployed successfully");
    
    // Setup verifier and neighborhood
    await manager.addVerifier(owner.address);
    console.log("Owner added as verifier");
  });
  
  it("Should create token and test purchases across bonding curve steps", async function () {
    // Step 1: Verify location for token creation
    console.log("\n----- Step 1: Verifying location -----");
    await manager.verifyLocation(creator.address, "Kerry", "KERY");
    console.log("Location 'Kerry' verified for creator");
    
    // Step 2: Create token with 0.001 ETH initial purchase
    console.log("\n----- Step 2: Creating token with initial purchase -----");
    const creationFee = await manager.CREATION_FEE();
    const initialPurchase = ethers.parseEther("0.001");
    const totalPayment = creationFee + initialPurchase;
    
    console.log(`Creation fee: ${ethers.formatEther(creationFee)} ETH`);
    console.log(`Initial purchase: ${ethers.formatEther(initialPurchase)} ETH`);
    console.log(`Total payment: ${ethers.formatEther(totalPayment)} ETH`);
    
    const createTx = await manager.connect(creator).createHoodToken(initialPurchase, { 
      value: totalPayment,
      gasLimit: 5000000 // Set higher gas limit for token creation
    });
    
    await logTransaction(createTx, "Token Creation Transaction");
    
    // Get token address and contract
    tokenAddress = await manager.getHoodToken("Kerry");
    tokenContract = await ethers.getContractAt("HoodCoinToken", tokenAddress);
    
    console.log(`Token created at: ${tokenAddress}`);
    console.log(`Token name: ${await tokenContract.name()}`);
    console.log(`Token symbol: ${await tokenContract.symbol()}`);
    
    // Check creator's balance
    await getTokenBalance(creator.address);
    await getTokenInfo();
    
    // Get initial bonding curve step
    const initialPrice = await manager.getCurrentTokenPrice(tokenAddress);
    console.log(`Current token price: ${ethers.formatEther(initialPrice)} ETH`);
    
    // Step 3: Try larger purchase (0.05 ETH)
    console.log("\n----- Step 3: Attempting larger purchase (0.05 ETH) -----");
    
    try {
      const largePurchaseTx = await manager.connect(buyer).mintTokens(
        tokenAddress, 
        ethers.parseEther("0.1"), // Max ETH amount (higher than actual to account for royalties)
        { 
          value: ethers.parseEther("0.05"),
          gasLimit: 5000000 // Set higher gas limit
        }
      );
      
      await logTransaction(largePurchaseTx, "Large Purchase Transaction");
      console.log("Large purchase succeeded!");
      
      // Check buyer's balance
      await getTokenBalance(buyer.address);
      await getTokenInfo();
      
      // Get current price
      const priceAfterLargePurchase = await manager.getCurrentTokenPrice(tokenAddress);
      console.log(`Current token price: ${ethers.formatEther(priceAfterLargePurchase)} ETH`);
      
    } catch (error) {
      console.log("Large purchase failed with error:", error.message);
      
      // Step 4: Try a purchase that would just move into step 1
      console.log("\n----- Step 4: Attempting purchase to move into step 1 -----");
      
      try {
        // Find current step
        const { totalSupply } = await getTokenInfo();
        
        // First step boundary (from your contract)
        const step1Limit = ethers.parseEther("10000000"); // 10M tokens
        
        console.log(`Step 1 limit: ${ethers.formatEther(step1Limit)} tokens`);
        console.log(`Current supply: ${ethers.formatEther(totalSupply)} tokens`);
        
        // Calculate tokens needed to reach step 1 boundary
        const tokensNeeded = step1Limit - totalSupply + ethers.parseEther("1"); // Add 1 token to ensure we cross
        
        // Get current price
        const currentPrice = await manager.getCurrentTokenPrice(tokenAddress);
        
        // Calculate approximate ETH needed (add buffer for royalties)
        const ethNeeded = (tokensNeeded * currentPrice) / ethers.parseEther("1");
        const ethWithBuffer = (ethNeeded * 12n) / 10n; // Add 20% buffer
        
        console.log(`Tokens needed to cross step 1: ${ethers.formatEther(tokensNeeded)}`);
        console.log(`Estimated ETH needed: ${ethers.formatEther(ethWithBuffer)}`);
        
        const stepCrossTx = await manager.connect(buyer).mintTokens(
          tokenAddress,
          ethers.parseEther("1.0"), // High max ETH amount
          {
            value: ethWithBuffer,
            gasLimit: 8000000 // Even higher gas limit for crossing step
          }
        );
        
        await logTransaction(stepCrossTx, "Step 1 Crossing Transaction");
        console.log("Successfully crossed into step 1!");
        
        // Check buyer's balance
        await getTokenBalance(buyer.address);
        await getTokenInfo();
        
        // Get current price
        const priceAfterStep1 = await manager.getCurrentTokenPrice(tokenAddress);
        console.log(`Current token price: ${ethers.formatEther(priceAfterStep1)} ETH`);
        
      } catch (error) {
        console.log("Step crossing purchase failed with error:", error.message);
        
        // Step 5: Try a purchase that gets close to but doesn't cross the step boundary
        console.log("\n----- Step 5: Attempting purchase near step boundary -----");
        
        try {
          // Find current step boundary
          const { totalSupply } = await getTokenInfo();
          
          // First step boundary
          const step1Limit = ethers.parseEther("10000000"); // 10M tokens
          
          // Calculate tokens for 90% of the way to the boundary
          const tokensTo90Percent = (step1Limit * 90n) / 100n - totalSupply;
          
          // Get current price
          const currentPrice = await manager.getCurrentTokenPrice(tokenAddress);
          
          // Calculate approximate ETH needed
          const ethNeeded = (tokensTo90Percent * currentPrice) / ethers.parseEther("1");
          const ethWithBuffer = (ethNeeded * 12n) / 10n; // Add 20% buffer
          
          console.log(`Tokens needed for 90% of step 1: ${ethers.formatEther(tokensTo90Percent)}`);
          console.log(`Estimated ETH needed: ${ethers.formatEther(ethWithBuffer)}`);
          
          // Make the purchase
          const nearBoundaryTx = await manager.connect(buyer).mintTokens(
            tokenAddress,
            ethers.parseEther("1.0"), // High max ETH amount
            {
              value: ethWithBuffer,
              gasLimit: 5000000
            }
          );
          
          await logTransaction(nearBoundaryTx, "Near Boundary Transaction");
          console.log("Successfully purchased tokens near boundary!");
          
          // Check buyer's balance
          await getTokenBalance(buyer.address);
          await getTokenInfo();
          
          // Get current price to confirm we didn't cross boundary
          const priceNearBoundary = await manager.getCurrentTokenPrice(tokenAddress);
          console.log(`Current token price: ${ethers.formatEther(priceNearBoundary)} ETH`);
          
        } catch (error) {
          console.log("Near boundary purchase failed with error:", error.message);
        }
      }
    }
    
    // Final check of balances and state
    console.log("\n----- Final State -----");
    
    // Check balances
    console.log("Creator's tokens:");
    await getTokenBalance(creator.address);
    
    console.log("Buyer's tokens:");
    await getTokenBalance(buyer.address);
    
    // Check reserve and supply
    await getTokenInfo();
    
    // Check current price
    const finalPrice = await manager.getCurrentTokenPrice(tokenAddress);
    console.log(`Final token price: ${ethers.formatEther(finalPrice)} ETH`);
    
    // Report test results
    console.log("\n----- Test Results Summary -----");
    console.log(`Token "Kerry" created at: ${tokenAddress}`);
    console.log(`Initial purchase: ${ethers.formatEther(initialPurchase)} ETH`);
    
    const { totalSupply } = await getTokenInfo();
    const step1Limit = ethers.parseEther("10000000"); // 10M tokens
    
    if (totalSupply >= step1Limit) {
      console.log("Status: Successfully crossed into step 1");
    } else {
      const percentToStep1 = (totalSupply * 100n) / step1Limit;
      console.log(`Status: Reached ${percentToStep1.toString()}% of the way to step 1`);
    }
  });
});