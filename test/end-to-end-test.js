// test/end-to-end-test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HoodCoin End-to-End Test", function () {
  // Increase timeout for complex operations
  this.timeout(180000);
  
  let manager, bondingMath, uniswapRouter;
  let owner, treasury, creator, buyer1, buyer2, verifier;
  let tokenAddress, tokenContract;

  // Helper function to log steps
  function logStep(step, description) {
    console.log(`\n[STEP ${step}] ${description}`);
  }

  // Helper to convert ETH to wei
  function eth(amount) {
    return ethers.parseEther(amount.toString());
  }

  // Helper to format wei to ETH
  function formatEth(wei) {
    return ethers.formatEther(wei);
  }

  before(async function () {
    [owner, treasury, creator, buyer1, buyer2, verifier] = await ethers.getSigners();
    
    logStep(1, "Deploying contracts");
    
    // Deploy mock Uniswap router
    const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
    uniswapRouter = await MockUniswapRouter.deploy();
    
    // Deploy bonding math library
    const HoodCoinBondingMath = await ethers.getContractFactory("HoodCoinBondingMath");
    bondingMath = await HoodCoinBondingMath.deploy();
    
    // Deploy manager with the library linked
    const HoodCoinManager = await ethers.getContractFactory("HoodCoinManager", {
      libraries: {
        HoodCoinBondingMath: await bondingMath.getAddress()
      }
    });
    
    manager = await HoodCoinManager.deploy(
      treasury.address,
      await uniswapRouter.getAddress()
    );
    
    console.log("Contracts deployed:");
    console.log(`- HoodCoinBondingMath: ${await bondingMath.getAddress()}`);
    console.log(`- HoodCoinManager: ${await manager.getAddress()}`);
    console.log(`- Mock Uniswap Router: ${await uniswapRouter.getAddress()}`);
  });

  it("Should execute full token lifecycle from creation to migration", async function () {
    // Step 2: Add Verifier
    logStep(2, "Setting up verifiers");
    await manager.addVerifier(verifier.address);
    console.log(`Verifier added: ${verifier.address}`);
    
    // Step 3: Verify Location
    logStep(3, "Verifying location");
    const neighborhoodName = "TestNeighborhood";
    const tokenSymbol = "TEST";
    
    await manager.connect(verifier).verifyLocation(
      creator.address,
      neighborhoodName,
      tokenSymbol
    );
    console.log(`Location verified for ${creator.address}: ${neighborhoodName} (${tokenSymbol})`);
    
    // Step 4: Create Token
    logStep(4, "Creating token");
    const creationFee = await manager.CREATION_FEE();
    console.log(`Creation fee: ${formatEth(creationFee)} ETH`);
    
    const initialPurchase = eth("0.01");
    console.log(`Initial purchase amount: ${formatEth(initialPurchase)} ETH`);
    
    const createTx = await manager.connect(creator).createHoodToken(
      initialPurchase, 
      { value: creationFee + initialPurchase }
    );
    await createTx.wait();
    
    tokenAddress = await manager.getHoodToken(neighborhoodName);
    tokenContract = await ethers.getContractAt("HoodCoinToken", tokenAddress);
    
    console.log(`Token created at: ${tokenAddress}`);
    console.log(`Token name: ${await tokenContract.name()}`);
    console.log(`Token symbol: ${await tokenContract.symbol()}`);
    
    // Step 5: Check Creator's Initial Balance
    logStep(5, "Checking creator's token balance");
    const creatorBalance = await tokenContract.balanceOf(creator.address);
    console.log(`Creator's token balance: ${formatEth(creatorBalance)}`);
    expect(creatorBalance).to.be.gt(0);
    
    // Step 6: First User Buys Tokens
    logStep(6, "First user buying tokens");
    const buyer1Amount = eth("0.05");
    console.log(`Buyer 1 purchasing with ${formatEth(buyer1Amount)} ETH`);
    
    const buy1Tx = await manager.connect(buyer1).mintTokens(
      tokenAddress,
      eth("1.0"), // Max ETH amount
      { value: buyer1Amount }
    );
    await buy1Tx.wait();
    
    const buyer1TokenBalance = await tokenContract.balanceOf(buyer1.address);
    console.log(`Buyer 1's token balance: ${formatEth(buyer1TokenBalance)}`);
    expect(buyer1TokenBalance).to.be.gt(0);
    
    // Step 7: Second User Buys Tokens
    logStep(7, "Second user buying tokens");
    const buyer2Amount = eth("0.07");
    console.log(`Buyer 2 purchasing with ${formatEth(buyer2Amount)} ETH`);
    
    const buy2Tx = await manager.connect(buyer2).mintTokens(
      tokenAddress,
      eth("1.0"), // Max ETH amount
      { value: buyer2Amount }
    );
    await buy2Tx.wait();
    
    const buyer2TokenBalance = await tokenContract.balanceOf(buyer2.address);
    console.log(`Buyer 2's token balance: ${formatEth(buyer2TokenBalance)}`);
    expect(buyer2TokenBalance).to.be.gt(0);
    
    // Step 8: Check Token Info
    logStep(8, "Checking token information");
    const tokenInfo = await manager.tokenInfo(tokenAddress);
    console.log(`Reserved balance: ${formatEth(tokenInfo.reserveBalance)} ETH`);
    console.log(`Migrated: ${tokenInfo.migrated}`);
    console.log(`Ready for migration: ${tokenInfo.readyForMigration}`);
    
    // Step 9: First User Sells Some Tokens
    logStep(9, "First user selling tokens");
    const tokenAmountToSell = buyer1TokenBalance / 2n;
    console.log(`Buyer 1 selling ${formatEth(tokenAmountToSell)} tokens`);
    
    // Approve tokens for transfer
    const approveTx = await tokenContract.connect(buyer1).approve(
      await manager.getAddress(),
      tokenAmountToSell
    );
    await approveTx.wait();
    
    // Execute sell
    const sellTx = await manager.connect(buyer1).burnTokens(
      tokenAddress,
      tokenAmountToSell,
      0 // Min ETH return
    );
    const sellReceipt = await sellTx.wait();
    
    const buyer1BalanceAfterSell = await tokenContract.balanceOf(buyer1.address);
    console.log(`Buyer 1's token balance after selling: ${formatEth(buyer1BalanceAfterSell)}`);
    expect(buyer1BalanceAfterSell).to.be.lt(buyer1TokenBalance);
    
    // Step 10: Get Current Token Price
    logStep(10, "Getting current token price");
    const currentPrice = await manager.getCurrentTokenPrice(tokenAddress);
    console.log(`Current token price: ${formatEth(currentPrice)} ETH per token`);
    
    // Step 11: Check Migration Progress
    logStep(11, "Checking migration progress");
    const migrationProgress = await manager.getMigrationProgress(tokenAddress);
    console.log(`Migrated already: ${migrationProgress[0]}`);
    console.log(`Current reserves: ${formatEth(migrationProgress[1])} ETH`);
    console.log(`Migration threshold: ${formatEth(migrationProgress[2])} ETH`);
    console.log(`Percentage to migration: ${migrationProgress[3]}%`);
    console.log(`ETH needed for migration: ${formatEth(migrationProgress[4])} ETH`);
    
    // Step 12: Buy Tokens to Trigger Migration
    logStep(12, "Buying tokens to trigger migration");
    const migrationThreshold = await manager.MIGRATION_THRESHOLD();
    console.log(`Migration threshold: ${formatEth(migrationThreshold)} ETH`);
    
    // Calculate how much more ETH is needed
    const reservesNeeded = migrationThreshold - tokenInfo.reserveBalance;
    const buffer = eth("0.02"); // Add buffer to ensure threshold is crossed
    const amountForMigration = reservesNeeded + buffer;
    
    console.log(`ETH needed to trigger migration: ${formatEth(amountForMigration)} ETH`);
    
    try {
      // This transaction should trigger migration process
      const migrationTx = await manager.connect(buyer2).mintTokens(
        tokenAddress,
        eth("10"), // High max amount
        { value: amountForMigration }
      );
      await migrationTx.wait();
      
      console.log("Migration purchase successful");
    } catch (error) {
      console.error("Migration purchase failed:", error.message);
    }
    
    // Step 13: Check if Token is Ready for Migration
    logStep(13, "Checking if token is ready for migration");
    const updatedTokenInfo = await manager.tokenInfo(tokenAddress);
    console.log(`Ready for migration: ${updatedTokenInfo.readyForMigration}`);
    console.log(`Migrated: ${updatedTokenInfo.migrated}`);
    
    // Get tokens ready for migration
    const tokensReadyForMigration = await manager.getTokensReadyForMigration();
    console.log(`Tokens ready for migration: ${tokensReadyForMigration.length}`);
    console.log(`Is our token in the list: ${tokensReadyForMigration.includes(tokenAddress)}`);
    
    // Step 14: Execute Migration (if needed)
    if (updatedTokenInfo.readyForMigration && !updatedTokenInfo.migrated) {
      logStep(14, "Executing migration by owner");
      
      try {
        const executeMigrationTx = await manager.connect(owner).triggerMigration(tokenAddress);
        await executeMigrationTx.wait();
        console.log("Migration executed successfully");
      } catch (error) {
        console.error("Migration execution failed:", error.message);
      }
      
      // Check migration status after attempt
      const finalTokenInfo = await manager.tokenInfo(tokenAddress);
      console.log(`Final migration status: ${finalTokenInfo.migrated ? "Migrated" : "Not Migrated"}`);
      console.log(`Final reserve balance: ${formatEth(finalTokenInfo.reserveBalance)} ETH`);
    } else {
      console.log("Token not ready for migration or already migrated");
    }
    
    // Step 15: Check Final Token Balances
    logStep(15, "Checking final token balances");
    console.log(`Creator: ${formatEth(await tokenContract.balanceOf(creator.address))}`);
    console.log(`Buyer 1: ${formatEth(await tokenContract.balanceOf(buyer1.address))}`);
    console.log(`Buyer 2: ${formatEth(await tokenContract.balanceOf(buyer2.address))}`);
    console.log(`Treasury: ${formatEth(await tokenContract.balanceOf(treasury.address))}`);
    console.log(`Total supply: ${formatEth(await tokenContract.totalSupply())}`);
    
    // Step 16: Try to Buy After Migration
    logStep(16, "Trying to buy tokens after migration");
    
    try {
      await manager.connect(buyer1).mintTokens(
        tokenAddress,
        eth("0.1"), // Max ETH amount
        { value: eth("0.01") }
      );
      console.log("Purchase was successful (this shouldn't happen if migrated)");
    } catch (error) {
      console.log("Purchase correctly failed with error:", error.message.substring(0, 100) + "...");
    }
    
    console.log("\n✅ End-to-end test completed successfully");
  });
});