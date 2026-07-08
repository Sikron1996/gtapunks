const CONTRACT_ADDRESS = "0x7DD4901bC327b114A59E032537688a97f30FFe41";
const CHAIN_ID_HEX = "0x1237"; // 4663
const MAX_SUPPLY = 10000;
const PRICE = ethers.parseEther("0.00005");

const ABI = [
  "function mint(uint256 amount) payable",
  "function totalSupply() view returns (uint256)",
  "function freeMintUsed(address) view returns (bool)",
  "function mintOpen() view returns (bool)",
  "function PRICE() view returns (uint256)"
];

let provider, signer, contract, account;
let amount = 1;

const $ = (id) => document.getElementById(id);

async function switchToRobinhood() {
  await window.ethereum.request({
    method: "wallet_addEthereumChain",
    params: [{
      chainId: CHAIN_ID_HEX,
      chainName: "Robinhood Chain",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
      blockExplorerUrls: ["https://robinhoodchain.blockscout.com"]
    }]
  });
}

async function connect() {
  if (!window.ethereum) return setStatus("Install MetaMask / wallet extension");
  await switchToRobinhood();
  provider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  account = accounts[0];
  signer = await provider.getSigner();
  contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  $("connectBtn").textContent = short(account);
  $("mintBtn").textContent = "MINT NOW";
  setStatus("connected " + short(account));
  await refresh();
}

function short(a){return a.slice(0,6)+"..."+a.slice(-4)}
function setStatus(t){$("status").textContent=t}
function updateAmount(){
  $("amount").textContent = amount;
  updatePriceText();
}

async function updatePriceText(){
  if (!account || !contract) {
    $("priceText").textContent = amount === 1 ? "FREE" : `${amount-1} × 0.00005 ETH`;
    return;
  }
  const used = await contract.freeMintUsed(account);
  const paid = used ? amount : Math.max(0, amount - 1);
  $("priceText").textContent = paid === 0 ? "FREE" : `${paid} × 0.00005 ETH`;
}

async function refresh(){
  if (!contract) return;
  try {
    const supply = Number(await contract.totalSupply());
    $("minted").textContent = supply.toLocaleString("en-US");
    $("remaining").textContent = (MAX_SUPPLY - supply).toLocaleString("en-US");
    $("supplyText").textContent = `${supply.toLocaleString("en-US")} / 10,000`;
    const pct = Math.min(100, (supply / MAX_SUPPLY) * 100);
    $("percent").textContent = `${pct.toFixed(1)}% minted`;
    $("progressBar").style.width = `${pct}%`;
    await updatePriceText();
  } catch(e) { console.log(e); }
}

async function mint(){
  if (!account) return connect();
  try {
    setStatus("preparing transaction...");
    const used = await contract.freeMintUsed(account);
    const paid = used ? amount : Math.max(0, amount - 1);
    const value = PRICE * BigInt(paid);
    const tx = await contract.mint(amount, { value });
    setStatus("transaction sent...");
    await tx.wait();
    setStatus("mint successful");
    await refresh();
  } catch(e) {
    setStatus(e?.shortMessage || e?.reason || "transaction failed");
  }
}

$("connectBtn").onclick = connect;
$("mintBtn").onclick = mint;
$("minusBtn").onclick = () => { amount = Math.max(1, amount-1); updateAmount(); };
$("plusBtn").onclick = () => { amount = Math.min(20, amount+1); updateAmount(); };

refresh();
