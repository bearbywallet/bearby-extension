import { ZILLIQA } from 'config/slip44';
import { HEX_PREFIX, stripHexPrefix } from 'lib/utils/hex';

/** approve(address,uint256) — first 4 bytes of keccak256 */
export const ERC20_APPROVE_SELECTOR = '095ea7b3';
/** Ethereum / standard ERC-20 unlimited approve */
export const MAX_UINT256 = (1n << 256n) - 1n;
/**
 * Zilliqa EVM tokens typically cap allowances at uint128
 * (larger values revert: "value greater than uint128 max value").
 */
export const MAX_UINT128 = (1n << 128n) - 1n;

export interface ERC20ApproveCall {
  readonly spender: string; // 0x + 40 hex chars, lowercase
  readonly amount: bigint;
}

const HEX_RE = /^[0-9a-f]+$/;
const ADDR_PAD = '0'.repeat(24); // upper 12 bytes of the address word

/** Chain-specific unlimited approve amount. */
export function maxApproveAmount(slip44: number): bigint {
  return slip44 === ZILLIQA ? MAX_UINT128 : MAX_UINT256;
}

/**
 * Whether an approve amount should be shown as "Unlimited".
 * Treats both chain max and classic MAX_UINT256 as unlimited so dapp
 * max-approves still label correctly on Zilliqa before clamping.
 */
export function isUnlimitedApproveAmount(
  amount: bigint,
  slip44?: number,
): boolean {
  if (amount === MAX_UINT256) return true;
  if (slip44 === ZILLIQA) return amount === MAX_UINT128;
  if (slip44 !== undefined) return false;
  // unknown chain: either classic max
  return amount === MAX_UINT128;
}

export function decodeERC20Approve(data?: string): ERC20ApproveCall | null {
  if (!data) return null;

  const hex = stripHexPrefix(data).toLowerCase();

  // exactly 4-byte selector + 2 × 32-byte words = 68 bytes = 136 hex chars
  if (hex.length !== 136 || !HEX_RE.test(hex)) return null;
  if (!hex.startsWith(ERC20_APPROVE_SELECTOR)) return null;

  const spenderWord = hex.slice(8, 72);
  const amountWord = hex.slice(72);

  if (!spenderWord.startsWith(ADDR_PAD)) return null; // dirty address padding

  return {
    spender: HEX_PREFIX + spenderWord.slice(24),
    amount: BigInt(HEX_PREFIX + amountWord),
  };
}

export function encodeERC20Approve(spender: string, amount: bigint): string {
  const addr = stripHexPrefix(spender).toLowerCase();

  if (addr.length !== 40 || !HEX_RE.test(addr)) {
    throw new Error(`Invalid spender address: ${spender}`);
  }
  if (amount < 0n || amount > MAX_UINT256) {
    throw new Error('Amount out of uint256 range');
  }

  return [
    HEX_PREFIX,
    ERC20_APPROVE_SELECTOR,
    addr.padStart(64, '0'),
    amount.toString(16).padStart(64, '0'),
  ].join('');
}
