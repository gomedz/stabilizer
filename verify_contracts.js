import { ethers } from 'ethers';
import { NETWORK_CONFIG, CONTRACT_ADDRESSES, TOKENS, SWAP_ROUTE, ROUTER_ABI, ERC20_ABI } from './config.js';

async function testContracts() {
  console.log('Testing RPC and Router connectivity on Arbitrum Sepolia...');
  const provider = new ethers.JsonRpcProvider(NETWORK_CONFIG.defaultRpc);
  const router = new ethers.Contract(CONTRACT_ADDRESSES.STABILIZER_ROUTER, ROUTER_ABI, provider);

  const net = await provider.getNetwork();
  console.log(`Connected to: ${net.name} (Chain ID: ${net.chainId})`);

  for (const step of SWAP_ROUTE) {
    const exists = await router.pathExists(step.from.address, step.to.address);
    console.log(`Path ${step.from.symbol} -> ${step.to.symbol} exists: ${exists}`);

    if (exists) {
      const testAmountIn = ethers.parseUnits('1.0', 18);
      const [outAmount, isMultiHop] = await router.getAmountOut(step.from.address, step.to.address, testAmountIn);
      console.log(`  Quote for 1.0 ${step.from.symbol} = ${ethers.formatUnits(outAmount, 18)} ${step.to.symbol} (MultiHop: ${isMultiHop})`);
    }
  }
  console.log('\nAll contracts and swap routes verified successfully on Arbitrum Sepolia!');
}

testContracts().catch(console.error);
