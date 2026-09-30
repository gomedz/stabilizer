# Stabilizer Finance - Automated Multi-Swap Bot

An automated cyclic swap bot built in Node.js for **Stabilizer Finance** on the **Arbitrum Sepolia** testnet.

The bot executes a continuous 4-step stablecoin swap cycle:
$$\text{USDT0} \longrightarrow \text{USDC} \longrightarrow \text{USDS} \longrightarrow \text{PYUSD} \longrightarrow \text{USDT0}$$

---

## Features

- **100% Balance Swapping ("Per swap is all amount")**: Queries the full token balance at each step and swaps 100% of available tokens.
- **20k Daily Points Cap Safeguard**: Integrates with the official Stabilizer Points API (`/api/zpoints/user/${address}`). It monitors your real-time `todaySpEarned` and automatically stops the bot when reaching 20,000 SP to save gas.
- **Smart Resumption**: Detects which token holds your balance. If you start with `USDC` instead of `USDT0`, the bot picks up from that step and completes the cycle.
- **Configurable Random Intervals (5–15s)**: Pauses for a randomized 5 to 15 seconds with a visual countdown between steps to avoid rate limits and mimic human activity.
- **Dynamic On-Chain Quotes & Slippage Guard**: Queries `getAmountOut` before each swap to ensure transaction execution with customizable slippage tolerance (default 1%).
- **Automated Infinite ERC-20 Approvals**: Checks router allowances and submits max approvals (`MaxUint256`) only when needed.
- **Detailed CLI Reporting**: Real-time console logs showing step index, input/output balances, transaction hashes, points status, and block explorer links.

---

## Project Structure

```text
Stabilizer/
├── bot.js               # Main automated swap loop engine
├── config.js            # Contracts, token addresses, ABIs, and swap route
├── verify_contracts.js  # Pre-flight route and RPC verification test
├── .env.example         # Template for environment variables
├── .env                 # Your local environment variables (private key)
├── package.json         # Node.js dependencies
└── README.md            # Documentation
```

---

## Setup & Running

### 1. Install Dependencies
Dependencies are already installed. If needed:
```bash
npm install
```

### 2. Configure Environment (`.env`)
Open `.env` and fill in your EVM wallet private key:
```ini
PRIVATE_KEY=your_private_key_here
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
SLIPPAGE_BPS=100
MIN_WAIT_SECONDS=5
MAX_WAIT_SECONDS=15

# Daily Points Cap Configuration (Default: 20,000 SP)
DAILY_POINT_CAP=20000
STOP_ON_DAILY_CAP=true
SLEEP_UNTIL_MIDNIGHT_UTC=false
```

### 3. Verify Route & RPC Connectivity
Test that contracts and swap paths are active on Arbitrum Sepolia:
```bash
node verify_contracts.js
```

### 4. Run the Bot
```bash
npm start
# or: node bot.js
```

---

## Verified Smart Contract Addresses (Arbitrum Sepolia - Chain ID 421614)

| Component | Address |
| :--- | :--- |
| **Stabilizer Router** | `0xDE7982552434eEEc97f838C97aE680FC0E82cb72` |
| **Stabilizer AMM** | `0xEC8CbfD3cdb1A20BA2BF2320D96be562E4a723b1` |
| **USDZ (Protocol Dollar)** | `0xda7699906a0324eCb973D982a0B852BEb4E65253` |
| **USDT0 (Mock USDT0)** | `0x0030150861d706Cdd94f2fa8506Ec8fC69F8D7fE` |
| **USDC (Mock USDC)** | `0x900F5699416068F47dD77B5c27CA725707D380D8` |
| **USDS (Mock USDS)** | `0xF598CC5A603231f0F84e6477441F9CFd713E7aE1` |
| **PYUSD (Mock PYUSD)** | `0xfD73D083d0b2bAF8fE4B83ED42B10630A05aB561` |
