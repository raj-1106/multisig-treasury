// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MultisigWallet is ReentrancyGuard {
    event Proposed(uint256 indexed txId, address indexed to, uint256 value, bytes data);
    event Confirmed(uint256 indexed txId, address indexed by);
    event Revoked(uint256 indexed txId, address indexed by);
    event Executed(uint256 indexed txId);

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 confirmations;
        uint256 readyAt;
    }

    mapping(address => bool) public isSigner;
    uint256 public threshold;
    uint256 public timelockDelay;

    mapping(uint256 => Transaction) public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmedBy;
    uint256 public transactionCount;

    modifier onlySigner() {
        require(isSigner[msg.sender], "not a signer");
        _;
    }

    constructor(address[] memory signers, uint256 _threshold, uint256 _timelockDelay) {
        require(signers.length >= _threshold && _threshold > 0, "bad threshold");
        for (uint256 i = 0; i < signers.length; i++) {
            require(!isSigner[signers[i]], "duplicate signer");
            isSigner[signers[i]] = true;
        }
        threshold = _threshold;
        timelockDelay = _timelockDelay;
    }

    function propose(address to, uint256 value, bytes calldata data) external onlySigner returns (uint256 txId) {
        require(to != address(0), "invalid target");
        txId = transactionCount++;
        transactions[txId] = Transaction(to, value, data, false, 0, 0);
        emit Proposed(txId, to, value, data);
    }

    function confirm(uint256 txId) external onlySigner {
        Transaction storage txn = transactions[txId];
        require(!txn.executed, "already executed");
        require(!confirmedBy[txId][msg.sender], "already confirmed");

        confirmedBy[txId][msg.sender] = true;
        txn.confirmations += 1;

        if (txn.confirmations == threshold && txn.readyAt == 0) {
            txn.readyAt = block.timestamp + timelockDelay;
        }

        emit Confirmed(txId, msg.sender);
    }

    function revoke(uint256 txId) external onlySigner {
        Transaction storage txn = transactions[txId];
        require(!txn.executed, "already executed");
        require(confirmedBy[txId][msg.sender], "not confirmed");

        confirmedBy[txId][msg.sender] = false;
        txn.confirmations -= 1;
        
        // readyAt is intentionally NOT reset here.
        // Once the timelock clock starts, only execution or explicit
        // cancellation should stop it. execute() still requires
        // confirmations >= threshold, so dropping below threshold
        // correctly blocks execution without letting anyone rewind the clock.

        emit Revoked(txId, msg.sender);
    }

    function execute(uint256 txId) external nonReentrant {
        Transaction storage txn = transactions[txId];
        require(!txn.executed, "already executed");
        require(txn.confirmations >= threshold, "not enough confirmations");
        require(txn.readyAt != 0 && block.timestamp >= txn.readyAt, "timelock not passed");

        txn.executed = true; // effects before interaction

        (bool success, ) = txn.to.call{value: txn.value}(txn.data);
        require(success, "call failed");

        emit Executed(txId);
    }

    receive() external payable {}
}
