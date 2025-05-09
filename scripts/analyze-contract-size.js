// scripts/analyze-contract-size.js
const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("Analyzing contract sizes...");
  
  // Compile contracts first if needed
  await hre.run('compile');
  
  // Deploy contracts to analyze their bytecode
  const [owner, treasury] = await ethers.getSigners();
  
  // Deploy mock Uniswap router
  const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
  const uniswapRouter = await MockUniswapRouter.deploy();
  await uniswapRouter.waitForDeployment();
  
  // Deploy bonding math library
  const HoodCoinBondingMath = await ethers.getContractFactory("HoodCoinBondingMath");
  const bondingMath = await HoodCoinBondingMath.deploy();
  await bondingMath.waitForDeployment();
  
  // Deploy manager with the library linked
  const HoodCoinManager = await ethers.getContractFactory("HoodCoinManager", {
    libraries: {
      HoodCoinBondingMath: await bondingMath.getAddress()
    }
  });
  
  const manager = await HoodCoinManager.deploy(
    treasury.address,
    await uniswapRouter.getAddress()
  );
  await manager.waitForDeployment();
  
  // Deploy a token for testing
  await manager.addVerifier(owner.address);
  await manager.verifyLocation(owner.address, "TestNeighborhood", "TEST");
  const creationFee = await manager.CREATION_FEE();
  await manager.createHoodToken(0, { value: creationFee });
  const tokenAddress = await manager.getHoodToken("TestNeighborhood");
  const tokenContract = await ethers.getContractAt("HoodCoinToken", tokenAddress);
  
  // Get contract objects
  const contracts = {
    "HoodCoinBondingMath": bondingMath,
    "HoodCoinManager": manager,
    "HoodCoinToken": tokenContract,
    "MockUniswapRouter": uniswapRouter
  };
  
  // Analyze contract sizes
  console.log("\nContract Size Analysis:");
  console.log("------------------------");
  console.log("Contract Name          | Size (bytes) | Size (KB) | % of Limit");
  console.log("------------------------|--------------|-----------|------------");
  
  const sizeLimit = 24576; // Ethereum contract size limit (24KB)
  
  for (const [name, contract] of Object.entries(contracts)) {
    // Get deployedBytecode from the artifact
    const contractFactory = await ethers.getContractFactory(name, {
      libraries: name === "HoodCoinManager" ? {
        HoodCoinBondingMath: await bondingMath.getAddress()
      } : {}
    });
    
    const bytecode = contractFactory.bytecode;
    const sizeInBytes = (bytecode.length - 2) / 2; // -2 for '0x' prefix, /2 for hex representation
    const sizeInKB = sizeInBytes / 1024;
    const percentOfLimit = (sizeInBytes / sizeLimit) * 100;
    
    console.log(
      `${name.padEnd(22)} | ${sizeInBytes.toString().padEnd(12)} | ${sizeInKB.toFixed(2).padEnd(9)} | ${percentOfLimit.toFixed(2)}%`
    );
  }
  
  // Analyze function gas costs
  console.log("\nFunction Gas Cost Analysis:");
  console.log("---------------------------");
  
  // First, make a small purchase
  const smallTx = await manager.mintTokens(
    tokenAddress,
    ethers.parseEther("1.0"),
    { value: ethers.parseEther("0.001") }
  );
  const smallReceipt = await smallTx.wait();
  
  // Then try a larger purchase (with higher gas limit)
  let largeTx, largeReceipt;
  try {
    largeTx = await manager.mintTokens(
      tokenAddress,
      ethers.parseEther("1.0"),
      { 
        value: ethers.parseEther("0.01"),
        gasLimit: 15000000 
      }
    );
    largeReceipt = await largeTx.wait();
  } catch (error) {
    console.log("Large purchase failed:", error.message);
  }
  
  console.log(`Small purchase (0.001 ETH) gas used: ${smallReceipt.gasUsed.toString()}`);
  if (largeReceipt) {
    console.log(`Large purchase (0.01 ETH) gas used: ${largeReceipt.gasUsed.toString()}`);
    console.log(`Difference: ${largeReceipt.gasUsed - smallReceipt.gasUsed} gas units`);
  }
  
  console.log("\nAnalysis complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });