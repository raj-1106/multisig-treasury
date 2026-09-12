import { BrowserProvider, Contract, ethers } from 'ethers';

// ABI with only the functions we need for the MVP
const MultisigWalletABI = [
  "event Proposed(uint256 indexed txId, address indexed to, uint256 value, bytes data)",
  "event Confirmed(uint256 indexed txId, address indexed by)",
  "event Revoked(uint256 indexed txId, address indexed by)",
  "event Executed(uint256 indexed txId)",
  "function propose(address to, uint256 value, bytes calldata data) external returns (uint256 txId)",
  "function confirm(uint256 txId) external",
  "function revoke(uint256 txId) external",
  "function execute(uint256 txId) external",
  "function transactions(uint256) external view returns (address to, uint256 value, bytes data, bool executed, uint256 confirmations, uint256 readyAt)",
  "function transactionCount() external view returns (uint256)",
  "function threshold() external view returns (uint256)",
  "function timelockDelay() external view returns (uint256)",
  "function isSigner(address) external view returns (bool)",
  "function confirmedBy(uint256, address) external view returns (bool)"
];

export async function getProvider() {
  if (typeof window.ethereum !== 'undefined') {
    return new BrowserProvider(window.ethereum);
  }
  throw new Error("No Web3 provider found. Please install MetaMask.");
}

export async function getContract(address: string, provider: BrowserProvider) {
  const signer = await provider.getSigner();
  return new Contract(address, MultisigWalletABI, signer);
}
