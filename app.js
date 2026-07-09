import { ethers } from "https://esm.sh/ethers@6.13.4";
import EthereumProvider from "https://esm.sh/@walletconnect/ethereum-provider@2.17.2";

const CONTRACT_ADDRESS = "0x6CB277736119BDD28CAC5032d6abA17A74Fbe773";
const PROJECT_ID = "fe55ea601c3e7e0925c0b33723d6b158";

const CHAIN_ID = 4663;
const CHAIN_ID_HEX = "0x1237";
const READ_RPC = "https://rpc.mainnet.chain.robinhood.com";
const EXPLORER = "https://robinhoodchain.blockscout.com";
const PRICE_ETH = "0.0000056";
const MAX_SUPPLY = 10_000_000;

const ABI = [
  "function mint(uint256 amount) external payable",
  "function PRICE_PER_TOKEN() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function remainingSupply() view returns (uint256)",
  "function paused() view returns (bool)"
];

let provider, signer, contract, readProvider, readContract, account, wcProvider;
const $ = id => document.getElementById(id);
const modal = $("walletModal");

function text(id, v){ const e=$(id); if(e) e.textContent=v; }
function status(m){ text("status", m); }
function openModal(){ modal.classList.remove("hidden"); }
function closeModal(){ modal.classList.add("hidden"); }
function fmt(n){ return Number(n).toLocaleString("en-US", {maximumFractionDigits: 4}); }
function amount(){ let v=Number($("amount").value); if(!v||v<1)v=1; if(v>100000)v=100000; $("amount").value=Math.floor(v); return Math.floor(v); }

function initRead(){
  if(!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "PASTE_CONTRACT_ADDRESS_HERE") { status("Insert contract address in app.js"); return false; }
  readProvider = new ethers.JsonRpcProvider(READ_RPC);
  readContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, readProvider);
  const link = $("explorerLink"); if(link) link.href = `${EXPLORER}/address/${CONTRACT_ADDRESS}`;
  return true;
}

async function switchToRobinhood(){
  if(!window.ethereum) throw new Error("Wallet not found");
  try{
    await window.ethereum.request({ method:"wallet_switchEthereumChain", params:[{ chainId: CHAIN_ID_HEX }] });
  }catch(e){
    if(e.code === 4902){
      await window.ethereum.request({ method:"wallet_addEthereumChain", params:[{
        chainId: CHAIN_ID_HEX,
        chainName: "Robinhood Chain",
        nativeCurrency: { name:"ETH", symbol:"ETH", decimals:18 },
        rpcUrls: [READ_RPC],
        blockExplorerUrls: [EXPLORER]
      }]});
    } else throw e;
  }
}

async function loadData(){
  try{
    if(!readContract && !initRead()) return;
    const [supplyWei, remaining, price] = await Promise.all([
      readContract.totalSupply(),
      readContract.remainingSupply().catch(async()=> MAX_SUPPLY - Number(ethers.formatUnits(await readContract.totalSupply(), 18))),
      readContract.PRICE_PER_TOKEN().catch(()=> ethers.parseEther(PRICE_ETH))
    ]);
    const sold = Number(ethers.formatUnits(supplyWei, 18));
    const rem = typeof remaining === "bigint" ? Number(remaining) : Number(remaining);
    text("soldText", fmt(sold));
    text("remainingText", fmt(rem));
    text("unitPriceText", `${ethers.formatEther(price)} ETH`);
    const pct = Math.min(100, (sold / MAX_SUPPLY) * 100);
    $("progressBar").style.width = pct + "%";
    text("percentText", pct.toFixed(2) + "% sold");
    if(account){
      const bal = await readContract.balanceOf(account);
      text("balanceText", fmt(ethers.formatUnits(bal, 18)));
    }
    await updatePrice();
  }catch(e){ status("Read error: " + (e.shortMessage || e.message)); }
}

async function setup(wp, acc){
  provider = new ethers.BrowserProvider(wp);
  signer = await provider.getSigner();
  account = acc || await signer.getAddress();
  contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  readContract = contract;
  const short = account.slice(0,6)+"..."+account.slice(-4);
  text("topConnect", short);
  text("status", "Connected");
  closeModal();
  await loadData();
}

async function connectBrowser(){
  try{
    await switchToRobinhood();
    const acc = await window.ethereum.request({method:"eth_requestAccounts"});
    await setup(window.ethereum, acc[0]);
  }catch(e){ status("Error: " + (e.shortMessage || e.message)); }
}

async function connectWC(){
  try{
    wcProvider = await EthereumProvider.init({ projectId: PROJECT_ID, chains:[CHAIN_ID], optionalChains:[CHAIN_ID], rpcMap:{[CHAIN_ID]: READ_RPC}, showQrModal:true });
    await wcProvider.connect();
    await setup(wcProvider, (wcProvider.accounts||[])[0]);
  }catch(e){ status("Error: " + (e.shortMessage || e.message)); }
}

async function getPrice(){
  try{ if(readContract) return await readContract.PRICE_PER_TOKEN(); }catch(e){}
  return ethers.parseEther(PRICE_ETH);
}

async function updatePrice(){
  try{
    const price = await getPrice();
    const total = price * BigInt(amount());
    text("totalPriceText", ethers.formatEther(total) + " ETH");
  }catch(e){ status("Price error: " + (e.shortMessage || e.message)); }
}

async function buy(){
  try{
    if(!contract){ openModal(); return; }
    const qty = amount();
    const price = await getPrice();
    const value = price * BigInt(qty);
    status("Confirm purchase...");
    const tx = await contract.mint(qty, { value });
    status("Tx: " + tx.hash);
    await tx.wait();
    status("GTAP purchased successfully");
    await loadData();
  }catch(e){ status("Error: " + (e.shortMessage || e.message)); }
}

$("topConnect").onclick = openModal;
$("connectBtn").onclick = openModal;
$("closeModalBtn").onclick = closeModal;
$("browserWalletBtn").onclick = connectBrowser;
$("walletConnectBtn").onclick = connectWC;
$("buyBtn").onclick = buy;
$("minus").onclick = async()=>{ $("amount").value = Math.max(1, amount()-1); await updatePrice(); };
$("plus").onclick = async()=>{ $("amount").value = amount()+1; await updatePrice(); };
$("amount").oninput = updatePrice;

initRead();
loadData();
updatePrice();
setInterval(loadData, 15000);
