// scripts/deploy.js
// Comprehensive HoodCoin Deployment Script

require("dotenv").config();
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { ethers } = hre;

// Helper functions
function getChainlinkPriceFeed(networkName) {
  console.log(`Getting price feed address for network: ${networkName}`);
  
  // ETH/USD Price Feed addresses on different networks
  const priceFeedAddresses = {
    base: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", // Base Mainnet
    baseSepolia: "0xcD2A119bD1F7DF95d706DE6F2057fDD45A0503E2", // Base Sepolia
    optimism: "0x13e3Ee699D1909E989722E753853AE30b17e08c5", // Optimism
    arbitrum: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", // Arbitrum
    polygon: "0xF9680D99D6C9589e2a93a78A04A279e509205945", // Polygon
    blast: "0x49f6b7Fcc5579f262E9B776Ef4535256a1BF8A91", // Blast (placeholder - verify this)
    // Add other networks as needed
  };
  
  const address = priceFeedAddresses[networkName] || priceFeedAddresses.baseSepolia;
  console.log(`Using price feed address: ${address}`);
  return address;
}

function logHeader(message) {
  console.log("\n" + "=".repeat(50));
  console.log(" " + message);
  console.log("=".repeat(50));
}

function logStep(step, message) {
  console.log(`\n[${step}] ${message}`);
}

function logSuccess(message) {
  console.log(`✅ ${message}`);
}

function logWarning(message) {
  console.log(`⚠️ ${message}`);
}

function logError(message) {
  console.error(`❌ ${message}`);
}

async function getNetworkConfig() {
  const networkName = hre.network.name;
  const isTestnet = networkName.includes("sepolia") || networkName.includes("test") || networkName.includes("goerli");
  
  // Get config from hardhat.config.js
  const config = hre.config.defaultConfig || {};
  
  if (!config) {
    throw new Error("defaultConfig not found in hardhat config");
  }
  
  // Treasury address
  let treasuryAddress = config.treasuryAddress;
  if (!treasuryAddress) {
    const [deployer] = await ethers.getSigners();
    treasuryAddress = deployer.address;
    logWarning(`No treasury address configured, using deployer address: ${treasuryAddress}`);
  }
  
  // Router address
  let uniswapRouterAddress;
  if (config.uniswapRouter && config.uniswapRouter[networkName]) {
    uniswapRouterAddress = config.uniswapRouter[networkName];
  } else if (isTestnet && config.uniswapRouter && config.uniswapRouter.baseSepolia) {
    uniswapRouterAddress = config.uniswapRouter.baseSepolia;
  } else if (!isTestnet && config.uniswapRouter && config.uniswapRouter.base) {
    uniswapRouterAddress = config.uniswapRouter.base;
  } else {
    // Default addresses based on network type
    uniswapRouterAddress = isTestnet 
      ? "0x8753D65852Ec42bE62B433965b91Ef1c9B162f0B" // Base Sepolia
      : "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"; // Base Mainnet
  }
  
  // Normalize addresses to checksum format
  try {
    treasuryAddress = ethers.getAddress(treasuryAddress);
    
    // Handle potential checksum issues with router address
    try {
      uniswapRouterAddress = ethers.getAddress(uniswapRouterAddress);
    } catch (error) {
      // If checksumming fails, try with lowercase
      try {
        uniswapRouterAddress = ethers.getAddress(uniswapRouterAddress.toLowerCase());
        logWarning("Router address had checksum issues. Fixed by lowercasing first.");
      } catch (err) {
        // If that doesn't work either, use a hardcoded fallback
        logWarning("Router address checksum failed. Using fallback address.");
        uniswapRouterAddress = isTestnet 
          ? "0x8753D65852Ec42bE62B433965b91Ef1c9B162f0B" // Base Sepolia
          : "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"; // Base Mainnet
      }
    }
  } catch (error) {
    throw new Error(`Invalid address format: ${error.message}`);
  }
  
  // Price feed address
  const priceFeedAddress = getChainlinkPriceFeed(networkName);
  
  return {
    networkName,
    isTestnet,
    treasuryAddress,
    uniswapRouterAddress,
    priceFeedAddress,
    chainId: hre.network.config.chainId
  };
}

async function verifyDeployer() {
  logStep("1", "Verifying deployer account");
  
  try {
    const [deployer] = await ethers.getSigners();
    
    if (!deployer) {
      throw new Error("No signer available. Check your private key configuration.");
    }
    
    const address = await deployer.getAddress();
    logSuccess(`Using deployer address: ${address}`);
    
    // Check deployer balance
    const balance = await ethers.provider.getBalance(address);
    const balanceInEth = ethers.formatEther(balance);
    logSuccess(`Deployer balance: ${balanceInEth} ETH`);
    
    if (balance === 0n) {
      logWarning("Deployer has 0 ETH balance. Deployment will likely fail.");
    } else if (balance < ethers.parseEther("0.05")) {
      logWarning(`Low deployer balance (${balanceInEth} ETH). May not be enough for deployment.`);
    }
    
    return deployer;
  } catch (error) {
    logError(`Failed to initialize deployer: ${error.message}`);
    logError("Make sure your private key is correctly set in .env and hardhat.config.js");
    throw error;
  }
}

async function deployBondingMath() {
  logStep("2", "Deploying HoodCoinBondingMath library");
  
  try {
    const HoodCoinBondingMath = await ethers.getContractFactory("HoodCoinBondingMath");
    const bondingMath = await HoodCoinBondingMath.deploy();
    await bondingMath.waitForDeployment();
    
    const address = await bondingMath.getAddress();
    logSuccess(`HoodCoinBondingMath deployed to: ${address}`);
    
    return bondingMath;
  } catch (error) {
    logError(`Failed to deploy HoodCoinBondingMath: ${error.message}`);
    throw error;
  }
}

async function deployHoodCoinManager(bondingMath, networkConfig, deployerAddress) {
  logStep("3", "Deploying HoodCoinManager contract");
  
  try {
    const { treasuryAddress, uniswapRouterAddress } = networkConfig;
    
    console.log(`Treasury address: ${treasuryAddress}`);
    console.log(`Uniswap router address: ${uniswapRouterAddress}`);
    
    const bondingMathAddress = await bondingMath.getAddress();
    
    const HoodCoinManager = await ethers.getContractFactory("HoodCoinManager", {
      libraries: {
        HoodCoinBondingMath: bondingMathAddress
      }
    });
    
    // Deploy with constructor arguments - only two parameters as per the actual contract
    const manager = await HoodCoinManager.deploy(
      treasuryAddress,
      uniswapRouterAddress
    );
    
    await manager.waitForDeployment();
    const managerAddress = await manager.getAddress();
    logSuccess(`HoodCoinManager deployed to: ${managerAddress}`);
    
    return manager;
  } catch (error) {
    logError(`Failed to deploy HoodCoinManager: ${error.message}`);
    throw error;
  }
}

async function verifyDeployment(manager, networkConfig) {
  logStep("4", "Verifying deployment");
  
  try {
    // Verify constants
    console.log("Checking contract constants...");
    
    const CREATION_FEE = await manager.CREATION_FEE();
    const MIGRATION_THRESHOLD = await manager.MIGRATION_THRESHOLD();
    const MINT_ROYALTY = await manager.MINT_ROYALTY();
    const BURN_ROYALTY = await manager.BURN_ROYALTY();
    const MAX_SUPPLY = await manager.MAX_SUPPLY();
    const CURVE_SUPPLY = await manager.CURVE_SUPPLY();
    
    console.log(`- Creation Fee: ${ethers.formatEther(CREATION_FEE)} ETH`);
    console.log(`- Migration Threshold: ${ethers.formatEther(MIGRATION_THRESHOLD)} ETH`);
    console.log(`- Mint Royalty: ${Number(MINT_ROYALTY) / 100}%`);
    console.log(`- Burn Royalty: ${Number(BURN_ROYALTY) / 100}%`);
    console.log(`- Max Supply: ${ethers.formatEther(MAX_SUPPLY)} tokens`);
    console.log(`- Curve Supply: ${ethers.formatEther(CURVE_SUPPLY)} tokens`);
    
    // Verify contract address references
    const contractTreasury = await manager.treasury();
    const contractRouter = await manager.UNISWAP_ROUTER();
    
    console.log(`- Treasury address: ${contractTreasury}`);
    console.log(`- Uniswap Router address: ${contractRouter}`);
    
    // Check addresses match expected values
    if (contractTreasury.toLowerCase() !== networkConfig.treasuryAddress.toLowerCase()) {
      logWarning(`Treasury address mismatch: expected ${networkConfig.treasuryAddress}`);
    }
    
    if (contractRouter.toLowerCase() !== networkConfig.uniswapRouterAddress.toLowerCase()) {
      logWarning(`Uniswap Router address mismatch: expected ${networkConfig.uniswapRouterAddress}`);
    }
    
    return true;
  } catch (error) {
    logError(`Verification failed: ${error.message}`);
    return false;
  }
}

async function setupVerifier(manager, deployer) {
  logStep("5", "Setting up verifier");
  
  try {
    const deployerAddress = await deployer.getAddress();
    const isVerifier = await manager.isVerifier(deployerAddress);
    
    if (!isVerifier) {
      console.log("Adding deployer as a verifier...");
      const tx = await manager.addVerifier(deployerAddress);
      await tx.wait();
      logSuccess("Deployer added as verifier");
    } else {
      logSuccess("Deployer is already a verifier");
    }
    
    return true;
  } catch (error) {
    logError(`Failed to set up verifier: ${error.message}`);
    return false;
  }
}

async function saveDeploymentInfo(bondingMath, manager, networkConfig, deployer) {
  logStep("6", "Saving deployment information");
  
  try {
    const { networkName, chainId } = networkConfig;
    const deploymentDir = path.join(__dirname, "../deployments", networkName);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    const bondingMathAddress = await bondingMath.getAddress();
    const managerAddress = await manager.getAddress();
    const deployerAddress = await deployer.getAddress();
    
    // Gather contract details
    const deploymentInfo = {
      timestamp: new Date().toISOString(),
      network: networkName,
      chainId: Number(chainId),
      deployer: deployerAddress,
      contracts: {
        bondingMath: {
          address: bondingMathAddress
        },
        manager: {
          address: managerAddress,
          treasury: networkConfig.treasuryAddress,
          uniswapRouter: networkConfig.uniswapRouterAddress
        }
      },
      constants: {
        creationFee: (await manager.CREATION_FEE()).toString(),
        migrationThreshold: (await manager.MIGRATION_THRESHOLD()).toString(),
        mintRoyalty: Number(await manager.MINT_ROYALTY()),
        burnRoyalty: Number(await manager.BURN_ROYALTY())
      }
    };
    
    // Helper function to handle BigInt serialization
    const replacer = (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    };
    
    // Save full deployment info
    fs.writeFileSync(
      path.join(deploymentDir, "deployment-info.json"), 
      JSON.stringify(deploymentInfo, replacer, 2)
    );
    
    // Save individual contract info
    fs.writeFileSync(
      path.join(deploymentDir, "HoodCoinBondingMath.json"), 
      JSON.stringify({
        address: bondingMathAddress,
        deployer: deployerAddress,
        network: networkName,
        timestamp: new Date().toISOString(),
        chainId
      }, replacer, 2)
    );
    
    fs.writeFileSync(
      path.join(deploymentDir, "HoodCoinManager.json"), 
      JSON.stringify({
        address: managerAddress,
        bondingMathLibrary: bondingMathAddress,
        treasuryAddress: networkConfig.treasuryAddress,
        uniswapRouterAddress: networkConfig.uniswapRouterAddress,
        deployer: deployerAddress,
        network: networkName,
        timestamp: new Date().toISOString(),
        chainId
      }, replacer, 2)
    );
    
    logSuccess(`Deployment information saved to: ${deploymentDir}`);
    
    return deploymentDir;
  } catch (error) {
    logError(`Failed to save deployment information: ${error.message}`);
    return null;
  }
}

async function displayVerificationCommands(bondingMath, manager, networkConfig) {
  logStep("7", "Generating contract verification commands");
  
  const { networkName, treasuryAddress, uniswapRouterAddress } = networkConfig;
  const bondingMathAddress = await bondingMath.getAddress();
  const managerAddress = await manager.getAddress();
  
  console.log("\nVerification Commands:");
  console.log("----------------------------------------");
  console.log(`npx hardhat verify --network ${networkName} ${bondingMathAddress}`);
  console.log(`npx hardhat verify --network ${networkName} ${managerAddress} ${treasuryAddress} ${uniswapRouterAddress} --libraries HoodCoinBondingMath:${bondingMathAddress}`);
  console.log("----------------------------------------");
}

async function main() {
  try {
    logHeader("HOODCOIN DEPLOYMENT SCRIPT");
    
    // Check network connection
    logStep("0", "Checking network connection");
    try {
      const network = await ethers.provider.getNetwork();
      logSuccess(`Connected to network: ${network.name} (ChainID: ${network.chainId})`);
    } catch (error) {
      logError(`Failed to connect to network: ${error.message}`);
      process.exit(1);
    }
    
    // Get network configuration
    const networkConfig = await getNetworkConfig();
    console.log(`\nDeploying to network: ${networkConfig.networkName} (${networkConfig.isTestnet ? 'TESTNET' : 'MAINNET'})`);
    console.log(`Treasury address: ${networkConfig.treasuryAddress}`);
    console.log(`Uniswap router address: ${networkConfig.uniswapRouterAddress}`);
    console.log(`Price feed address: ${networkConfig.priceFeedAddress}`);
    
    // Verify deployer
    const deployer = await verifyDeployer();
    
    // Deploy contracts
    const bondingMath = await deployBondingMath();
    const manager = await deployHoodCoinManager(bondingMath, networkConfig, await deployer.getAddress());
    
    // Post-deployment steps
    await verifyDeployment(manager, networkConfig);
    await setupVerifier(manager, deployer);
    const deploymentDir = await saveDeploymentInfo(bondingMath, manager, networkConfig, deployer);
    await displayVerificationCommands(bondingMath, manager, networkConfig);
    
    // Summary
    logHeader("DEPLOYMENT SUMMARY");
    console.log(`Network: ${networkConfig.networkName} (Chain ID: ${networkConfig.chainId})`);
    console.log(`HoodCoinBondingMath: ${await bondingMath.getAddress()}`);
    console.log(`HoodCoinManager: ${await manager.getAddress()}`);
    console.log(`Treasury: ${networkConfig.treasuryAddress}`);
    console.log(`Uniswap Router: ${networkConfig.uniswapRouterAddress}`);
    console.log(`Deployment timestamp: ${new Date().toISOString()}`);
    
    if (deploymentDir) {
      console.log(`Deployment artifacts saved to: ${deploymentDir}`);
    }
    
    logSuccess("Deployment completed successfully!");
    
    return { bondingMath, manager, networkConfig };
  } catch (error) {
    logError("Deployment failed!");
    console.error(error);
    process.exit(1);
  }
}

// If running this script directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

// Export for testing
module.exports = { main };