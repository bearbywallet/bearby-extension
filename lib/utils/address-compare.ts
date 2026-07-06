import { AddressType } from "config/wallet";

/**
 * Safe address comparison that handles compound Bech32 addresses ("bech32:evmAddr" format).
 * For EthCheckSum addresses, exact case-insensitive comparison is used.
 */
export function compareAddresses(
  accountAddr: Readonly<string>,
  addrType: Readonly<AddressType>,
  derivedAddr: Readonly<string>,
): boolean {
  if (addrType === AddressType.Bech32) {
    const bech32Only = accountAddr.split(":")[0];
    return bech32Only.toLowerCase() === derivedAddr.toLowerCase();
  }
  return accountAddr.toLowerCase() === derivedAddr.toLowerCase();
}
