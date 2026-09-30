import { ethers } from 'ethers';
import dotenv from 'dotenv';
import {
  NETWORK_CONFIG,
  CONTRACT_ADDRESSES,
  TOKENS,
  SWAP_ROUTE,
  ROUTER_ABI,
  ERC20_ABI
} from './config.js';

dotenv.config();

// Configuration parameters
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL || NETWORK_CONFIG.defaultRpc;
const SLIPPAGE_BPS = BigInt(process.env.SLIPPAGE_BPS || '100'); // 100 bps = 1.0%
const MIN_WAIT_SECONDS = parseInt(process.env.MIN_WAIT_SECONDS || '5', 10);
const MAX_WAIT_SECONDS = parseInt(process.env.MAX_WAIT_SECONDS || '15', 10);
const MAX_CYCLES = process.env.MAX_CYCLES ? parseInt(process.env.MAX_CYCLES, 10) : Infinity;
const DAILY_POINT_CAP = parseInt(process.env.DAILY_POINT_CAP || '20000', 10);
const STOP_ON_DAILY_CAP = process.env.STOP_ON_DAILY_CAP !== 'false';
const SLEEP_UNTIL_MIDNIGHT_UTC = process.env.SLEEP_UNTIL_MIDNIGHT_UTC === 'true';

// Formatting helper
const formatUnits = (val, decimals = 18) => {
  return parseFloat(ethers.formatUnits(val, decimals)).toFixed(4);
};

// Random sleep helper with visual countdown
const sleepRandomSeconds = async (minSec, maxSec, reason = 'Waiting next step') => {
  const waitSec = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
  process.stdout.write(`⏳ [${reason}] Sleeping for ${waitSec}s... `);
  for (let s = waitSec; s > 0; s--) {
    process.stdout.write(`${s} `);
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.stdout.write('Done!\n\n');
};

class StabilizerSwapBot {
  constructor() {
    if (!PRIVATE_KEY || PRIVATE_KEY.includes('YOUR_PRIVATE_KEY_HERE')) {
      console.error('❌ Error: PRIVATE_KEY is not configured in .env file!');
      process.exit(1);
    }

    this.provider = new ethers.JsonRpcProvider(RPC_URL, {
      chainId: NETWORK_CONFIG.chainId,
      name: NETWORK_CONFIG.name
    });

    this.wallet = new ethers.Wallet(PRIVATE_KEY, this.provider);
    this.router = new ethers.Contract(
      CONTRACT_ADDRESSES.STABILIZER_ROUTER,
      ROUTER_ABI,
      this.wallet
    );

    this.tokenContracts = {};
    for (const [key, token] of Object.entries(TOKENS)) {
      this.tokenContracts[key] = new ethers.Contract(token.address, ERC20_ABI, this.wallet);
    }

    this.stats = {
      cyclesCompleted: 0,
      totalSwaps: 0,
      startTime: Date.now()
    };
  }

  async verifyNetwork() {
    try {
      const network = await this.provider.getNetwork();
      if (Number(network.chainId) !== NETWORK_CONFIG.chainId) {
        console.warn(
          `⚠️ Connected to Chain ID ${network.chainId}, expected Arbitrum Sepolia (${NETWORK_CONFIG.chainId})`
        );
      }
      const ethBal = await this.provider.getBalance(this.wallet.address);
      console.log(`📡 Network: ${NETWORK_CONFIG.name} (Chain ID: ${network.chainId})`);
      console.log(`👤 Wallet : ${this.wallet.address}`);
      console.log(`⛽ Gas Bal: ${ethers.formatEther(ethBal)} ETH\n`);

      if (ethBal === 0n) {
        console.error('❌ Insufficient gas! Please fund your wallet with Arbitrum Sepolia ETH.');
        process.exit(1);
      }
    } catch (err) {
      console.error('❌ Failed to connect to RPC endpoint:', err.message);
      process.exit(1);
    }
  }

  async ensureAllowance(tokenContract, tokenSymbol, requiredAmount) {
    const allowance = await tokenContract.allowance(
      this.wallet.address,
      CONTRACT_ADDRESSES.STABILIZER_ROUTER
    );

    if (allowance < requiredAmount) {
      console.log(`🔓 Approving ${tokenSymbol} for Stabilizer Router...`);
      const tx = await tokenContract.approve(
        CONTRACT_ADDRESSES.STABILIZER_ROUTER,
        ethers.MaxUint256
      );
      console.log(`   Tx Hash: ${tx.hash}`);
      await tx.wait(1);
      console.log(`   ✅ ${tokenSymbol} approval confirmed.`);
    }
  }

  async printAllBalances() {
    console.log('📊 Current Token Balances:');
    for (const [key, token] of Object.entries(TOKENS)) {
      const bal = await this.tokenContracts[key].balanceOf(this.wallet.address);
      console.log(`   • ${token.symbol.padEnd(6)}: ${formatUnits(bal)}`);
    }
    console.log('');
  }

  async findStartingTokenIndex() {
    // Check if user has balance in any token of the loop
    for (let i = 0; i < SWAP_ROUTE.length; i++) {
      const token = SWAP_ROUTE[i].from;
      const bal = await this.tokenContracts[token.symbol].balanceOf(this.wallet.address);
      if (bal > ethers.parseUnits('0.001', 18)) {
        return i;
      }
    }
    return -1;
  }

  async executeSwapStep(fromToken, toToken, stepIndex, totalSteps) {
    const fromContract = this.tokenContracts[fromToken.symbol];
    const toContract = this.tokenContracts[toToken.symbol];

    // "Per swap is all amount" -> query full balance
    const amountIn = await fromContract.balanceOf(this.wallet.address);

    if (amountIn === 0n || amountIn < ethers.parseUnits('0.0001', 18)) {
      throw new Error(`Insufficient ${fromToken.symbol} balance (${formatUnits(amountIn)})`);
    }

    console.log(`─────────────────────────────────────────────────────────────────`);
    console.log(
      `🔄 [Step ${stepIndex}/${totalSteps}] Swapping ALL ${fromToken.symbol} ➔ ${toToken.symbol}`
    );
    console.log(`   Input Amount: ${formatUnits(amountIn)} ${fromToken.symbol}`);

    // Ensure Allowance
    await this.ensureAllowance(fromContract, fromToken.symbol, amountIn);

    // Query Quote
    const [expectedAmountOut, isMultiHop] = await this.router.getAmountOut(
      fromToken.address,
      toToken.address,
      amountIn
    );

    // Calculate minAmountOut with Slippage Guard (constant sum AMM with fee deduction)
    const minAmountOut = (expectedAmountOut * (10000n - SLIPPAGE_BPS)) / 10000n;

    console.log(`   Expected Out: ${formatUnits(expectedAmountOut)} ${toToken.symbol}`);
    console.log(
      `   Min Out (Slippage ${Number(SLIPPAGE_BPS) / 100}%): ${formatUnits(minAmountOut)} ${toToken.symbol}`
    );

    // Estimate gas
    let gasLimit = 350000n;
    try {
      const estimated = await this.router.swap.estimateGas(
        fromToken.address,
        toToken.address,
        amountIn,
        minAmountOut
      );
      gasLimit = (estimated * 125n) / 100n; // 25% safety buffer
    } catch {
      // Use safe default if estimation reverts
    }

    // Execute Swap Transaction
    const tx = await this.router.swap(
      fromToken.address,
      toToken.address,
      amountIn,
      minAmountOut,
      { gasLimit }
    );

    console.log(`   🚀 Broadcasted! Hash: ${tx.hash}`);
    console.log(`   🔗 Explorer: ${NETWORK_CONFIG.explorerUrl}/tx/${tx.hash}`);

    const receipt = await tx.wait(1);
    if (receipt.status !== 1) {
      throw new Error(`Transaction reverted! Status: ${receipt.status}`);
    }

    this.stats.totalSwaps++;

    // Check new balance
    const newBal = await toContract.balanceOf(this.wallet.address);
    console.log(`   ✅ Confirmed in block #${receipt.blockNumber}!`);
    console.log(`   💰 Received Balance: ${formatUnits(newBal)} ${toToken.symbol}\n`);

    return newBal;
  }

  async fetchPointsData() {
    try {
      const url = `${NETWORK_CONFIG.apiBaseUrl}/api/zpoints/user/${this.wallet.address}?chainId=${NETWORK_CONFIG.chainId}&_t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        return null;
      }
      return await res.json();
    } catch (err) {
      console.warn('⚠️ Could not fetch points data from API:', err.message);
      return null;
    }
  }

  async checkDailyPointsCap() {
    if (!STOP_ON_DAILY_CAP) return false;

    const data = await this.fetchPointsData();
    if (!data) return false;

    const todaySp = typeof data.todaySpEarned === 'number'
      ? data.todaySpEarned
      : parseInt(data.stats?.dailyPoints || '0', 10);
    const totalSp = data.stats?.totalPoints || '0';

    console.log(`🏆 Stabilizer Points Status:`);
    console.log(`   • Today's SP Earned : ${todaySp.toLocaleString()} / ${DAILY_POINT_CAP.toLocaleString()} SP`);
    console.log(`   • Total SP Balance  : ${parseInt(totalSp).toLocaleString()} SP`);
    if (data.rank && data.rank > 0) {
      console.log(`   • Leaderboard Rank  : #${data.rank}`);
    }
    console.log('');

    if (todaySp >= DAILY_POINT_CAP) {
      console.log(`🎯 [DAILY CAP REACHED] You have reached ${todaySp.toLocaleString()} SP today (Limit: ${DAILY_POINT_CAP.toLocaleString()})!`);
      console.log(`🛑 Stopping bot swaps to prevent wasting gas. Earnings resume at midnight (00:00 UTC).`);

      if (SLEEP_UNTIL_MIDNIGHT_UTC) {
        const now = new Date();
        const tomorrowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 10));
        const msUntilTomorrow = tomorrowUtc.getTime() - now.getTime();
        const hours = (msUntilTomorrow / 3600000).toFixed(1);
        console.log(`😴 Sleeping for ${hours} hours until 00:00 UTC...`);
        await new Promise((r) => setTimeout(r, msUntilTomorrow));
        console.log(`🌅 Midnight UTC arrived! Resetting daily cycle.`);
        return false;
      } else {
        console.log(`👋 Exiting bot cleanly. Run again tomorrow!`);
        process.exit(0);
      }
    }

    return false;
  }

  async run() {
    console.log(`\n=================================================================`);
    console.log(`           STABILIZER AUTOMATIC SWAP BOT (ARBITRUM SEPOLIA)      `);
    console.log(`=================================================================\n`);

    await this.verifyNetwork();
    await this.printAllBalances();
    await this.checkDailyPointsCap();

    let cycle = 1;

    while (cycle <= MAX_CYCLES) {
      console.log(`\n======================= [ CYCLE #${cycle} START ] =======================`);

      // Check daily points limit before starting each cycle
      await this.checkDailyPointsCap();

      let startIndex = await this.findStartingTokenIndex();

      if (startIndex === -1) {
        console.warn(`⚠️ No tradeable token balances found (USDT0, USDC, USDS, PYUSD).`);
        console.log(`👉 Please claim testnet tokens from https://app.stabilizer.finance/faucet`);
        await sleepRandomSeconds(10, 20, 'Retrying balance check');
        continue;
      }

      // If starting token is not USDT0, start from where the balance is
      if (startIndex !== 0) {
        console.log(
          `ℹ️ Resuming cycle from existing balance in ${SWAP_ROUTE[startIndex].from.symbol}...`
        );
      }

      // Loop through all 4 swap steps starting from current token position
      for (let offset = 0; offset < SWAP_ROUTE.length; offset++) {
        const routeIdx = (startIndex + offset) % SWAP_ROUTE.length;
        const { from, to } = SWAP_ROUTE[routeIdx];
        const stepNumber = offset + 1;

        try {
          await this.executeSwapStep(from, to, stepNumber, SWAP_ROUTE.length);
        } catch (err) {
          console.error(`❌ Swap error at step ${stepNumber} (${from.symbol} -> ${to.symbol}):`, err.message);
          console.log(`⏳ Waiting 10s before attempting recovery...`);
          await new Promise((r) => setTimeout(r, 10000));
          // Break to re-evaluate balances and resume safely
          break;
        }

        // Random wait interval (5 - 15 seconds) after each swap
        if (offset < SWAP_ROUTE.length - 1) {
          await sleepRandomSeconds(MIN_WAIT_SECONDS, MAX_WAIT_SECONDS, 'Interval between swaps');
        }
      }

      this.stats.cyclesCompleted++;
      console.log(`🎉 [ CYCLE #${cycle} COMPLETED SUCCESSFULLY ]`);
      await this.printAllBalances();

      // Check daily points limit after cycle completion
      await this.checkDailyPointsCap();

      // Random wait interval (5 - 15 seconds) before next cycle
      await sleepRandomSeconds(MIN_WAIT_SECONDS, MAX_WAIT_SECONDS, 'Interval before next cycle');
      cycle++;
    }

    console.log(`🏁 All configured cycles (${MAX_CYCLES}) finished! Exiting.`);
  }
}

// Global process handling
const bot = new StabilizerSwapBot();

process.on('SIGINT', () => {
  console.log('\n🛑 Shutdown signal received. Exiting bot cleanly...');
  process.exit(0);
});

bot.run().catch((err) => {
  console.error('Fatal bot error:', err);
  process.exit(1);
});
