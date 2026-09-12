# Multisig Timelock

![solidity](https://img.shields.io/badge/solidity-0.8.26-363636)
![built with](https://img.shields.io/badge/built%20with-Foundry-black)
![tests](https://img.shields.io/github/actions/workflow/status/raj-1106/multisig-treasury/test.yml?label=tests)
![license](https://img.shields.io/badge/license-MIT-green)

An N-of-M multisig wallet with a mandatory execution delay, built in Solidity with Foundry, plus a minimal ethers.js dashboard for propose / confirm / revoke / execute.

This is a portfolio project, not a production treasury tool. It exists to demonstrate multi-party authorization design and delayed execution as a distinct pattern from this author's other repos (`dex-evm`, `erc4626-inflation-attack`, `dead-reckoning`), which cover DEX mechanics, an ERC-4626 first-depositor exploit, and Mantle L2 work respectively. This repo's focus is treasury/ops tooling: how a group of signers safely authorizes and delays arbitrary on-chain calls.

## How it works

Four actions, each a separate function rather than one combined "vote" call, prioritizing readability over gas savings for a portfolio piece:

1. **Propose** — any registered signer submits `(to, value, data)`. Stored with zero confirmations.
2. **Confirm** — a signer confirms exactly once per transaction. When confirmations first reach the threshold, `readyAt = block.timestamp + timelockDelay` is set. It is set once, not recalculated on later confirmations.
3. **Revoke** — a signer withdraws their own confirmation before execution. Confirmations drop, but `readyAt`, once set, is never reset or rewound. This is intentional: allowing a revoke-then-reconfirm cycle to push the clock forward would let a single signer who already agreed delay execution indefinitely, defeating the point of a timelock.
4. **Execute** — anyone can call it once `block.timestamp >= readyAt` and confirmations are still at or above threshold. State is marked executed before the external call (checks-effects-interactions).

```
propose ──> confirm (×threshold) ──> readyAt locked ──> wait ──> execute
               │
               └─ revoke (drops confirmations, readyAt stays fixed)
```

## Threat model

Documented here deliberately, not left implicit, since this handles arbitrary calldata execution and value transfer.

- **Reentrancy through the executed call.** `to` and `data` are attacker-reachable if a signer is tricked into proposing something malicious. Mitigated with checks-effects-interactions (`executed = true` set before the external call) plus OpenZeppelin's `ReentrancyGuard` as defense in depth.
- **Double confirmation.** A signer confirming twice would let one person single-handedly meet threshold. Blocked by tracking `confirmedBy[txId][signer]`.
- **`readyAt` reset via revoke/reconfirm.** The most fragile logic in the contract. Once threshold is first met, `readyAt` is fixed for the life of the transaction; revoking drops the confirmation count but does not clear the timestamp. Covered by a dedicated test (`test_FailureCase_RevokeReconfirmCannotExtendTimelock`).
- **No signer-set changes.** A compromised or lost signer key cannot be removed, and no new signer can be added post-deployment. This is an intentional MVP scope cut, not an oversight, and is called out here so it reads as a known limitation rather than a missed one.
- **Front-running of proposals.** Proposals are visible in the mempool before execution. Low risk here since execution still requires signer confirmations, but worth noting if a proposed call includes something like an `approve` whose mere visibility could matter.
- **Revoke griefing.** A signer can propose, get confirmed, then revoke immediately before execution, repeatedly. This is an availability annoyance, not a fund-safety issue, since it can't move `readyAt` backward or forward. Documented here so it reads as a considered tradeoff, not a gap.

## Repository structure

```
multisig-timelock/
  src/
    MultisigWallet.sol
  test/
    MultisigWallet.t.sol
  script/
    Deploy.s.sol
  frontend/
    index.html
    src/
      lib/ethers.ts
      lib/encodeTx.ts
  foundry.toml
  README.md
```

## Getting started

```bash
# install dependencies
forge install foundry-rs/forge-std@v1.9.3 --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-git

# compile
forge build

# run tests (verbose, shows revert reasons on failure)
forge test -vvv

# check branch coverage, especially the readyAt logic
forge coverage
```

Six tests cover the main path, the threshold boundary, and four failure cases (double confirm, non-signer propose, execute-before-timelock, and the revoke/reconfirm timelock-extension attempt). All six must pass before any deployment.

## Local dry run

Always run against a local chain before spending testnet gas:

```bash
anvil
```

In a second terminal, using one of the funded accounts Anvil prints on startup:

```bash
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast --private-key <anvil-printed-key>
```

## Testnet deployment

Set up `.env` (gitignored, never commit this):

```bash
PRIVATE_KEY=0x...                 # testnet-only key
SEPOLIA_RPC_URL=...
ROBINHOOD_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com
ETHERSCAN_API_KEY=...
```

**Sepolia** (primary, the testnet reviewers recognize):

```bash
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --private-key $PRIVATE_KEY \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

**Robinhood Chain testnet** (secondary, an Arbitrum Orbit L2, explored for its EVM compatibility rather than anything this contract specifically exercises):

```bash
forge script script/Deploy.s.sol \
  --rpc-url $ROBINHOOD_TESTNET_RPC_URL \
  --chain-id 46630 \
  --broadcast \
  --private-key $PRIVATE_KEY
```

### Deployed addresses

| Network | Address | Explorer |
|---|---|---|
| Sepolia | `TBD` | — |
| Robinhood Chain Testnet | `TBD` | — |

## Frontend

Plain ethers.js dashboard, no framework. Visual direction is "vault steel": cool graphite background, brass accent for pending state, sage for confirmed/executed, monospace for every address and numeric value so hashes and amounts can actually be compared at a glance. Not a themed skin, the monospace choice specifically is functional: this is a tool where reading a hex string correctly matters.

## Known limitations

- No signer-set management (add/remove signer) after deployment.
- No cancel/veto path for a proposal beyond individual signer revocation.
- Dashboard has no wallet-connect flow beyond a basic provider/signer setup; it assumes the connected account is already a registered signer.

## License

MIT