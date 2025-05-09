// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./HoodCoinToken.sol";
import "./HoodCoinBondingMath.sol";
import "./interfaces/IUniswapV2Interfaces.sol";

contract HoodCoinManager is Ownable, ReentrancyGuard {
    using HoodCoinBondingMath for BondStep[];

    // Constants
    uint256 public CREATION_FEE;
    uint256 public MIGRATION_THRESHOLD;
    uint16 public constant MINT_ROYALTY = 100; // 1%
    uint16 public constant BURN_ROYALTY = 150; // 1.5%
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 18; // 1 billion tokens
    uint256 public constant CURVE_SUPPLY = 800_000_000 * 10 ** 18; // 800 million for bonding curve
    address public immutable UNISWAP_ROUTER;
    uint256 public constant RESERVED_TOKENS = 200_000_000 * 10 ** 18; // 200M tokens reserved for migration

    // Treasury address
    address public treasury;

    // Migration Address
    address public migrator;

    //All tokens ready for migration array
    address[] public allTokens;

    // Verifier management
    mapping(address => bool) public isVerifier;

    // Location verification
    struct VerifiedLocation {
        string neighborhood;
        string symbol;
        uint40 timestamp;
        address verifier;
    }
    mapping(address => VerifiedLocation) public verifiedLocations;

    // Token management
    struct TokenInfo {
        address tokenAddress;
        address creator;
        uint256 reserveBalance;
        bool migrated;
        bool readyForMigration;
        uint8 stepsCount; // Number of steps
        mapping(uint8 => BondStep) steps; // Use mapping instead of array
    }
    mapping(bytes32 => address) public hoodTokens; // neighborhood hash -> token address
    mapping(address => TokenInfo) public tokenInfo; // token address -> TokenInfo

    // Events
    event LocationVerified(
        address indexed user,
        string neighborhood,
        string symbol
    );
    event TokenCreated(
        address indexed token,
        string name,
        string symbol,
        address indexed creator
    );
    event TokenPurchased(
        address indexed token,
        address indexed buyer,
        uint256 amount,
        uint256 ethPaid
    );
    event TokenSold(
        address indexed token,
        address indexed seller,
        uint256 amount,
        uint256 ethReceived
    );
    event TokenMigrated(
        address indexed token,
        uint256 tokenAmount,
        uint256 ethAmount
    );
    event VerifierAdded(address indexed verifier);
    event VerifierRemoved(address indexed verifier);
    event TokenReadyForMigration(address indexed token, uint256 reserveBalance);
    event TokenMigratedByMigrator(
        address indexed token,
        address indexed migrator,
        uint256 gasFeeAmount
    );
    event MigratorUpdated(address indexed newMigrator);

    event MigrationThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    event CreationFeeUpdated(uint256 oldFee, uint256 newFee);

    event TokenSupplyChanged(
        address indexed token,
        uint256 newSupply,
        uint256 timestamp
    );

    event TokenPriceChanged(
        address indexed token,
        uint256 oldPrice,
        uint256 newPrice
    );

    event UserPositionUpdated(
        address indexed user,
        address indexed token,
        uint256 balance,
        uint256 timestamp
    );

    event DebugTransfer(
        string message,
        address to,
        uint256 amount,
        bool success
    );
    event DebugStep(string step, uint256 value);
    event DebugETHTransfer(address to, uint256 amount, bool success);

    // Constructor
    constructor(address _treasury, address _uniswapRouter) Ownable(msg.sender) {
        require(_treasury != address(0), "Treasury cannot be zero address");
        require(_uniswapRouter != address(0), "Router cannot be zero adresss");

        treasury = _treasury;
        UNISWAP_ROUTER = _uniswapRouter;
        migrator = msg.sender; //Initially set to deployer
        isVerifier[msg.sender] = true; // Owner is a verifier by default
        CREATION_FEE = 0.001 ether / 1000; // 4.69 in ETH for mainnet
        MIGRATION_THRESHOLD = 0.1 ether; // 20 ETH -- 0.1 eth for testing
    }

    // Modifiers
    modifier onlyVerifier() {
        require(isVerifier[msg.sender], "Not a verifier");
        _;
    }

    function setCreationFee(uint256 _newFee) external onlyOwner {
        // Optional: Add validation if needed
        require(_newFee <= 0.1 ether, "Fee too high");

        uint256 oldFee = CREATION_FEE;
        CREATION_FEE = _newFee;

        // Emit an event to log the change
        emit CreationFeeUpdated(oldFee, _newFee);
    }

    function setMigrationThreshold(uint256 _newThreshold) external onlyOwner {

        require(_newThreshold >= 1 ether, "Threshold too low");

        uint256 oldThreshold = MIGRATION_THRESHOLD;
        MIGRATION_THRESHOLD = _newThreshold;

        // Emit an event to log the change
        emit MigrationThresholdUpdated(oldThreshold, _newThreshold);
    }

    // Function to update the migrator
    function setMigrator(address _migrator) external onlyOwner {
        require(_migrator != address(0), "Invalid migrator address");
        migrator = _migrator;
        emit MigratorUpdated(_migrator);
    }

    // Location verification functions
    function verifyLocation(
        address user,
        string calldata neighborhood,
        string calldata symbol
    ) external onlyVerifier {
        require(bytes(neighborhood).length > 0, "Neighborhood cannot be empty");
        require(
            bytes(symbol).length >= 2 && bytes(symbol).length <= 8,
            "Symbol must be 2-8 characters"
        );

        verifiedLocations[user] = VerifiedLocation({
            neighborhood: neighborhood,
            symbol: symbol,
            timestamp: uint40(block.timestamp),
            verifier: msg.sender
        });

        emit LocationVerified(user, neighborhood, symbol);
    }

    // Verifier management
    function addVerifier(address verifier) external onlyOwner {
        require(verifier != address(0), "Invalid address");
        isVerifier[verifier] = true;
        emit VerifierAdded(verifier);
    }

    function removeVerifier(address verifier) external onlyOwner {
        isVerifier[verifier] = false;
        emit VerifierRemoved(verifier);
    }

    // Token creation
    function createHoodToken(
        uint256 initialPurchaseAmount
    ) external payable nonReentrant {
        // Check if user has verified location
        VerifiedLocation memory location = verifiedLocations[msg.sender];
        require(
            bytes(location.neighborhood).length > 0,
            "Location not verified"
        );

        // Check creation fee
        require(
            msg.value >= CREATION_FEE + initialPurchaseAmount,
            "Insufficient payment"
        );

        // Generate neighborhood hash
        bytes32 neighborhoodHash = keccak256(
            abi.encodePacked(location.neighborhood)
        );
        require(
            hoodTokens[neighborhoodHash] == address(0),
            "Token already exists for neighborhood"
        );

        // Create token
        string memory tokenName = string(
            abi.encodePacked(location.neighborhood, " Hood")
        );
        HoodCoinToken newToken = new HoodCoinToken(
            tokenName,
            location.symbol,
            address(this)
        );
        address tokenAddress = address(newToken);

        // Register token in state BEFORE external calls
        hoodTokens[neighborhoodHash] = tokenAddress;
        allTokens.push(tokenAddress);

        tokenInfo[tokenAddress].tokenAddress = tokenAddress;
        tokenInfo[tokenAddress].creator = msg.sender;
        tokenInfo[tokenAddress].reserveBalance = 0;
        tokenInfo[tokenAddress].migrated = false;
        tokenInfo[tokenAddress].stepsCount = 5;

        // Set up step pricing
        tokenInfo[tokenAddress].steps[0] = BondStep(
            uint128(1e7 * 1e18),
            uint128(428174e3)
        );
        tokenInfo[tokenAddress].steps[1] = BondStep(
            uint128(5e7 * 1e18),
            uint128(2140869e3)
        );
        tokenInfo[tokenAddress].steps[2] = BondStep(
            uint128(2e8 * 1e18),
            uint128(4281738e3)
        );
        tokenInfo[tokenAddress].steps[3] = BondStep(
            uint128(5e8 * 1e18),
            uint128(21408692e3)
        );
        tokenInfo[tokenAddress].steps[4] = BondStep(
            uint128(CURVE_SUPPLY),
            uint128(42817384e3)
        );

        emit TokenCreated(tokenAddress, tokenName, location.symbol, msg.sender);

        // External calls last
        bool success = _safeTransferETH(treasury, CREATION_FEE);
        require(success, "Fee transfer failed");

        // Handle initial purchase if requested
        if (initialPurchaseAmount > 0) {
            _mintTokens(
                tokenAddress,
                initialPurchaseAmount,
                type(uint256).max,
                msg.sender
            );
        }

        // Return any excess ETH
        uint256 refund = msg.value - CREATION_FEE;
        if (initialPurchaseAmount > 0) {
            refund -= initialPurchaseAmount;
        }

        if (refund > 0) {
            bool refundSuccess = _safeTransferETH(msg.sender, refund);
            require(refundSuccess, "Refund failed");
        }
    }

    function _getStepsArray(
        address token
    ) internal view returns (BondStep[] memory) {
        TokenInfo storage info = tokenInfo[token];
        BondStep[] memory stepsArray = new BondStep[](info.stepsCount);

        for (uint8 i = 0; i < info.stepsCount; i++) {
            stepsArray[i] = info.steps[i];
        }

        return stepsArray;
    }

    // Mint tokens (buy)
    function mintTokens(
        address token,
        uint256 maxEthAmount
    ) external payable nonReentrant returns (uint256) {
        require(tokenInfo[token].tokenAddress != address(0), "Token not found");
        require(!tokenInfo[token].migrated, "Token has migrated to Uniswap");
        require(!tokenInfo[token].readyForMigration, "Token is being migrated");
        require(msg.value > 0, "No ETH sent");
        return _mintTokens(token, msg.value, maxEthAmount, msg.sender);
    }

    function _mintTokens(
        address token,
        uint256 ethSent,
        uint256 maxEthAmount,
        address receiver
    ) internal returns (uint256) {
        // CHECKS - Validate inputs and calculate values
        TokenInfo storage info = tokenInfo[token];
        HoodCoinToken tokenContract = HoodCoinToken(token);

        // Validate token is valid and not migrated
        require(info.tokenAddress != address(0), "Token not found");
        require(!info.migrated, "Token has migrated to Uniswap");
        require(!info.readyForMigration, "Token is being migrated");
        require(ethSent > 0, "No ETH sent");

        // Calculate current supply
        uint256 currentSupply = tokenContract.totalSupply();
        require(currentSupply < CURVE_SUPPLY, "Max supply reached");

        // Store old price for event comparison later
        uint256 oldPrice = HoodCoinBondingMath.getCurrentPrice(
            _getStepsArray(token),
            currentSupply
        );

        // Calculate tokens to mint
        uint256 tokensToMint = calculateTokensForEth(token, ethSent);
        require(tokensToMint > 0, "Cannot mint 0 tokens");

        // Ensure we don't exceed the curve supply
        if (currentSupply + tokensToMint > CURVE_SUPPLY) {
            tokensToMint = CURVE_SUPPLY - currentSupply;
        }

        // Calculate exact ETH cost and royalties
        uint256 ethCost;
        uint256 royalty;
        BondStep[] memory stepsArray = _getStepsArray(token);

        (ethCost, royalty) = HoodCoinBondingMath.calculateMintCost(
            stepsArray,
            currentSupply,
            tokensToMint,
            MINT_ROYALTY,
            18 // Token decimals
        );

        require(ethCost <= maxEthAmount, "Cost exceeds max amount");
        require(ethCost <= ethSent, "Insufficient ETH sent");

        // Calculate royalty distribution
        uint256 creatorRoyalty = (royalty * 80) / 100; // 80% to creator
        uint256 treasuryRoyalty = royalty - creatorRoyalty; // 20% to treasury

        // EFFECTS - Update state variables
        // Store important addresses in local variables before state changes
        address creatorAddress = info.creator;

        // Update reserve balance
        info.reserveBalance += ethCost - royalty;

        // Check if migration should be triggered
        bool shouldMigrate = false;
        if (
            !info.migrated &&
            !info.readyForMigration &&
            info.reserveBalance >= MIGRATION_THRESHOLD
        ) {
            shouldMigrate = true;
            info.readyForMigration = true;
        }

        // INTERACTIONS - External calls after all state changes
        // Mint tokens to buyer
        tokenContract.mint(receiver, tokensToMint);

        // Send royalties
        bool sentCreator = _safeTransferETH(creatorAddress, creatorRoyalty);
        bool sentTreasury = _safeTransferETH(treasury, treasuryRoyalty);
        require(sentCreator && sentTreasury, "Royalty transfer failed");

        // Return any excess ETH
        if (ethSent > ethCost && msg.sender == tx.origin) {
            // Only refund externally owned accounts
            uint256 refund = ethSent - ethCost;
            bool refundSuccess = _safeTransferETH(msg.sender, refund);
            require(refundSuccess, "Refund failed");
        }

        // EVENTS - Emit all events after external calls
        // Calculate new price for event (after minting)
        uint256 newPrice = HoodCoinBondingMath.getCurrentPrice(
            _getStepsArray(token),
            tokenContract.totalSupply()
        );

        // Emit events in logical order
        emit TokenPurchased(token, receiver, tokensToMint, ethCost);
        emit TokenSupplyChanged(
            token,
            tokenContract.totalSupply(),
            block.timestamp
        );

        if (oldPrice != newPrice) {
            emit TokenPriceChanged(token, oldPrice, newPrice);
        }

        emit UserPositionUpdated(
            receiver,
            token,
            tokenContract.balanceOf(receiver),
            block.timestamp
        );

        if (shouldMigrate) {
            emit TokenReadyForMigration(token, info.reserveBalance);
        }

        return tokensToMint;
    }

    function _safeTransferETH(
        address to,
        uint256 amount
    ) internal returns (bool) {
        if (amount == 0 || to == address(0)) return true;

        if (to != address(0) && to.code.length > 0) {
            emit DebugTransfer("Transfer to contract", to, amount, false);
        }

        (bool success, ) = to.call{value: amount, gas: 2300}("");

        emit DebugTransfer("Transfer Result", to, amount, success);
        return success;
    }

    // Helper function to extract revert reason
    function _getRevertMsg(
        bytes memory _returnData
    ) internal pure returns (string memory) {
        // If the _returnData length is less than 68, then the transaction failed silently (without a revert message)
        if (_returnData.length < 68) return "Transaction reverted silently";

        assembly {
            // Skip the first 4 bytes (function selector) and length of the revert reason
            _returnData := add(_returnData, 0x04)
        }
        return abi.decode(_returnData, (string));
    }

    function calculateTokensForEth(
        address token,
        uint256 ethAmount
    ) public view returns (uint256) {
        TokenInfo storage info = tokenInfo[token];
        HoodCoinToken tokenContract = HoodCoinToken(token);
        uint256 currentSupply = tokenContract.totalSupply();

        // If we're already at max supply, return 0
        if (currentSupply >= CURVE_SUPPLY) return 0;
        if (ethAmount == 0) return 0;

        // Calculate how much ETH is actually available for tokens after royalty
        uint256 ethWithoutRoyalty = (ethAmount * 10000) /
            (10000 + MINT_ROYALTY);

        // Get steps array once
        BondStep[] memory steps = _getStepsArray(token);
        uint256 multiFactor = 10 ** 18; // ERC20 tokens have 18 decimals

        uint256 tokensOut = 0;
        uint256 reserveLeft = ethWithoutRoyalty;

        // Start at current step
        uint256 i = HoodCoinBondingMath.getCurrentStep(steps, currentSupply);

        while (i < steps.length && reserveLeft > 0) {
            BondStep memory step = steps[i];

            // Calculate available tokens in this step
            uint256 supplyLeft = step.rangeTo - currentSupply;
            if (supplyLeft == 0) {
                i++;
                continue;
            }

            // Calculate how much reserve is needed for all tokens in this step
            uint256 reserveForStep = Math.ceilDiv(
                supplyLeft * step.price,
                multiFactor
            );

            if (reserveForStep <= reserveLeft) {
                // Can mint all tokens in this step
                tokensOut += supplyLeft;
                reserveLeft -= reserveForStep;
                currentSupply += supplyLeft;
                i++;
            } else {
                // Can only mint a portion of this step
                // Using floor division
                uint256 tokensAtStep = (reserveLeft * multiFactor) / step.price;
                tokensOut += tokensAtStep;
                break;
            }
        }

        return tokensOut;
    }

    // Burn tokens (sell)
    function burnTokens(
        address token,
        uint256 tokenAmount,
        uint256 minEthReturn
    ) external nonReentrant returns (uint256) {
        require(tokenInfo[token].tokenAddress != address(0), "Token not found");
        require(!tokenInfo[token].migrated, "Token has migrated to Uniswap");

        TokenInfo storage info = tokenInfo[token];
        HoodCoinToken tokenContract = HoodCoinToken(token);

        // Get current supply
        uint256 currentSupply = tokenContract.totalSupply();

        uint256 oldPrice = HoodCoinBondingMath.getCurrentPrice(
            _getStepsArray(token),
            currentSupply
        );

        // Ensure tokenAmount is valid
        require(tokenAmount > 0, "Cannot burn 0 tokens");
        require(
            tokenAmount <= tokenContract.balanceOf(msg.sender),
            "Insufficient token balance"
        );

        // Calculate refund amount
        (uint256 ethRefund, uint256 royalty) = HoodCoinBondingMath
            .calculateBurnRefund(
                _getStepsArray(token),
                currentSupply,
                tokenAmount,
                BURN_ROYALTY,
                18 // Token decimals
            );

        require(ethRefund >= minEthReturn, "Refund below minimum");
        require(info.reserveBalance >= ethRefund, "Insufficient reserves");

        // Update reserve balance
        info.reserveBalance -= (ethRefund + royalty);

        // Calculate Royalties
        uint256 creatorRoyalty = (royalty * 80) / 100; // 80% to creator
        uint256 treasuryRoyalty = royalty - creatorRoyalty; // 20% to treasury

        // Transfer tokens from sender to this contract
        require(
            tokenContract.transferFrom(msg.sender, address(this), tokenAmount),
            "Token transfer failed"
        );

        emit TokenSupplyChanged(
            token,
            tokenContract.totalSupply(),
            block.timestamp
        );

        uint256 newPrice = HoodCoinBondingMath.getCurrentPrice(
            _getStepsArray(token),
            tokenContract.totalSupply()
        );

        // Check if price changed and emit event if it did (add these lines)
        if (oldPrice != newPrice) {
            emit TokenPriceChanged(token, oldPrice, newPrice);
        }

        emit UserPositionUpdated(
            msg.sender,
            token,
            tokenContract.balanceOf(msg.sender),
            block.timestamp
        );

        // Burn the tokens
        tokenContract.burn(address(this), tokenAmount);

        bool sentCreator = _safeTransferETH(info.creator, creatorRoyalty);
        bool sentTreasury = _safeTransferETH(treasury, treasuryRoyalty);
        require(sentCreator && sentTreasury, "Royalty transfer failed");

        // Send refund to user
        bool success = _safeTransferETH(msg.sender, ethRefund);
        require(success, "Refund transfer failed");

        emit TokenSold(token, msg.sender, tokenAmount, ethRefund);

        return ethRefund;
    }

    // Check if token needs to migrate and handle migration
    function _checkAndMigrate(address token) internal {
        TokenInfo storage info = tokenInfo[token];

        // Skip if already migrated or flagged for migration
        if (info.migrated || info.readyForMigration) return;

        // Check if reserve balance is at or above threshold
        if (info.reserveBalance >= MIGRATION_THRESHOLD) {
            // Flag the token for migration instead of doing it immediately
            info.readyForMigration = true;
            emit TokenReadyForMigration(token, info.reserveBalance);
        }
    }

    function migrateReadyToken(
        address token,
        uint256 gasFeePercentage
    ) external {
        require(msg.sender == migrator, "Only migrator can call");
        require(gasFeePercentage <= 5, "Fee percentage too high"); // Max 5%

        TokenInfo storage info = tokenInfo[token];

        // Check if token is ready for migration
        require(!info.migrated, "Already migrated");
        require(info.readyForMigration, "Not ready for migration");
        require(
            info.reserveBalance >= MIGRATION_THRESHOLD,
            "Insufficient reserves"
        );

        // Calculate gas fee amount
        uint256 gasFeeAmount = (info.reserveBalance * gasFeePercentage) / 100;

        // Send gas fee to migrator first
        if (gasFeeAmount > 0) {
            // Update reserves before external calls
            info.reserveBalance -= gasFeeAmount;
        }

        emit TokenMigratedByMigrator(token, migrator, gasFeeAmount);

        if (gasFeeAmount > 0) {
            bool sent = _safeTransferETH(migrator, gasFeeAmount);
            require(sent, "Gas fee transfer failed");
        }

        // Perform the actual migration with remaining reserves
        _migrateToUniswap(token);
    }

    // Returns all tokens ready for migration
    function getTokensReadyForMigration()
        external
        view
        returns (address[] memory)
    {
        // First count how many tokens are ready
        uint256 count = 0;
        for (uint256 i = 0; i < allTokens.length; i++) {
            TokenInfo storage info = tokenInfo[allTokens[i]];
            if (
                !info.migrated &&
                info.readyForMigration &&
                info.reserveBalance >= MIGRATION_THRESHOLD
            ) {
                count++;
            }
        }

        // Create array of correct size
        address[] memory readyTokens = new address[](count);

        // Fill the array
        uint256 index = 0;
        for (uint256 i = 0; i < allTokens.length && index < count; i++) {
            TokenInfo storage info = tokenInfo[allTokens[i]];
            if (
                !info.migrated &&
                info.readyForMigration &&
                info.reserveBalance >= MIGRATION_THRESHOLD
            ) {
                readyTokens[index] = allTokens[i];
                index++;
            }
        }

        return readyTokens;
    }

    function _migrateToUniswap(address token) internal {
        TokenInfo storage info = tokenInfo[token];
        HoodCoinToken tokenContract = HoodCoinToken(token);

        // Already migrated check
        require(!info.migrated, "Already migrated");

        // Check if we have enough ETH for liquidity
        require(info.reserveBalance > 0, "No reserves for migration");

        // Calculate how much ETH to use for liquidity
        uint256 ethForLiquidity = info.reserveBalance;

        // Calculate token price at migration point
        uint256 currentPrice = getCurrentTokenPrice(token);

        // Calculate tokens needed for liquidity
        uint256 tokensForLiquidity = (ethForLiquidity * 1e18) / currentPrice;

        // Make sure we have enough reserved tokens
        require(
            tokensForLiquidity <= RESERVED_TOKENS,
            "Not enough reserved tokens"
        );

        // Store creator address in local variable before state changes
        address creatorAddress = info.creator;

        info.migrated = true;
        info.reserveBalance = 0;

        emit TokenMigrated(token, 0, 0);

        // Now perform external calls
        tokenContract.mint(address(this), tokensForLiquidity);
        tokenContract.approve(UNISWAP_ROUTER, tokensForLiquidity);

        IUniswapV2Router02 router = IUniswapV2Router02(UNISWAP_ROUTER);

        (uint256 tokenAmount, uint256 ethAmount, ) = router.addLiquidityETH{
            value: ethForLiquidity
        }(
            token,
            tokensForLiquidity,
            (tokensForLiquidity * 95) / 100,
            (ethForLiquidity * 95) / 100,
            address(0),
            block.timestamp + 600
        );

        address pair = IUniswapV2Factory(router.factory()).getPair(
            token,
            router.WETH()
        );

        uint256 remainingReservedTokens = RESERVED_TOKENS - tokenAmount;

        if (remainingReservedTokens > 0) {
            uint256 creatorTokens = (remainingReservedTokens * 1) / 100;
            uint256 treasuryTokens = (remainingReservedTokens * 1) / 100;
            uint256 tokensNeverMinted = remainingReservedTokens -
                creatorTokens -
                treasuryTokens;

            // Use stored creatorAddress to avoid storage access after state changes
            tokenContract.mint(creatorAddress, creatorTokens);
            tokenContract.mint(treasury, treasuryTokens);
        }

        // Calculate remaining ETH (if any)
        uint256 remainingEth = ethForLiquidity - ethAmount;
        if (remainingEth > 0) {
            uint256 creatorEth = (remainingEth * 20) / 100;
            uint256 treasuryEth = remainingEth - creatorEth;

            // Use stored creatorAddress
            (bool sentCreator, ) = creatorAddress.call{value: creatorEth}("");
            require(sentCreator, "Creator ETH transfer failed");

            (bool sentTreasury, ) = treasury.call{value: treasuryEth}("");
            require(sentTreasury, "Treasury ETH transfer failed");
        }
    }

    function getCurrentTokenPrice(address token) public view returns (uint256) {
        TokenInfo storage info = tokenInfo[token];
        HoodCoinToken tokenContract = HoodCoinToken(token);
        uint256 currentSupply = tokenContract.totalSupply();

        return
            HoodCoinBondingMath.getCurrentPrice(
                _getStepsArray(token),
                currentSupply
            );
    }

    // Expose reserved token amount in storage
    function getReservedTokenAmount(address) external pure returns (uint256) {
        return RESERVED_TOKENS;
    }

    // Function to manually trigger migration (for testing/emergency) DO WE NEED THIS??
    function triggerMigration(address token) external onlyOwner {
        require(tokenInfo[token].tokenAddress != address(0), "Token not found");
        require(!tokenInfo[token].migrated, "Already migrated");

        _migrateToUniswap(token);
    }

    // Utility functions
    function getHoodToken(
        string calldata neighborhood
    ) external view returns (address) {
        bytes32 neighborhoodHash = keccak256(abi.encodePacked(neighborhood));
        return hoodTokens[neighborhoodHash];
    }

    function isUserVerifiedForHood(
        address user,
        string calldata neighborhood
    ) external view returns (bool) {
        VerifiedLocation memory location = verifiedLocations[user];
        return
            keccak256(abi.encodePacked(location.neighborhood)) ==
            keccak256(abi.encodePacked(neighborhood));
    }

    //Function to return list of all tokens using pagenation for scale
    function getTokens(
        uint256 startIndex,
        uint256 count
    ) external view returns (address[] memory) {
        // Ensure we don't go out of bounds
        uint256 endIndex = startIndex + count;
        if (endIndex > allTokens.length) {
            endIndex = allTokens.length;
        }

        // Create result array of appropriate size
        uint256 resultSize = endIndex - startIndex;
        address[] memory result = new address[](resultSize);

        // Fill the result array
        for (uint256 i = 0; i < resultSize; i++) {
            result[i] = allTokens[startIndex + i];
        }

        return result;
    }

    // Additional helper function to get total count
    function getTokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    /**
     * @dev Returns information about how close a token is to migration
     * @param token The token address to check
     * @return migratedAlready Whether the token has already migrated
     * @return currentReserves Current reserve balance of the token
     * @return migrationThreshold The threshold at which migration will occur
     * @return percentageToMigration Percentage to migration (0-100)
     * @return ethToMigration How much more ETH is needed to trigger migration
     */
    function getMigrationProgress(
        address token
    )
        external
        view
        returns (
            bool migratedAlready,
            uint256 currentReserves,
            uint256 migrationThreshold,
            uint256 percentageToMigration,
            uint256 ethToMigration
        )
    {
        TokenInfo storage info = tokenInfo[token];

        // Check if token exists and has been initialized
        require(info.tokenAddress != address(0), "Token not found");

        // If already migrated, return early with appropriate values
        if (info.migrated) {
            return (true, 0, MIGRATION_THRESHOLD, 100, 0);
        }

        // Calculate how much more ETH is needed to reach threshold
        uint256 ethNeeded = 0;
        if (info.reserveBalance < MIGRATION_THRESHOLD) {
            ethNeeded = MIGRATION_THRESHOLD - info.reserveBalance;
        }

        // Calculate percentage progress toward migration (0-100)
        uint256 percentage = 0;
        if (MIGRATION_THRESHOLD > 0) {
            percentage = (info.reserveBalance * 100) / MIGRATION_THRESHOLD;
            if (percentage > 100) percentage = 100; // Cap at 100%
        }

        return (
            false, // Not migrated yet
            info.reserveBalance, // Current reserves
            MIGRATION_THRESHOLD, // Migration threshold
            percentage, // Percentage complete (0-100)
            ethNeeded // ETH needed to trigger migration
        );
    }

    // Receive function to accept ETH
    receive() external payable {}
}
