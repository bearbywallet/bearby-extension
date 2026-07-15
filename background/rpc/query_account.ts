import { Address } from 'crypto/address';
import { AddressType } from 'config/wallet';
import { hashAddress } from 'lib/utils/hashing';
import type { IAccountState } from 'background/storage/account';

const ADDR_SEPARATOR = ':';

export interface QueryAccount {
  readonly addrHash: number;
  readonly zilAddr?: Address;
  readonly ethAddr?: Address;
}

type AddrSource = Pick<IAccountState, 'addr'>;

export function toQueryAccount(account: AddrSource): QueryAccount {
  let zilAddr: Address | undefined;
  let ethAddr: Address | undefined;

  for (const part of account.addr.split(ADDR_SEPARATOR)) {
    try {
      const parsed = Address.fromStr(part);
      if (parsed.type === AddressType.Bech32) {
        zilAddr = parsed;
      } else {
        ethAddr = parsed;
      }
    } catch {
      // malformed stored part: skip it instead of failing the whole balance update
    }
  }

  return Object.freeze({ addrHash: hashAddress(account.addr), zilAddr, ethAddr });
}

export function toQueryAccounts(accounts: readonly AddrSource[]): QueryAccount[] {
  return accounts.map(toQueryAccount);
}
