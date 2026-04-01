// ─── CONFIG ──────────────────────────────────────────────────────────────────
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
    toast("MetaMask not detected", "error");
    return;
  }

  try {
    connectBtn.disabled = true;
    connectBtn.innerHTML = "Connecting...";

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    connectedAddress = await signer.getAddress();

    walletAddress.textContent = shortAddr(connectedAddress);
    walletInfo.classList.add("visible");

    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

    await loadLoans();

    connectBtn.innerHTML = "Connected";
  } catch (err) {
    console.error(err);
    toast("Connection failed", "error");
  }
}

// ─── LOAD LOANS (FIXED + OPTIMIZED) ──────────────────────────────────────────
async function loadLoans() {
  if (!contract) return;

  loanGrid.innerHTML = "Loading...";
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
      promises.push(
        contract.getLoan(i).then(l => ({
          id: i,
          borrower: l[0],
          lender: l[1],
          principal: l[2],
          interestRate: Number(l[3]),
          duration: Number(l[4]),
          totalRepayAmount: l[5],
          funded: l[6],
          repaid: l[7],
        }))
      );
    }

    const rawLoans = await Promise.all(promises);

    loanGrid.innerHTML = "";
    rawLoans.reverse().forEach(loan => {
      loanGrid.appendChild(buildLoanCard(loan));
    });

  } catch (err) {
    console.error(err);
    toast("Failed to load loans", "error");
  }
}

// ─── BUILD LOAN CARD (SAFE VERSION) ─────────────────────────────────────────
function buildLoanCard(loan) {
  const borrower = loan.borrower || "";
  const lender = loan.lender || "";

  const isBorrower =
    connectedAddress &&
    borrower &&
    connectedAddress.toLowerCase() === borrower.toLowerCase();

  const isLender =
    connectedAddress &&
    lender &&
    connectedAddress.toLowerCase() === lender.toLowerCase();

  const status = loan.repaid ? "repaid" : loan.funded ? "funded" : "pending";

  const principal = ethers.formatEther(loan.principal || 0);
  const total     = ethers.formatEther(loan.totalRepayAmount || 0);
  const interest  = (Number(total) - Number(principal)).toFixed(6);

  const percent = Number(total) > 0
    ? (Number(principal) / Number(total) * 100).toFixed(1)
    : 0;

  const card = document.createElement("div");
  card.className = `loan-card status-${status}`;
  card.dataset.loanId = loan.id;

  card.innerHTML = `
    <div class="card-header">
      <div class="loan-id-badge">#${loan.id}</div>
      <div class="status-pill status-${status}">${status}</div>
    </div>

    <div class="card-body">
      <p>Borrower: ${shortAddr(borrower)}</p>
      <p>Lender: ${shortAddr(lender)}</p>
      <p>Principal: ${principal} ETH</p>
      <p>Total: ${total} ETH</p>
      <p>Interest: ${loan.interestRate}%</p>
      <p>Duration: ${loan.duration} days</p>

      <div class="interest-bar">
        <div class="interest-fill" style="width:${percent}%"></div>
      </div>
    </div>

    <div class="card-actions">
      ${
        !loan.funded && !loan.repaid && !isBorrower
          ? `<button onclick="fundLoan(${loan.id}, '${loan.principal}')">Fund</button>`
          : ""
      }

      ${
        loan.funded && !loan.repaid && isBorrower
          ? `<button onclick="repayLoan(${loan.id}, '${loan.totalRepayAmount}')">Repay</button>`
          : ""
      }
    </div>
  `;

  return card;
}

// ─── REQUEST LOAN ────────────────────────────────────────────────────────────
async function requestLoan() {
  const amount = loanAmountInput.value;
  const duration = durationInput.value;
  const interest = interestInput.value;

  const tx = await contract.requestLoan(
    ethers.parseEther(amount),
    duration,
    interest
  );

  await tx.wait();
  toast("Loan Created");
  loadLoans();
}

// ─── FUND ────────────────────────────────────────────────────────────────────
async function fundLoan(id, amountWei) {
  const tx = await contract.fundLoan(id, {
    value: BigInt(amountWei),
  });

  await tx.wait();
  toast("Loan Funded");
  loadLoans();
}

// ─── REPAY ───────────────────────────────────────────────────────────────────
async function repayLoan(id, amountWei) {
  const tx = await contract.repayLoan(id, {
    value: BigInt(amountWei),
  });

  await tx.wait();
  toast("Loan Repaid");
  loadLoans();
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function shortAddr(addr) {
  if (!addr) return "—";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// ─── EVENTS ──────────────────────────────────────────────────────────────────
connectBtn.addEventListener("click", connectWallet);
refreshBtn.addEventListener("click", loadLoans);
requestBtn.addEventListener("click", requestLoan);

loanAmountInput.addEventListener("input", updatePreview);
interestInput.addEventListener("input", updatePreview);

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
