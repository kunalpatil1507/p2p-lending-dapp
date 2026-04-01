// ─── CONFIG ──────────────────────────────────────────────────────────────────
// After deploying on Remix + Sepolia, paste your contract address here:
const CONTRACT_ADDRESS = "0x7C2399e2F8E3B7A6E37Da584E5D9b011FC0b0C00";

const ABI = [
  "function loanCounter() view returns (uint)",
  "function requestLoan(uint amount, uint duration, uint interestRate)",
  "function fundLoan(uint loanId) payable",
  "function repayLoan(uint loanId) payable",
  "function getLoan(uint loanId) view returns (address borrower, address lender, uint principal, uint interestRate, uint duration, uint totalRepayAmount, bool funded, bool repaid)",
  "event LoanRequested(uint indexed loanId, address indexed borrower, uint principal, uint interestRate, uint duration)",
  "event LoanFunded(uint indexed loanId, address indexed lender, uint amount)",
  "event LoanRepaid(uint indexed loanId, address indexed borrower, uint amount)"
];

// ─── STATE ───────────────────────────────────────────────────────────────────
let provider, signer, contract, connectedAddress;

// ─── DOM REFS ────────────────────────────────────────────────────────────────
const connectBtn       = document.getElementById("connectBtn");
const walletInfo       = document.getElementById("walletInfo");
const walletAddress    = document.getElementById("walletAddress");
const networkBadge     = document.getElementById("networkBadge");
const loanGrid         = document.getElementById("loanGrid");
const emptyState       = document.getElementById("emptyState");
const toastContainer   = document.getElementById("toastContainer");
const refreshBtn       = document.getElementById("refreshBtn");
const loanCountEl      = document.getElementById("loanCount");

// Form inputs
const loanAmountInput  = document.getElementById("loanAmount");
const durationInput    = document.getElementById("duration");
const interestInput    = document.getElementById("interestRate");
const previewSection   = document.getElementById("previewSection");
const previewPrincipal = document.getElementById("previewPrincipal");
const previewInterest  = document.getElementById("previewInterest");
const previewTotal     = document.getElementById("previewTotal");
const requestBtn       = document.getElementById("requestLoanBtn");

// ─── TOAST ───────────────────────────────────────────────────────────────────
function toast(message, type = "info", duration = 5000) {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  const icons = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };
  t.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${message}</span>`;
  toastContainer.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, duration);
}

// ─── CONNECT WALLET ──────────────────────────────────────────────────────────
async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    toast("MetaMask not detected. Please install it from metamask.io", "error", 8000);
    return;
  }
  try {
    connectBtn.disabled = true;
    connectBtn.innerHTML = `<span class="btn-spinner"></span> Connecting…`;

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    connectedAddress = await signer.getAddress();

    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    // Update UI
    walletAddress.textContent = shortAddr(connectedAddress);
    walletAddress.title = connectedAddress;

    if (chainId === 11155111) {
      networkBadge.textContent = "Sepolia";
      networkBadge.className = "network-badge network-ok";
    } else {
      networkBadge.textContent = `Chain ${chainId} – Switch to Sepolia`;
      networkBadge.className = "network-badge network-warn";
      toast("Please switch MetaMask to the Sepolia testnet", "warning", 8000);
    }

    walletInfo.classList.add("visible");
    connectBtn.innerHTML = "Connected";
    connectBtn.classList.add("connected");

    // Init contract
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    await loadLoans();

    // Listen for account changes
    window.ethereum.on("accountsChanged", () => location.reload());
    window.ethereum.on("chainChanged", () => location.reload());

  } catch (err) {
    console.error(err);
    toast(err.message || "Connection failed", "error");
    connectBtn.disabled = false;
    connectBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg> Connect Wallet`;
  }
}

// ─── LOAD LOANS ──────────────────────────────────────────────────────────────
async function loadLoans() {
  if (!contract) return;

  loanGrid.innerHTML = `<div class="loading-loans"><div class="spinner-large"></div><p>Fetching loans from chain…</p></div>`;
  emptyState.style.display = "none";

  try {
    const count = Number(await contract.loanCounter());
    loanCountEl.textContent = count;

    if (count === 0) {
      loanGrid.innerHTML = "";
      emptyState.style.display = "block";
      return;
    }

    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(contract.getLoan(i).then(l => ({ id: i, ...l })));
    }

    const rawLoans = await Promise.all(promises);
    loanGrid.innerHTML = "";
    rawLoans.reverse().forEach(loan => loanGrid.appendChild(buildLoanCard(loan)));

  } catch (err) {
    console.error(err);
    toast("Failed to load loans: " + (err.reason || err.message), "error");
    loanGrid.innerHTML = "";
    emptyState.style.display = "block";
  }
}

// ─── BUILD LOAN CARD ─────────────────────────────────────────────────────────
function buildLoanCard(loan) {
  const isBorrower = connectedAddress?.toLowerCase() === loan.borrower.toLowerCase();
  const isLender   = connectedAddress?.toLowerCase() === loan.lender?.toLowerCase();

  const status = loan.repaid ? "repaid" : loan.funded ? "funded" : "pending";
  const statusLabels = { pending: "Pending", funded: "Active", repaid: "Repaid" };
  const statusIcons  = { pending: "◌", funded: "◉", repaid: "✔" };

  const principal = ethers.formatEther(loan.principal);
  const total     = ethers.formatEther(loan.totalRepayAmount);
  const interest  = (Number(total) - Number(principal)).toFixed(6);

  const card = document.createElement("div");
  card.className = `loan-card status-${status}`;
  card.dataset.loanId = loan.id;

  card.innerHTML = `
    <div class="card-header">
      <div class="loan-id-badge">#${loan.id}</div>
      <div class="status-pill status-${status}">
        <span>${statusIcons[status]}</span> ${statusLabels[status]}
      </div>
    </div>

    <div class="card-body">
      <div class="address-row">
        <div class="addr-block">
          <label>Borrower</label>
          <span class="addr ${isBorrower ? "you" : ""}" title="${loan.borrower}">
            ${shortAddr(loan.borrower)} ${isBorrower ? "<em>(you)</em>" : ""}
          </span>
        </div>
        ${loan.lender !== "0x0000000000000000000000000000000000000000" ? `
        <div class="addr-block">
          <label>Lender</label>
          <span class="addr ${isLender ? "you" : ""}" title="${loan.lender}">
            ${shortAddr(loan.lender)} ${isLender ? "<em>(you)</em>" : ""}
          </span>
        </div>` : ""}
      </div>

      <div class="metrics">
        <div class="metric">
          <span class="metric-val">${Number(principal).toFixed(4)}</span>
          <span class="metric-lbl">ETH Principal</span>
        </div>
        <div class="metric accent">
          <span class="metric-val">${loan.interestRate}%</span>
          <span class="metric-lbl">Interest</span>
        </div>
        <div class="metric">
          <span class="metric-val">${Number(total).toFixed(4)}</span>
          <span class="metric-lbl">ETH Total</span>
        </div>
        <div class="metric">
          <span class="metric-val">${loan.duration}</span>
          <span class="metric-lbl">Days</span>
        </div>
      </div>

      <div class="interest-bar-wrap">
        <div class="interest-bar-label">
          <span>Principal</span><span>+${Number(interest).toFixed(4)} ETH interest</span>
        </div>
        <div class="interest-bar">
          <div class="interest-fill" style="width:${(Number(principal)/Number(total)*100).toFixed(1)}%"></div>
        </div>
      </div>
    </div>

    <div class="card-actions">
      ${!loan.funded && !loan.repaid && !isBorrower ? `
        <button class="btn btn-fund" onclick="fundLoan(${loan.id}, '${loan.principal}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
          Fund ${Number(principal).toFixed(4)} ETH
        </button>` : ""}
      ${loan.funded && !loan.repaid && isBorrower ? `
        <button class="btn btn-repay" onclick="repayLoan(${loan.id}, '${loan.totalRepayAmount}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.14"/></svg>
          Repay ${Number(total).toFixed(4)} ETH
        </button>` : ""}
      ${loan.repaid ? `<div class="repaid-msg">✔ Loan fully settled</div>` : ""}
      ${loan.funded && !loan.repaid && !isBorrower && !isLender ? `<div class="funded-msg">Awaiting repayment</div>` : ""}
      ${!loan.funded && isBorrower ? `<div class="pending-msg">Waiting for a lender…</div>` : ""}
    </div>
  `;
  return card;
}

// ─── REQUEST LOAN ─────────────────────────────────────────────────────────────
async function requestLoan() {
  if (!contract) { toast("Connect your wallet first", "warning"); return; }

  const amountEth  = parseFloat(loanAmountInput.value);
  const duration   = parseInt(durationInput.value);
  const interest   = parseInt(interestInput.value);

  if (!amountEth || amountEth <= 0) { toast("Enter a valid loan amount", "warning"); return; }
  if (!duration || duration <= 0)   { toast("Enter a valid duration", "warning"); return; }
  if (!interest || interest < 1 || interest > 100) { toast("Interest must be 1–100%", "warning"); return; }

  const amountWei = ethers.parseEther(amountEth.toString());

  requestBtn.disabled = true;
  requestBtn.innerHTML = `<span class="btn-spinner"></span> Submitting…`;

  try {
    const tx = await contract.requestLoan(amountWei, duration, interest);
    toast(`Transaction sent! Waiting for confirmation…`, "info");
    await tx.wait();
    toast(`Loan request confirmed on-chain! 🎉`, "success");

    loanAmountInput.value = "";
    durationInput.value   = "";
    interestInput.value   = "";
    previewSection.style.display = "none";

    await loadLoans();
  } catch (err) {
    console.error(err);
    toast(err.reason || err.message || "Transaction failed", "error");
  } finally {
    requestBtn.disabled = false;
    requestBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Request Loan`;
  }
}

// ─── FUND LOAN ────────────────────────────────────────────────────────────────
async function fundLoan(loanId, principalWei) {
  if (!contract) { toast("Connect your wallet first", "warning"); return; }

  const btn = document.querySelector(`.loan-card[data-loan-id="${loanId}"] .btn-fund`);
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="btn-spinner"></span> Funding…`; }

  try {
    const ethAmt = ethers.formatEther(principalWei);
    const tx = await contract.fundLoan(loanId, { value: BigInt(principalWei) });
    toast(`Funding ${ethAmt} ETH… waiting for confirmation`, "info");
    await tx.wait();
    toast(`Loan #${loanId} funded! 🤝 ${ethAmt} ETH sent to borrower`, "success");
    await loadLoans();
  } catch (err) {
    console.error(err);
    toast(err.reason || err.message || "Fund failed", "error");
    if (btn) { btn.disabled = false; btn.innerHTML = `Fund Loan`; }
  }
}

// ─── REPAY LOAN ───────────────────────────────────────────────────────────────
async function repayLoan(loanId, totalWei) {
  if (!contract) { toast("Connect your wallet first", "warning"); return; }

  const btn = document.querySelector(`.loan-card[data-loan-id="${loanId}"] .btn-repay`);
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="btn-spinner"></span> Repaying…`; }

  try {
    const ethAmt = ethers.formatEther(totalWei);
    const tx = await contract.repayLoan(loanId, { value: BigInt(totalWei) });
    toast(`Repaying ${ethAmt} ETH… waiting for confirmation`, "info");
    await tx.wait();
    toast(`Loan #${loanId} fully repaid! ✔ Lender received ${ethAmt} ETH`, "success");
    await loadLoans();
  } catch (err) {
    console.error(err);
    toast(err.reason || err.message || "Repay failed", "error");
    if (btn) { btn.disabled = false; btn.innerHTML = `Repay Loan`; }
  }
}

// ─── PREVIEW ─────────────────────────────────────────────────────────────────
function updatePreview() {
  const amount   = parseFloat(loanAmountInput.value);
  const interest = parseFloat(interestInput.value);

  if (amount > 0 && interest > 0) {
    const interestAmt = amount * interest / 100;
    const total       = amount + interestAmt;
    previewPrincipal.textContent = amount.toFixed(4) + " ETH";
    previewInterest.textContent  = interestAmt.toFixed(4) + " ETH";
    previewTotal.textContent     = total.toFixed(4) + " ETH";
    previewSection.style.display = "block";
  } else {
    previewSection.style.display = "none";
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function shortAddr(addr) {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return "—";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

// ─── EVENT LISTENERS ─────────────────────────────────────────────────────────
connectBtn.addEventListener("click", connectWallet);
refreshBtn.addEventListener("click", loadLoans);
loanAmountInput.addEventListener("input", updatePreview);
interestInput.addEventListener("input", updatePreview);
requestBtn.addEventListener("click", requestLoan);

// Auto-connect if already authorized
window.addEventListener("load", async () => {
  if (typeof window.ethereum !== "undefined") {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (accounts.length > 0) connectWallet();
  }
});
