require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");
const { LedgerSigner } = require("@anders-t/ethers-ledger");

// Define private keys securely - keep existing function for testnet
function getPrivateKey(networkName) {
  console.log(`Getting private key for network: ${networkName}`);
  if (networkName.includes("sepolia") || networkName.includes("test")) {
    const key = process.env.TEST_PRIVATE_KEY || "";
    console.log(`Using TEST_PRIVATE_KEY, exists: ${!!key}`);
    return key;
  }
  const key = process.env.MAINNET_PRIVATE_KEY || "";
  console.log(`Using PRIVATE_KEY, exists: ${!!key}`);
  return key;
}

// Function to determine network accounts
function getNetworkAccounts(networkName) {
  // Keep existing private key system for testnet
  if (networkName.includes("sepolia") || networkName.includes("test")) {
    const privateKey = getPrivateKey(networkName);
    return privateKey ? [privateKey] : [];
  }
  
  // For mainnet - use Ledger
  console.log(`Using Ledger hardware wallet for ${networkName}`);
  return {
    mnemonic: process.env.MNEMONIC || "",
    path: "m/44'/60'/0'/0",
    initialIndex: 0,
    count: 1,
    passphrase: ""
  };
}

// Define default values for essential parameters
const defaultConfig = {
  treasuryAddress: process.env.TREASURY_ADDRESS,
  uniswapRouter: {
    base: process.env.UNISWAP_ROUTER_BASE || "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    baseSepolia: process.env.UNISWAP_ROUTER_BASE_SEPOLIA || "0x1689E7B1F10000AE47eBfE339a4f69dECd19F602"
  }
};

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true 
    }
  },
  
  paths: {
    sources: "contracts",
    tests: "test",
    cache: "cache",
    artifacts: "artifacts"
  },
  
  networks: {
    hardhat: {
    },
    base: {
      url: process.env.RPC_BASE || "https://mainnet.base.org",
      chainId: 8453,
      accounts: getNetworkAccounts("base")
    },
    baseSepolia: {
      url: process.env.RPC_BASE_SEPOLIA || "https://sepolia.base.org",
      chainId: 84532,
      // Keep the exact same approach you had for testnet
      accounts: getPrivateKey("baseSepolia") ? [getPrivateKey("baseSepolia")] : [process.env.TEST_PRIVATE_KEY]
    }
  },
  
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD"
  },
  
  etherscan: {
    apiKey: {
      base: process.env.BASESCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || ""
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      }
    ]
  },
  
  // Pass config to scripts and tests
  defaultConfig
};