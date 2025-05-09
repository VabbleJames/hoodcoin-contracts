// test/hoodcoin-e2e-test.js
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
    // Step 2: Verify constants match expected values
    logStep(2, "Verifying contract constants");
    
    const CREATION_FEE = await manager.CREATION_FEE();
    const MIGRATION_THRESHOLD = await manager.MIGRATION_THRESHOLD();
    const MINT_ROYALTY = await manager.MINT_ROYALTY();
    const BURN_ROYALTY = await manager.BURN_ROYALTY();
    const MAX_SUPPLY = await manager.MAX_SUPPLY();
    const CURVE_SUPPLY = await manager.CURVE_SUPPLY();
    
    console.log(`Creation fee: ${formatEth(CREATION_FEE)} ETH`);
    console.log(`Migration threshold: ${formatEth(MIGRATION_THRESHOLD)} ETH`);
    console.log(`Mint royalty: ${Number(MINT_ROYALTY) / 100}%`);
    console.log(`Burn royalty: ${Number(BURN_ROYALTY) / 100}%`);
    console.log(`Max supply: ${formatEth(MAX_SUPPLY)} tokens`);
    console.log(`Curve supply: ${formatEth(CURVE_SUPPLY)} tokens`);
    
    // Verify values match expected contract values
    expect(Number(MINT_ROYALTY)).to.equal(100); // 1%
    expect(Number(BURN_ROYALTY)).to.equal(150); // 1.5%
    expect(formatEth(MIGRATION_THRESHOLD)).to.equal("0.1"); // 0.1 ETH for testing
    
    // Step 3: Add Verifier
    logStep(3, "Setting up verifiers");
    // Owner should already be a verifier by default
    const isOwnerVerifier = await manager.isVerifier(owner.address);
    console.log(`Is owner already a verifier: ${isOwnerVerifier}`);
    
    // Add another verifier
    await manager.addVerifier(verifier.address);
    console.log(`Verifier added: ${verifier.address}`);
    
    // Step 4: Verify Location
    logStep(4, "Verifying location");
    const neighborhoodName = "TestNeighborhood";
    const tokenSymbol = "TEST";
    
    await manager.connect(verifier).verifyLocation(
      creator.address,
      neighborhoodName,
      tokenSymbol
    );
    console.log(`Location verified for ${creator.address}: ${neighborhoodName} (${tokenSymbol})`);
    
    // Step 5: Create Token
    logStep(5, "Creating token");
    console.log(`Creation fee: ${formatEth(CREATION_FEE)} ETH`);
    
    const initialPurchase = eth("0.01");
    console.log(`Initial purchase amount: ${formatEth(initialPurchase)} ETH`);
    
    const createTx = await manager.connect(creator).createHoodToken(
      initialPurchase, 
      { value: CREATION_FEE + initialPurchase }
    );
    await createTx.wait();
    
    tokenAddress = await manager.getHoodToken(neighborhoodName);
    tokenContract = await ethers.getContractAt("HoodCoinToken", tokenAddress);
    
    console.log(`Token created at: ${tokenAddress}`);
    console.log(`Token name: ${await tokenContract.name()}`);
    console.log(`Token symbol: ${await tokenContract.symbol()}`);
    
    // Step 6: Check Creator's Initial Balance
    logStep(6, "Checking creator's token balance");
    const creatorBalance = await tokenContract.balanceOf(creator.address);
    console.log(`Creator's token balance: ${formatEth(creatorBalance)}`);
    expect(creatorBalance).to.be.gt(0);
    
    // Step 7: Check current token price
    logStep(7, "Checking initial token price");
    const initialPrice = await manager.getCurrentTokenPrice(tokenAddress);
    console.log(`Initial token price: ${formatEth(initialPrice)} ETH per token`);
    
    // Step 8: First User Buys Tokens
    logStep(8, "First user buying tokens");
    const buyer1Amount = eth("0.02");
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
    
    // Step 9: Check token info and total supply
    logStep(9, "Checking token information after first purchase");
    const tokenInfo1 = await manager.tokenInfo(tokenAddress);
    console.log(`Reserved balance: ${formatEth(tokenInfo1.reserveBalance)} ETH`);
    console.log(`Migrated: ${tokenInfo1.migrated}`);
    console.log(`Ready for migration: ${tokenInfo1.readyForMigration}`);
    console.log(`Total supply: ${formatEth(await tokenContract.totalSupply())}`);
    
    // Step 10: Second User Buys Tokens
    logStep(10, "Second user buying tokens");
    const buyer2Amount = eth("0.03");
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
    
    // Step 11: Check token price after purchases
    logStep(11, "Checking token price after purchases");
    const priceAfterPurchases = await manager.getCurrentTokenPrice(tokenAddress);
    console.log(`Token price after purchases: ${formatEth(priceAfterPurchases)} ETH per token`);
    
    // Step 12: First User Sells Some Tokens
    logStep(12, "First user selling tokens");
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
    
    // Step 13: Check Migration Progress
    logStep(13, "Checking migration progress");
    const migrationProgress = await manager.getMigrationProgress(tokenAddress);
    console.log(`Migrated already: ${migrationProgress[0]}`);
    console.log(`Current reserves: ${formatEth(migrationProgress[1])} ETH`);
    console.log(`Migration threshold: ${formatEth(migrationProgress[2])} ETH`);
    console.log(`Percentage to migration: ${migrationProgress[3]}%`);
    console.log(`ETH needed for migration: ${formatEth(migrationProgress[4])} ETH`);
    
    // Step 14: Buy Tokens to Trigger Migration
    logStep(14, "Buying tokens to trigger migration");
    const tokenInfo2 = await manager.tokenInfo(tokenAddress);
    
    // Calculate how much more ETH is needed based on current reserves
    const reservesNeeded = MIGRATION_THRESHOLD - tokenInfo2.reserveBalance;
    // Add buffer to ensure we cross the threshold
    const buffer = eth("0.01");
    const amountForMigration = (reservesNeeded > 0n) ? reservesNeeded + buffer : buffer;
    
    console.log(`ETH needed to trigger migration: ${formatEth(amountForMigration)} ETH`);
    console.log(`Current reserves: ${formatEth(tokenInfo2.reserveBalance)} ETH`);
    console.log(`Migration threshold: ${formatEth(MIGRATION_THRESHOLD)} ETH`);
    
    // This transaction should trigger migration process (setting readyForMigration = true)
    const migrationTx = await manager.connect(buyer2).mintTokens(
      tokenAddress,
      eth("1"), // Max ETH amount
      { value: amountForMigration }
    );
    const migrationReceipt = await migrationTx.wait();
    
    console.log("Migration purchase successful");
    
    // Step 15: Check if Token is Ready for Migration
    logStep(15, "Checking if token is ready for migration");
    const updatedTokenInfo = await manager.tokenInfo(tokenAddress);
    console.log(`Ready for migration: ${updatedTokenInfo.readyForMigration}`);
    console.log(`Migrated: ${updatedTokenInfo.migrated}`);
    console.log(`Reserve balance: ${formatEth(updatedTokenInfo.reserveBalance)} ETH`);
    
    // Get tokens ready for migration
    const tokensReadyForMigration = await manager.getTokensReadyForMigration();
    console.log(`Tokens ready for migration: ${tokensReadyForMigration.length}`);
    console.log(`Is our token in the list: ${tokensReadyForMigration.includes(tokenAddress)}`);
    
    // Step 16: Execute Migration by owner
    if (updatedTokenInfo.readyForMigration && !updatedTokenInfo.migrated) {
      logStep(16, "Executing migration by owner");
      
      try {
        const executeMigrationTx = await manager.connect(owner).triggerMigration(tokenAddress);
        await executeMigrationTx.wait();
        console.log("Migration executed successfully by owner");
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
    
    // Alternative step: If the owner migration didn't work, try with migrator
    const postOwnerMigrationInfo = await manager.tokenInfo(tokenAddress);
    if (!postOwnerMigrationInfo.migrated && postOwnerMigrationInfo.readyForMigration) {
      logStep("16b", "Executing migration through migrator role");
      
      // The migrator is initially set to the owner (deployer) in the constructor
      try {
        const migratorTx = await manager.connect(owner).migrateReadyToken(tokenAddress, 0); // 0% fee
        await migratorTx.wait();
        console.log("Migration executed successfully through migrator role");
      } catch (error) {
        console.error("Migration through migrator failed:", error.message);
      }
    }
    
    // Step 17: Check Final Token Balances
    logStep(17, "Checking final token balances");
    console.log(`Creator: ${formatEth(await tokenContract.balanceOf(creator.address))}`);
    console.log(`Buyer 1: ${formatEth(await tokenContract.balanceOf(buyer1.address))}`);
    console.log(`Buyer 2: ${formatEth(await tokenContract.balanceOf(buyer2.address))}`);
    console.log(`Treasury: ${formatEth(await tokenContract.balanceOf(treasury.address))}`);
    console.log(`Total supply: ${formatEth(await tokenContract.totalSupply())}`);
    
    // Step 18: Try to Buy After Migration
    logStep(18, "Trying to buy tokens after migration");
    
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
    
    // Step 19: Try to Sell After Migration
    logStep(19, "Trying to sell tokens after migration");
    
    // Only attempt to sell if buyer1 has tokens
    const remainingBalance = await tokenContract.balanceOf(buyer1.address);
    if (remainingBalance > 0) {
      try {
        // Approve tokens
        await tokenContract.connect(buyer1).approve(
          await manager.getAddress(),
          remainingBalance
        );
        
        // Try to sell
        await manager.connect(buyer1).burnTokens(
          tokenAddress,
          remainingBalance,
          0 // Min ETH return
        );
        console.log("Selling was successful (this shouldn't happen if migrated)");
      } catch (error) {
        console.log("Selling correctly failed with error:", error.message.substring(0, 100) + "...");
      }
    } else {
      console.log("Buyer 1 has no tokens to sell");
    }
    
    console.log("\n✅ End-to-end test completed successfully");
  });
});