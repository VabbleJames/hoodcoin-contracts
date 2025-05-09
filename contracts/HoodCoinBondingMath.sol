// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/math/Math.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

struct BondStep {
        uint128 rangeTo;  // Upper bound of this step (in tokens)
        uint128 price;    // Price per token at this step (in wei)
    }

    library HoodCoinBondingMath {
    
    function calculateMintCost(
    BondStep[] memory steps,
    uint256 currentSupply,
    uint256 tokensToMint,
    uint16 royaltyPercentage,
    uint8 tokenDecimals
) public pure returns (uint256 reserveAmount, uint256 royalty) {
    if (tokensToMint == 0) revert("Invalid token amount");
    
    uint256 newSupply = currentSupply + tokensToMint;
    uint256 maxSupply = steps[steps.length - 1].rangeTo;
    
    if (newSupply > maxSupply) revert("Exceeds maximum supply");
    
    uint256 multiFactor = 10**tokenDecimals;
    uint256 tokensLeft = tokensToMint;
    uint256 reserveToBond = 0;
    
    // Start at current step and track tokens left
    for (uint256 i = getCurrentStep(steps, currentSupply); i < steps.length; ++i) {
        BondStep memory step = steps[i];
        uint256 supplyLeft = step.rangeTo - currentSupply;

        if (supplyLeft < tokensLeft) {
            if (supplyLeft == 0) continue;

            // Use Math.ceilDiv for accurate ceiling division
            reserveToBond += Math.ceilDiv(supplyLeft * step.price, multiFactor);
            currentSupply += supplyLeft;
            tokensLeft -= supplyLeft;
        } else {
            // Use Math.ceilDiv for accurate ceiling division
            reserveToBond += Math.ceilDiv(tokensLeft * step.price, multiFactor);
            tokensLeft = 0;
            break;
        }
    }
    
    if (reserveToBond == 0 || tokensLeft > 0) revert("Invalid token amount");
    
    // Calculate royalty
    royalty = (reserveToBond * royaltyPercentage) / 10000;
    reserveAmount = reserveToBond + royalty;
    
    return (reserveAmount, royalty);

}

function calculateBurnRefund(
    BondStep[] memory steps,
    uint256 currentSupply,
    uint256 tokensToBurn,
    uint16 royaltyPercentage,
    uint8 tokenDecimals
) public pure returns (uint256 refundAmount, uint256 royalty) {
    if (tokensToBurn == 0) revert("Invalid token amount");
    if (tokensToBurn > currentSupply) revert("Exceeds total supply");
    
    uint256 multiFactor = 10**tokenDecimals;
    uint256 reserveFromBond = 0;
    uint256 tokensLeft = tokensToBurn;
    uint256 i = getCurrentStep(steps, currentSupply);
    
    while (tokensLeft > 0) {
        uint256 supplyLeft = i == 0 ? currentSupply : currentSupply - steps[i - 1].rangeTo;
        
        uint256 tokensToProcess = tokensLeft < supplyLeft ? tokensLeft : supplyLeft;
        // Use regular division for burn
        reserveFromBond += ((tokensToProcess * steps[i].price) / multiFactor);
        
        tokensLeft -= tokensToProcess;
        currentSupply -= tokensToProcess;
        
        if (i > 0) --i;
    }
    
    if (tokensLeft > 0) revert("Invalid token amount");
    
    // Calculate royalty
    royalty = (reserveFromBond * royaltyPercentage) / 10000;
    refundAmount = reserveFromBond - royalty;
    
    return (refundAmount, royalty);
}

        function getCurrentStep(BondStep[] memory steps, uint256 supply) public pure returns (uint256) {
    // Simple linear search
    for (uint256 i = 0; i < steps.length; i++) {
        if (supply <= steps[i].rangeTo) {
            return i;
        }
    }
    revert("Invalid current supply");
}

        function getCurrentPrice(BondStep[] memory steps, uint256 supply) public pure returns (uint256) {
        uint256 stepIndex = getCurrentStep(steps, supply);
        return steps[stepIndex].price;
    }
}