// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Script.sol";

interface ArbGasInfo {
    function getL1BaseFeeEstimate() external view returns (uint256);
    function getL1GasPriceEstimate() external view returns (uint256);
    function getL2BaseFee() external view returns (uint256);
}

contract ExploreArbGasInfo is Script {
    // Arbitrum precompile address
    address constant ARBGASINFO = address(0x000000000000000000000000000000000000006C);

    function run() external view {
        console.log("---- ArbGasInfo Precompile Exploration ----");
        
        // This will only work on Arbitrum/Orbit chains.
        // It reads the fee parameters specific to the L1/L2 split.
        ArbGasInfo gasInfo = ArbGasInfo(ARBGASINFO);

        try gasInfo.getL1BaseFeeEstimate() returns (uint256 l1BaseFee) {
            console.log("L1 Base Fee Estimate:", l1BaseFee);
        } catch {
            console.log("Failed to read L1 Base Fee Estimate. Is this an Orbit chain?");
        }

        try gasInfo.getL2BaseFee() returns (uint256 l2BaseFee) {
            console.log("L2 Base Fee:", l2BaseFee);
        } catch {
            console.log("Failed to read L2 Base Fee.");
        }
    }
}
