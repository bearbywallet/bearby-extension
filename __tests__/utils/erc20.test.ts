import { describe, it, expect } from 'vitest';
import {
  decodeERC20Approve,
  encodeERC20Approve,
  isUnlimitedApproveAmount,
  maxApproveAmount,
  MAX_UINT128,
  MAX_UINT256,
} from 'lib/utils/erc20';
import { ETHEREUM, ZILLIQA } from 'config/slip44';

const SPENDER = '0xe3016a8be9acadb345d0483acbcbc39207aa2086';

describe('erc20 approve calldata', () => {
  it('round-trips a normal approve', () => {
    const data = encodeERC20Approve(SPENDER, 1_500_000_000_000_000_000n);
    expect(decodeERC20Approve(data)).toEqual({
      spender: SPENDER.toLowerCase(),
      amount: 1_500_000_000_000_000_000n,
    });
  });

  it('round-trips zero (revoke) and MAX_UINT256 (unlimited)', () => {
    const zeroDecoded = decodeERC20Approve(encodeERC20Approve(SPENDER, 0n));
    expect(zeroDecoded).not.toBeNull();
    expect(zeroDecoded?.amount).toBe(0n);

    const unlimited = encodeERC20Approve(SPENDER, MAX_UINT256);
    expect(unlimited.endsWith('f'.repeat(64))).toBe(true);
    const unlimitedDecoded = decodeERC20Approve(unlimited);
    expect(unlimitedDecoded).not.toBeNull();
    expect(unlimitedDecoded?.amount).toBe(MAX_UINT256);
  });

  it('round-trips MAX_UINT128 (Zilliqa unlimited)', () => {
    const data = encodeERC20Approve(SPENDER, MAX_UINT128);
    const decoded = decodeERC20Approve(data);
    expect(decoded).not.toBeNull();
    expect(decoded?.amount).toBe(MAX_UINT128);
  });

  it('decodes a known fixture', () => {
    const data = [
      '0x095ea7b3',
      '000000000000000000000000',
      SPENDER.slice(2),
      '0000000000000000000000000000000000000000000000000000000000000001',
    ].join('');
    expect(decodeERC20Approve(data)).toEqual({
      spender: SPENDER.toLowerCase(),
      amount: 1n,
    });
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['0x only', '0x'],
    ['wrong selector (transfer)', '0xa9059cbb' + '0'.repeat(128)],
    ['too short (67 bytes)', '0x095ea7b3' + '0'.repeat(126)],
    ['too long (69 bytes)', '0x095ea7b3' + '0'.repeat(130)],
    ['dirty address padding', '0x095ea7b3' + 'ff' + '0'.repeat(126)],
    ['non-hex chars', '0x095ea7b3' + 'zz' + '0'.repeat(126)],
  ])('returns null for %s', (_name, data) => {
    expect(decodeERC20Approve(data as string | undefined)).toBeNull();
  });

  it('encoder rejects bad inputs', () => {
    expect(() => encodeERC20Approve('0x1234', 1n)).toThrow(); // short address
    expect(() => encodeERC20Approve(SPENDER + '00', 1n)).toThrow(); // long address
    expect(() => encodeERC20Approve(SPENDER, MAX_UINT256 + 1n)).toThrow();
    expect(() => encodeERC20Approve(SPENDER, -1n)).toThrow();
  });
});

describe('maxApproveAmount / isUnlimitedApproveAmount', () => {
  it('uses MAX_UINT128 on Zilliqa and MAX_UINT256 elsewhere', () => {
    expect(maxApproveAmount(ZILLIQA)).toBe(MAX_UINT128);
    expect(maxApproveAmount(ETHEREUM)).toBe(MAX_UINT256);
    expect(maxApproveAmount(0)).toBe(MAX_UINT256);
  });

  it('detects unlimited for each chain', () => {
    expect(isUnlimitedApproveAmount(MAX_UINT128, ZILLIQA)).toBe(true);
    expect(isUnlimitedApproveAmount(MAX_UINT256, ZILLIQA)).toBe(true);
    expect(isUnlimitedApproveAmount(1n, ZILLIQA)).toBe(false);

    expect(isUnlimitedApproveAmount(MAX_UINT256, ETHEREUM)).toBe(true);
    expect(isUnlimitedApproveAmount(MAX_UINT128, ETHEREUM)).toBe(false);
    expect(isUnlimitedApproveAmount(1n, ETHEREUM)).toBe(false);

    // unknown slip44: both classic maxes count as unlimited
    expect(isUnlimitedApproveAmount(MAX_UINT128)).toBe(true);
    expect(isUnlimitedApproveAmount(MAX_UINT256)).toBe(true);
  });
});
