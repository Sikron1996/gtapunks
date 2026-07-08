import { ethers } from "https://esm.sh/ethers@6.13.4";
import EthereumProvider from "https://esm.sh/@walletconnect/ethereum-provider@2.17.2";

// ВСТАВ ТУТ СВОЇ ДАНІ
const CONTRACT_ADDRESS = "0x7DD4901bC327b114A59E032537688a97f30FFe41";
const PROJECT_ID = "fe55ea601c3e7e0925c0b33723d6b158";

const CHAIN_ID = 4663;
const CHAIN_ID_HEX = "0x1237";
const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const EXPLORER_URL = "https://robinhoodchain.blockscout.com";
const PRICE_ETH = "0.00005";
const PRICE = ethers.parseEther(PRICE_ETH);
const MAX_SUPPLY = 10000;

const ABI = [
  "function mint(uint256 amount) external payable",
  "function PRICE() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function freeMintUsed(address user) view returns (bool)",
  "function mintOpen() view returns (bool)"
];

let provider;
let signer;
let contract;
let readProvider;
let readContract;
let account;
let wcProvider;
let amount = 1;

const $ = (id) => document.getElementById(id);

function short(address) {
  return address ? address.slice(0, 6) + "..." + address.slice(-4) : "";
}

function setStatus(text) {
  const el = $("status");
  if (el) el.textContent = text;
}

function openWalletModal() {
  $("walletModal")?.classList.remove("hidden");
}

function closeWalletModal() {
  $("walletModal")?.classList.add("hidden");
}

function getInjectedProviders() {
  if (window.ethereum?.providers?.length) return window.ethereum.providers;
  if (window.ethereum) return [window.ethereum];
  return [];
}

function pickInjectedProvider(wallet) {
  const providers = getInjectedProviders();
  if (!providers.length) return null;

  const rules = {
    any: () => true,
    metamask: (p) => p.isMetaMask && !p.isRabby,
    rabby: (p) => p.isRabby,
    trust: (p) => p.isTrust || p.isTrustWallet,
    coinbase: (p) => p.isCoinbaseWallet,
    phantom: (p) => p.isPhantom
  };

  return providers.find(rules[wallet] || rules.any) || providers[0];
}

async function switchToRobinhood(extProvider) {
  try {
    await extProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }]
    });
  } catch (err) {
    if (err?.code === 4902 || String(err?.message || "").toLowerCase().includes("unrecognized")) {
      await extProvider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: "Robinhood Chain",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: [RPC_URL],
            blockExplorerUrls: [EXPLORER_URL]
          }
        ]
      });
    } else {
      throw err;
    }
  }
}

async function finishConnection(activeProvider) {
  provider = new ethers.BrowserProvider(activeProvider);
  const accounts = await provider.send("eth_requestAccounts", []);
  account = accounts[0];
  signer = await provider.getSigner();
  contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

  $("connectBtn").textContent = short(account);
  $("mintBtn").textContent = "MINT NOW";
  setStatus("connected " + short(account));
  closeWalletModal();
  await refresh();
}

async function connectInjected(wallet = "any") {
  try {
    const extProvider = pickInjectedProvider(wallet);
    if (!extProvider) {
      setStatus("Wallet not found. Use WalletConnect or install a browser wallet.");
      return;
    }
    await switchToRobinhood(extProvider);
    await finishConnection(extProvider);
  } catch (err) {
    console.error(err);
    setStatus(err?.shortMessage || err?.message || "wallet connection failed");
  }
}

async function connectWalletConnect() {
  try {
    if (!PROJECT_ID || PROJECT_ID.includes("PASTE_")) {
      setStatus("Insert WalletConnect PROJECT_ID in app.js");
      return;
    }

    wcProvider = await EthereumProvider.init({
      projectId: PROJECT_ID,
      chains: [CHAIN_ID],
      optionalChains: [CHAIN_ID],
      showQrModal: true,
      rpcMap: {
        [CHAIN_ID]: RPC_URL
      },
      metadata: {
        name: "THE GTA PUNKS",
        description: "THE GTA PUNKS mint on Robinhood Chain",
        url: window.location.origin,
        icons: [window.location.origin + "/preview.jpeg"]
      }
    });

    await wcProvider.enable();
    await finishConnection(wcProvider);
  } catch (err) {
    console.error(err);
    setStatus(err?.shortMessage || err?.message || "WalletConnect failed");
  }
}

function updateAmount() {
  $("amount").textContent = amount;
  updatePriceText();
}

async function getPaidAmount() {
  if (!account || !contract) return amount === 1 ? 0 : amount - 1;
  try {
    const used = await contract.freeMintUsed(account);
    return used ? amount : Math.max(0, amount - 1);
  } catch {
    return amount;
  }
}

async function updatePriceText() {
  const paid = await getPaidAmount();
  $("priceText").textContent = paid === 0 ? "FREE" : `${paid} × ${PRICE_ETH} ETH`;
}

async function refresh() {
  try {
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS.includes("PASTE_")) {
      setStatus("Insert contract address in app.js");
      return;
    }

    readProvider = readProvider || new ethers.JsonRpcProvider(RPC_URL);
    readContract = readContract || new ethers.Contract(CONTRACT_ADDRESS, ABI, readProvider);

    const supply = Number(await readContract.totalSupply());
    const remaining = Math.max(0, MAX_SUPPLY - supply);
    const percent = Math.min(100, (supply / MAX_SUPPLY) * 100);

    $("minted").textContent = supply.toLocaleString("en-US");
    $("remaining").textContent = remaining.toLocaleString("en-US");
    $("supplyText").textContent = `${supply.toLocaleString("en-US")} / ${MAX_SUPPLY.toLocaleString("en-US")}`;
    $("percent").textContent = `${percent.toFixed(1)}% minted`;
    $("progressBar").style.width = `${percent}%`;

    await updatePriceText();
  } catch (err) {
    console.error(err);
  }
}

async function mint() {
  if (!account || !contract) {
    openWalletModal();
    return;
  }

  try {
    setStatus("preparing transaction...");
    const paid = await getPaidAmount();
    const value = PRICE * BigInt(paid);

    const tx = await contract.mint(amount, { value });
    setStatus("transaction sent...");
    await tx.wait();
    setStatus("mint successful");
    await refresh();
  } catch (err) {
    console.error(err);
    setStatus(err?.shortMessage || err?.reason || err?.message || "transaction failed");
  }
}

$("connectBtn").onclick = openWalletModal;
$("mintBtn").onclick = mint;
$("minusBtn").onclick = () => {
  amount = Math.max(1, amount - 1);
  updateAmount();
};
$("plusBtn").onclick = () => {
  amount = Math.min(20, amount + 1);
  updateAmount();
};
$("closeWalletModal").onclick = closeWalletModal;
$("walletModal").onclick = (event) => {
  if (event.target.id === "walletModal") closeWalletModal();
};

document.querySelectorAll("[data-wallet]").forEach((button) => {
  button.onclick = () => {
    const wallet = button.dataset.wallet;
    if (wallet === "walletconnect") return connectWalletConnect();
    return connectInjected(wallet);
  };
});

setInterval(refresh, 15000);
refresh();
