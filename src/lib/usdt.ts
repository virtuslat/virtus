// USDT BEP-20 on BSC
export const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955'

// Receiver wallet
export const PAYMENT_RECEIVER = '0x011debd4ce1297d335ccae65be67b2663352cb93'

// Minimal ERC-20 ABI for transfer + balanceOf
export const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]

// USDT on BSC uses 18 decimals (unlike Ethereum's 6)
export const USDT_DECIMALS = 18
