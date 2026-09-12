import './style.css';
import { getProvider, getContract } from './lib/ethers';
import { Contract, BrowserProvider, ethers } from 'ethers';

let provider: BrowserProvider;
let contract: Contract;
let userAddress: string;

const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
const loadContractBtn = document.getElementById('loadContractBtn') as HTMLButtonElement;
const contractAddressInput = document.getElementById('contractAddress') as HTMLInputElement;

const statThreshold = document.getElementById('statThreshold') as HTMLSpanElement;
const statDelay = document.getElementById('statDelay') as HTMLSpanElement;
const statTxCount = document.getElementById('statTxCount') as HTMLSpanElement;
const contractStats = document.getElementById('ledgerStrip') as HTMLDivElement;

const proposeForm = document.getElementById('proposeForm') as HTMLFormElement;
const propTo = document.getElementById('propTo') as HTMLInputElement;
const propValue = document.getElementById('propValue') as HTMLInputElement;
const propData = document.getElementById('propData') as HTMLInputElement;
const proposeBtn = document.getElementById('proposeBtn') as HTMLButtonElement;

const txList = document.getElementById('txList') as HTMLDivElement;

async function init() {
  if (window.ethereum) {
    try {
      provider = await getProvider();
      const accounts = await provider.listAccounts();
      if (accounts.length > 0) {
        userAddress = accounts[0].address;
        connectBtn.textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
      }
      
      window.ethereum.on('accountsChanged', () => {
        window.location.reload();
      });
    } catch (e) {
      console.error(e);
    }
  }
}

connectBtn.addEventListener('click', async () => {
  try {
    provider = await getProvider();
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    userAddress = await signer.getAddress();
    connectBtn.textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
  } catch (err: any) {
    alert("Failed to connect: " + err.message);
  }
});

loadContractBtn.addEventListener('click', async () => {
  const address = contractAddressInput.value.trim();
  if (!ethers.isAddress(address)) {
    alert("Invalid contract address");
    return;
  }
  if (!provider) {
    alert("Please connect wallet first");
    return;
  }

  try {
    if (contract) {
      contract.removeAllListeners();
    }
    contract = await getContract(address, provider);
    await refreshStats();
    await refreshTransactions();
    contractStats.classList.remove('hidden');
    proposeBtn.disabled = false;
    
    // Listen for events
    contract.on("Proposed", () => refreshTransactions());
    contract.on("Confirmed", () => refreshTransactions());
    contract.on("Revoked", () => refreshTransactions());
    contract.on("Executed", () => refreshTransactions());
  } catch (err: any) {
    alert("Failed to load contract. Check address and network.");
    console.error(err);
  }
});

async function refreshStats() {
  const threshold = await contract.threshold();
  const delay = await contract.timelockDelay();
  const txCount = await contract.transactionCount();
  
  statThreshold.textContent = threshold.toString();
  statDelay.textContent = `${Number(delay) / 60} min`;
  statTxCount.textContent = txCount.toString();
}

async function refreshTransactions() {
  const txCount = await contract.transactionCount();
  const threshold = await contract.threshold();

  if (txCount === 0n) {
    txList.innerHTML = '<div class="empty-state">No transactions yet.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (let i = 0n; i < txCount; i++) {
    const tx = await contract.transactions(i);
    const hasConfirmed = userAddress ? await contract.confirmedBy(i, userAddress) : false;
    fragment.appendChild(createTxElement(i, tx, threshold, hasConfirmed));
  }
  
  txList.innerHTML = '';
  txList.appendChild(fragment);
}

function createTxElement(id: bigint, tx: any, threshold: bigint, hasConfirmed: boolean) {
  const div = document.createElement('div');
  div.className = 'tx-item';

  const isExecuted = tx.executed;
  const confirmations = tx.confirmations;
  const readyAt = tx.readyAt;
  
  let statusBadge = '';
  let statusClass = '';
  
  if (isExecuted) {
    statusBadge = 'Executed';
    statusClass = 'executed';
  } else if (readyAt > 0n && BigInt(Math.floor(Date.now() / 1000)) >= readyAt && confirmations >= threshold) {
    statusBadge = 'Ready to Execute';
    statusClass = 'ready';
  } else if (confirmations >= threshold) {
    const d = new Date(Number(readyAt) * 1000);
    statusBadge = `Timelocked until ${d.toLocaleTimeString()}`;
    statusClass = 'pending';
  } else {
    statusBadge = 'Pending Approvals';
    statusClass = 'pending';
  }

  let dotsHtml = '';
  for (let c = 0n; c < threshold; c++) {
    const isFilled = c < confirmations;
    const dotClass = isFilled ? 'confirmation-dot' : 'confirmation-dot pending';
    dotsHtml += `<div class="${dotClass}"></div>`;
  }

  div.innerHTML = `
    <div class="tx-header">
      <div class="tx-id">Tx #${id} <span class="badge ${statusClass}">${statusBadge}</span></div>
      <div class="conf-dots">${dotsHtml}</div>
    </div>
    <div class="tx-details">
      <div class="tx-label">target</div>
      <div class="tx-value monospace">${tx.to}</div>
      <div class="tx-label">value (wei)</div>
      <div class="tx-value monospace">${tx.value}</div>
    </div>
    <div class="tx-actions" id="actions-${id}">
      <!-- Buttons injected dynamically -->
    </div>
  `;

  const actionsDiv = div.querySelector(`#actions-${id}`) as HTMLDivElement;
  
  if (!isExecuted) {
    if (!hasConfirmed) {
      const btnConfirm = document.createElement('button');
      btnConfirm.className = 'btn-primary';
      btnConfirm.textContent = 'Confirm';
      btnConfirm.onclick = () => handleConfirm(id);
      actionsDiv.appendChild(btnConfirm);
    } else {
      const btnRevoke = document.createElement('button');
      btnRevoke.className = 'btn-danger';
      btnRevoke.textContent = 'Revoke';
      btnRevoke.onclick = () => handleRevoke(id);
      actionsDiv.appendChild(btnRevoke);
    }

    if (readyAt > 0n && BigInt(Math.floor(Date.now() / 1000)) >= readyAt && confirmations >= threshold) {
      const btnExecute = document.createElement('button');
      btnExecute.className = 'btn-primary';
      btnExecute.textContent = 'Execute';
      btnExecute.onclick = () => handleExecute(id);
      actionsDiv.appendChild(btnExecute);
    }
  }

  return div;
}

proposeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!contract) return;
  try {
    const to = propTo.value;
    const value = propValue.value;
    const data = propData.value || "0x";
    
    const tx = await contract.propose(to, value, data);
    await tx.wait();
    proposeForm.reset();
    await refreshStats();
  } catch (err: any) {
    alert("Error proposing: " + err.message);
  }
});

async function handleConfirm(id: bigint) {
  try {
    const tx = await contract.confirm(id);
    await tx.wait();
  } catch (err: any) {
    alert("Error confirming: " + err.message);
  }
}

async function handleRevoke(id: bigint) {
  try {
    const tx = await contract.revoke(id);
    await tx.wait();
  } catch (err: any) {
    alert("Error revoking: " + err.message);
  }
}

async function handleExecute(id: bigint) {
  try {
    const tx = await contract.execute(id);
    await tx.wait();
  } catch (err: any) {
    alert("Error executing: " + err.message);
  }
}

init();
