# HoodCoin

## Overview 👀

HoodCoin is a bonding curve-based token protocol built for the neighborhood economy. Users can create tokens tied to specific neighborhoods (Hoods), with each token following a custom bonding curve utilizing any existing ERC20 token as collateral. By using bonding curves, hood tokens are immediately tradable without requiring liquidity creation on DEXs or CEXs.

- **Website**: https://hoods.ninja

## Security Audit 🔒

- Audit Report completed with 0 high and 0 medium severity issues
- Security tests and monitoring in place

## Key Features 🗝️

1. **Neighborhood Token Creation**

   - Create a bonding curve token (ERC20) representing your neighborhood
   - Use ETH or other ERC20 tokens as the base asset for your token's bonding curve pool
   - Choose from multiple curve types such as linear, exponential, or flat line
   - Set key token specifications like starting price, max price, and supply
   - Deploy on various Layer 1 and 2 networks

2. **Buy (= Mint) and Sell (= Burn) Bonding Curve Tokens**

   - When a token is bought, the price curve determines the amount of the base token to be paid, enabling a swap
   - Base tokens are stored in the bonding curve pool, and an equivalent amount of neighborhood tokens is minted to the buyer
   - When a token is sold, the curve calculates the amount of base tokens to be returned to the seller
   - Neighborhood tokens are burned when sold back to the curve

3. **Location Verification**

   - Verified locations ensure authentic neighborhood representation
   - Only verified users can create tokens for specific neighborhoods
   - Verifiers are appointed by the protocol to maintain the integrity of the ecosystem

4. **Uniswap Migration Tool**

   - Once a neighborhood token reaches sufficient liquidity, it can migrate to Uniswap
   - This enables broader market access and additional trading options
   - Migration distributes tokens to creators and stakeholders

## Goals and Objectives ⛳️

HoodCoin aims to provide a robust framework for neighborhood tokenization, creating economic incentives for local community development. We're solving the liquidity challenge that faces most new token projects by implementing the bonding curve mechanism, which ensures instant tradability from day one.

## Contract Addresses 📜

<table>
   <thead>
      <tr>
         <th>Contract / Chain</th>
         <th><a href="https://basescan.org">Base</a></th>
         <th><a href="https://optimistic.etherscan.io">Optimism</a></th>
         <th><a href="https://arbiscan.io">Arbitrum One</a></th>
         <th><a href="https://etherscan.io">Ethereum</a></th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td>HoodCoinToken</td>
         <td colspan="4">0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df</td>
      </tr>
      <tr>
         <td>HoodCoinManager</td>
         <td colspan="4">0x6c61918eECcC306D35247338FDcf025af0f6120A</td>
      </tr>
      <tr>
         <td>HoodCoinBondingMath</td>
         <td colspan="4">0xc5a076cad94176c2996B32d8466Be1cE757FAa27</td>
      </tr>
   </tbody>
</table>

<table>
   <thead>
      <tr>
         <th>Contract / Chain</th>
         <th><a href="https://testnet.basescan.org">Base Sepolia Testnet</a></th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td>HoodCoinToken</td>
         <td>0x37F540de37afE8bDf6C722d87CB019F30e5E406a</td>
      </tr>
      <tr>
         <td>HoodCoinManager</td>
         <td>0x4bF67e5C9baD43DD89dbe8fCAD3c213C868fe881</td>
      </tr>
      <tr>
         <td>HoodCoinBondingMath</td>
         <td>0x5dfA75b0185efBaEF286E80B847ce84ff8a62C2d</td>
      </tr>
   </tbody>
</table>

## Design Choices 📐

### Discrete Bonding Curve (DBC)

We've implemented a custom step-based bonding curve for the following reasons:

1. More predictable and testable price steps compared to complex mathematical functions
2. Greater flexibility to customize the curve for different neighborhood economic models
3. Simple to calculate and fully customizable via `BondStep[] { rangeTo, price }` configurations

### Custom ERC20 Tokens as Reserve Tokens

Some ERC20 tokens incorporate tax or rebasing functionalities, which could lead to unforeseen behaviors in our bond contract. For instance, a taxed token might result in the undercollateralization of the reserve token.

Due to the diverse nature of custom cases, it's impractical for our bond contract to address all of them. Therefore, we have chosen not to handle these cases explicitly. Any behavior stemming from the custom ERC20 token is not considered a bug, as it is a consequence of the token's inherent code.

We provide warnings on our official front-end for tokens known to potentially disrupt our bond contract. However, **it's crucial for users to conduct their own research and understand the potential implications of selecting a specific reserve token.**

## Run Tests 🧪

```bash
npx hardhat test
```

### Coverage ☂️

```m
--------------------------|----------|----------|----------|----------|----------------|
File                      |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
--------------------------|----------|----------|----------|----------|----------------|
 contracts/               |    97.05 |    78.74 |    91.89 |    96.33 |                |
  HoodCoinBondingMath.sol |      100 |    92.86 |      100 |      100 |                |
  HoodCoinManager.sol     |     99.4 |    80.56 |     96.3 |    99.05 |        348,717 |
  HoodCoinToken.sol       |      100 |       50 |      100 |      100 |                |
--------------------------|----------|----------|----------|----------|----------------|
All files                 |    94.26 |    77.29 |    86.44 |    93.47 |                |
--------------------------|----------|----------|----------|----------|----------------|
```

## Deploy 🚀

```bash
npx hardhat compile && HARDHAT_NETWORK=basesepolia node scripts/deploy.js
```

## Gas Consumption ⛽️

```m
·-----------------------------------------------------|---------------------------|---------------|-----------------------------·
|                Solc version: 0.8.20                 ·  Optimizer enabled: true  ·  Runs: 50000  ·  Block limit: 30000000 gas  │
······················································|···························|···············|······························
|  Methods                                                                                                                      │
························|·····························|·············|·············|···············|···············|··············
|  Contract             ·  Method                     ·  Min        ·  Max        ·  Avg          ·  # calls      ·  usd (avg)  │
························|·····························|·············|·············|···············|···············|··············
|  HoodCoinManager      ·  burn                       ·      95828  ·     130648  ·       118254  ·           43  ·          -  │
························|·····························|·············|·············|···············|···············|··············
|  HoodCoinManager      ·  createHoodToken            ·     299237  ·     521942  ·       495817  ·          147  ·          -  │
························|·····························|·············|·············|···············|···············|··············
|  HoodCoinManager      ·  mint                       ·     109458  ·     208974  ·       189745  ·          104  ·          -  │
························|·····························|·············|·············|···············|···············|··············
|  HoodCoinManager      ·  updateMigrationThreshold   ·      46917  ·      46929  ·        46924  ·            5  ·          -  │
························|·····························|·············|·············|···············|···············|··············
|  HoodCoinToken        ·  approve                    ·      48964  ·      49312  ·        49220  ·           36  ·          -  │
························|·····························|·············|·············|···············|···············|··············
|  HoodCoinToken        ·  transfer                   ·          -  ·          -  ·        32280  ·            1  ·          -  │
························|·····························|·············|·············|···············|···············|··············
|  Deployments                                        ·                                           ·  % of limit   ·             │
······················································|·············|·············|···············|···············|··············
|  HoodCoinBondingMath                                ·          -  ·          -  ·      4852482  ·       16.2 %  ·          -  │
······················································|·············|·············|···············|···············|··············
|  HoodCoinManager                                    ·          -  ·          -  ·      4852482  ·       16.2 %  ·          -  │
······················································|·············|·············|···············|···············|··············
|  HoodCoinToken                                      ·          -  ·          -  ·       858512  ·        2.9 %  ·          -  │
·-----------------------------------------------------|-------------|-------------|---------------|---------------|-------------·
```

## Contributing

We welcome contributions to the HoodCoin protocol. Please feel free to submit issues and pull requests.

## License

MIT