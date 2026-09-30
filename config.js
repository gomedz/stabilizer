import dotenv from 'dotenv';
dotenv.config();

export const NETWORK_CONFIG = {
  name: 'Arbitrum Sepolia',
  chainId: 421614,
  defaultRpc: process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
  fallbackRpcs: [
    'https://arbitrum-sepolia.blockpi.network/v1/rpc/public',
    'https://endpoints.omniatech.io/v1/arbitrum/sepolia/public',
    'https://sepolia-rollup.arbitrum.io/rpc'
  ],
  explorerUrl: 'https://sepolia.arbiscan.io',
  apiBaseUrl: process.env.API_BASE_URL || 'https://stabilizerapi-production.up.railway.app'
};

export const CONTRACT_ADDRESSES = {
  STABILIZER_ROUTER: '0xDE7982552434eEEc97f838C97aE680FC0E82cb72',
  STABILIZER_AMM: '0xEC8CbfD3cdb1A20BA2BF2320D96be562E4a723b1',
  USDZ: '0xda7699906a0324eCb973D982a0B852BEb4E65253'
};

export const TOKENS = {
  USDT0: {
    symbol: 'USDT0',
    address: '0x0030150861d706Cdd94f2fa8506Ec8fC69F8D7fE',
    decimals: 18
  },
  USDC: {
    symbol: 'USDC',
    address: '0x900F5699416068F47dD77B5c27CA725707D380D8',
    decimals: 18
  },
  USDS: {
    symbol: 'USDS',
    address: '0xF598CC5A603231f0F84e6477441F9CFd713E7aE1',
    decimals: 18
  },
  PYUSD: {
    symbol: 'PYUSD',
    address: '0xfD73D083d0b2bAF8fE4B83ED42B10630A05aB561',
    decimals: 18
  }
};

// Route: USDT0 -> USDC -> USDS -> PYUSD -> USDT0
export const SWAP_ROUTE = [
  { from: TOKENS.USDT0, to: TOKENS.USDC },
  { from: TOKENS.USDC, to: TOKENS.USDS },
  { from: TOKENS.USDS, to: TOKENS.PYUSD },
  { from: TOKENS.PYUSD, to: TOKENS.USDT0 }
];

export const ROUTER_ABI = [
  'function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256 amountOut, bool isMultiHop)',
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) external returns (uint256 amountOut)',
  'function pathExists(address tokenIn, address tokenOut) external view returns (bool exists)',
  'function stabilizerAMM() external view returns (address)',
  'function usdz() external view returns (address)'
];

export const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)'
];
