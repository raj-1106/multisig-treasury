// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Script.sol";
import "../src/MultisigWallet.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        address[] memory signers = new address[](3);
        // Using sample addresses for testnet deployment, replace as needed
        signers[0] = vm.addr(deployerPrivateKey); 
        signers[1] = 0x8Ab925FbDE4F34E433984A7Aa1a2CB3EEFA51B35;
        signers[2] = address(0x2222222222222222222222222222222222222222);

        uint256 threshold = 2;
        uint256 timelockDelay = 1 minutes; // short delay for testnet

        MultisigWallet wallet = new MultisigWallet(signers, threshold, timelockDelay);
        console.log("MultisigWallet deployed at:", address(wallet));

        vm.stopBroadcast();
    }
}
