// scripts/debug-migration.js
const { ethers } = require("hardhat");

async function main() {
    try {
      // Get the contract factory with library linking
      const HoodCoinBondingMath = await ethers.getContractFactory("HoodCoinBondingMath");
      const bondingMathAddress = "0x5e30105e6e64789a2eFc438566D70EAf18e94390";
      
      // Link the library
      const HoodCoinManager = await ethers.getContractFactory("HoodCoinManager", {
        libraries: {
          HoodCoinBondingMath: bondingMathAddress
        }
      });

    const managerAddress = "0x0609a8ae1dab5f5a85b564d1f36aa2ea1780cb64";
    const manager = await HoodCoinManager.attach(managerAddress);
    
    // The token address you're trying to migrate
    const tokenAddress = "0x6DCFFa48Ea8821bc01508902D805e345c38Aa226";
    
    console.log("Connected to manager contract at:", managerAddress);
    console.log("Using library at:", bondingMathAddress);
    console.log("Attempting to migrate token:", tokenAddress);
    
    // Try calling some read functions first to check state
    const migrationInfo = await manager.getMigrationProgress(tokenAddress);
    console.log("Migration progress:", {
      migratedAlready: migrationInfo[0],
      currentReserves: ethers.formatEther(migrationInfo[1]),
      migrationThreshold: ethers.formatEther(migrationInfo[2]),
      percentageToMigration: migrationInfo[3].toString(),
      ethToMigration: ethers.formatEther(migrationInfo[4])
    });
    
    // Check if the token is in the ready-for-migration list
    const readyTokens = await manager.getTokensReadyForMigration();
    console.log("Tokens ready for migration:", readyTokens);
    console.log("Is our token in the list:", readyTokens.includes(tokenAddress));
    
    // Try to call the migrate function
    console.log("Calling migrateReadyToken with 0% fee...");
    const tx = await manager.migrateReadyToken(tokenAddress, 0, {
      gasLimit: 1000000
    });
    
    console.log("Transaction sent:", tx.hash);
    console.log("Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("Success! Transaction confirmed");
    console.log("Gas used:", receipt.gasUsed.toString());
    
  } catch (error) {
    console.error("Transaction failed with error:");
    
    // Try to extract useful information from the error
    if (error.message) {
      console.error("Message:", error.message);
      
      // Look for revert reason in the error message
      const revertMatch = error.message.match(/reverted with reason string '(.+?)'/);
      if (revertMatch) {
        console.error("Revert reason:", revertMatch[1]);
      }
      
      const customErrorMatch = error.message.match(/reverted with custom error '(.+?)'/);
      if (customErrorMatch) {
        console.error("Custom error:", customErrorMatch[1]);
      }
    }
    
    // Log any data that might contain revert reasons
    if (error.data) {
      console.error("Error data:", error.data);
    }
    
    // Check if token info is available in the contract
    try {
      const [deployer] = await ethers.getSigners();
      console.log("Checking if caller is migrator...");
      const migrator = await manager.migrator();
      console.log("Migrator address:", migrator);
      console.log("Caller address:", deployer.address);
      console.log("Is caller the migrator:", migrator.toLowerCase() === deployer.address.toLowerCase());
    } catch (infoError) {
      console.error("Could not get contract info:", infoError.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });