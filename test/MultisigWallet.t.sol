// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import "../src/MultisigWallet.sol";

contract MultisigWalletTest is Test {
    MultisigWallet wallet;
    address signer1 = address(0x1);
    address signer2 = address(0x2);
    address signer3 = address(0x3);
    address nonSigner = address(0x4);
    address target = address(0x5);

    function setUp() public {
        address[] memory signers = new address[](3);
        signers[0] = signer1;
        signers[1] = signer2;
        signers[2] = signer3;
        wallet = new MultisigWallet(signers, 2, 1 days);
        vm.deal(address(wallet), 10 ether);
    }

    // MAIN CASE: propose, confirm to threshold, wait timelock, execute succeeds
    function test_MainCase_ExecuteAfterTimelock() public {
        vm.prank(signer1);
        uint256 txId = wallet.propose(target, 1 ether, "");

        vm.prank(signer1);
        wallet.confirm(txId);
        vm.prank(signer2);
        wallet.confirm(txId);

        vm.warp(block.timestamp + 1 days + 1);
        wallet.execute(txId);

        (, , , bool executed, , ) = wallet.transactions(txId);
        assertTrue(executed);
        assertEq(target.balance, 1 ether);
    }

    // EDGE CASE: exactly at threshold triggers readyAt; one below does not
    function test_EdgeCase_ThresholdBoundary() public {
        vm.prank(signer1);
        uint256 txId = wallet.propose(target, 1 ether, "");

        vm.prank(signer1);
        wallet.confirm(txId);
        (, , , , uint256 confirmations, uint256 readyAt) = wallet.transactions(txId);
        assertEq(confirmations, 1);
        assertEq(readyAt, 0); // below threshold, no timelock started

        vm.prank(signer2);
        wallet.confirm(txId);
        (, , , , , readyAt) = wallet.transactions(txId);
        assertGt(readyAt, 0); // threshold hit, timelock now set
    }

    // FAILURE CASE: double confirmation by same signer reverts
    function test_FailureCase_DoubleConfirmReverts() public {
        vm.prank(signer1);
        uint256 txId = wallet.propose(target, 1 ether, "");

        vm.prank(signer1);
        wallet.confirm(txId);

        vm.prank(signer1);
        vm.expectRevert("already confirmed");
        wallet.confirm(txId);
    }

    // FAILURE CASE: non-signer cannot propose
    function test_FailureCase_NonSignerCannotPropose() public {
        vm.prank(nonSigner);
        vm.expectRevert("not a signer");
        wallet.propose(target, 1 ether, "");
    }

    // FAILURE CASE: execute before timelock passes reverts
    function test_FailureCase_ExecuteBeforeTimelockReverts() public {
        vm.prank(signer1);
        uint256 txId = wallet.propose(target, 1 ether, "");
        vm.prank(signer1);
        wallet.confirm(txId);
        vm.prank(signer2);
        wallet.confirm(txId);

        vm.expectRevert("timelock not passed");
        wallet.execute(txId);
    }

    // FAILURE CASE: revoke drops below threshold, preventing execution, but does not extend timelock upon reconfirm
    function test_FailureCase_RevokeReconfirmCannotExtendTimelock() public {
        vm.prank(signer1);
        uint256 txId = wallet.propose(target, 1 ether, "");
        vm.prank(signer1);
        wallet.confirm(txId);
        vm.prank(signer2);
        wallet.confirm(txId);

        (, , , , , uint256 originalReadyAt) = wallet.transactions(txId);

        vm.warp(block.timestamp + 12 hours); // halfway through delay
        
        vm.prank(signer2);
        wallet.revoke(txId);
        
        vm.expectRevert("not enough confirmations");
        wallet.execute(txId); // Execution should fail because we're below threshold
        
        vm.prank(signer2);
        wallet.confirm(txId);

        (, , , , , uint256 readyAtAfter) = wallet.transactions(txId);
        assertEq(readyAtAfter, originalReadyAt, "readyAt must not move on revoke/reconfirm");
    }
}
