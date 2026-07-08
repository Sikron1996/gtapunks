import { ethers } from "https://esm.sh/ethers@6.13.4";
import EthereumProvider from "https://esm.sh/@walletconnect/ethereum-provider@2.17.2";

const CONTRACT_ADDRESS = "0x7DD4901bC327b114A59E032537688a97f30FFe41";
const PROJECT_ID = "fe55ea601c3e7e0925c0b33723d6b158";

const CHAIN_ID = 4663;
const CHAIN_ID_HEX = "0x1237";
const READ_RPC = "https://rpc.mainnet.chain.robinhood.com";
const EXPLORER = "https://robinhoodchain.blockscout.com";
const PRICE_ETH = "0.00005";

const ABI = [
  "function mint(uint256 amount) external payable",
  "function PRICE() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function freeMintUsed(address user) view returns (bool)"
];

let provider, signer, contract, readProvider, readContract, account, wcProvider;

const $ = id => document.getElementById(id);
const modal = $("walletModal");

function text(id, v) {
  const e = $(id);
  if (e) e.textContent = v;
}

function status(m) {
  text("status", m);
}

function openModal() {
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
}

function amount() {
  let v = Number($("amount").value);
  if (!v || v < 1) v = 1;
  if (v > 100) v = 100;
  $("amount").value = v;
  return v;
}

function initRead() {
  if (CONTRACT_ADDRESS === "PASTE_CONTRACT_ADDRESS_HERE") {
    status("Insert contract address in app.js");
    return false;
  }

  readProvider = new ethers.JsonRpcProvider(READ_RPC);
  readContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, readProvider);

  const link = $("etherscanLink");
  if (link) link.href = `${EXPLORER}/address/${CONTRACT_ADDRESS}`;

  return true;
}

async function switchToRobinhood() {
  if (!window.ethereum) throw new Error("Wallet not found");

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }]
    });
  } catch (switchError) {
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CHAIN_ID_HEX,
          chainName: "Robinhood Chain",
          nativeCurrency: {
            name: "ETH",
            symbol: "ETH",
            decimals: 18
          },
          rpcUrls: [READ_RPC],
          blockExplorerUrls: [EXPLORER]
        }]
      });
    } else {
      throw switchError;
    }
  }
}

async function loadSupply() {
  try {
    if (!readContract && !initRead()) return;

    const supply = Number(await readContract.totalSupply());
    text("mintedText", supply.toLocaleString());

    await updatePrice();
  } catch (e) {
    status("Read error: " + (e.shortMessage || e.message));
  }
}

async function setup(wp, acc) {
  if (CONTRACT_ADDRESS === "PASTE_CONTRACT_ADDRESS_HERE") {
    throw new Error("Insert contract address in app.js");
  }

  provider = new ethers.BrowserProvider(wp);
  signer = await provider.getSigner();
  account = acc || await signer.getAddress();

  contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  readContract = contract;

  const short = account.slice(0, 6) + "..." + account.slice(-4);

  text("wallet", short);
  text("topConnect", short);

  $("connectBtn").style.display = "none";
  $("mintBtn").style.display = "block";

  closeModal();
  await loadSupply();
}

async function connectBrowser() {
  try {
    if (!window.ethereum) throw new Error("Wallet not found");

    await switchToRobinhood();

    const acc = await window.ethereum.request({
      method: "eth_requestAccounts"
    });

    await setup(window.ethereum, acc[0]);
  } catch (e) {
    status("Error: " + (e.shortMessage || e.message));
  }
}

async function connectWC() {
  try {
    wcProvider = await EthereumProvider.init({
      projectId: PROJECT_ID,
      chains: [CHAIN_ID],
      optionalChains: [CHAIN_ID],
      rpcMap: {
        [CHAIN_ID]: READ_RPC
      },
      showQrModal: true
    });

    await wcProvider.connect();

    await setup(wcProvider, (wcProvider.accounts || [])[0]);
  } catch (e) {
    status("Error: " + (e.shortMessage || e.message));
  }
}

async function getPrice() {
  if (contract) {
    try {
      return await contract.PRICE();
    } catch (e) {}
  }

  return ethers.parseEther(PRICE_ETH);
}

async function getPaidAmount() {
  const q = BigInt(amount());

  if (!contract || !account) {
    return q > 0n ? q - 1n : 0n;
  }

  const used = await contract.freeMintUsed(account);

  return used ? q : (q > 0n ? q - 1n : 0n);
}

async function updatePrice() {
  try {
    const price = await getPrice();
    const paid = await getPaidAmount();
    const total = price * paid;

    text("priceText", total === 0n ? "FREE" : ethers.formatEther(total) + " ETH");
  } catch (e) {
    status("Price error: " + (e.shortMessage || e.message));
  }
}

async function mint() {
  try {
    if (!contract) {
      openModal();
      return;
    }

    const qty = BigInt(amount());
    const price = await getPrice();
    const paid = await getPaidAmount();

    status("Confirm mint...");

    const tx = await contract.mint(Number(qty), {
      value: price * paid
    });

    status("Tx: " + tx.hash);

    await tx.wait();

    status("Mint success");
    await loadSupply();
  } catch (e) {
    status("Error: " + (e.shortMessage || e.message));
  }
}

$("topConnect").onclick = openModal;
$("connectBtn").onclick = openModal;
$("closeModalBtn").onclick = closeModal;
$("browserWalletBtn").onclick = connectBrowser;
$("walletConnectBtn").onclick = connectWC;
$("mintBtn").onclick = mint;

$("minus").onclick = async () => {
  $("amount").value = Math.max(1, amount() - 1);
  await updatePrice();
};

$("plus").onclick = async () => {
  $("amount").value = Math.min(100, amount() + 1);
  await updatePrice();
};

$("amount").oninput = updatePrice;

let idx = 0;

setInterval(() => {
  const imgs = window.DEGODS_IMAGES || [];
  if (!imgs.length) return;

  idx = (idx + 1) % imgs.length;

  const preview = $("preview");
  if (preview) preview.src = imgs[idx];
}, 2600);

initRead();
loadSupply();
updatePrice();
