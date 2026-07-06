import { utils } from 'aes-js';
import { ChainConfig } from './chain';
import { KeyPair } from 'crypto/keypair';
import { AddressType } from 'config/wallet';
import type { Bip32Account } from 'types/wallet';
import { Address } from 'crypto/address';
import { ETHEREUM, ZILLIQA } from 'config/slip44';
import { uint8ArrayToHex } from 'lib/utils/hex';
import type { LedgerPublicAddress } from 'types/ledger';

export interface IAccountState {
  addr: string;
  addrType: AddressType;
  name: string;
  pubKey: string;
  chainHash: number;
  chainId: number;
  slip44: number;
  index: number;
}

export class Account implements IAccountState {
  addr: string;
  addrType: AddressType;
  name: string;
  pubKey: string;
  chainHash: number;
  chainId: number;
  slip44: number;
  index: number;

  constructor(data: IAccountState) {
    this.addr = data.addr;
    this.addrType = data.addrType;
    this.name = data.name;
    this.pubKey = data.pubKey;
    this.chainHash = data.chainHash;
    this.chainId = data.chainId;
    this.slip44 = data.slip44;
    this.index = data.index;
  }

  static async fromBip39(bip32Account: Bip32Account, chain: ChainConfig, seed: Uint8Array): Promise<Account> {
    const keyPair = await KeyPair.fromSeed(seed, chain.slip44, bip32Account.index);
    const addrType = keyPair.addressType();
    const pubKey = keyPair.pubKey;
    let addr: string;

    if (addrType == AddressType.Bech32) {
      const address = await Address.fromPubKeyType(pubKey, AddressType.EthCheckSum);
      const bech32 = await (await keyPair.address()).autoFormat();
      const evmAddr = await address.toEthChecksum();

      addr = `${bech32}:${evmAddr}`;
    } else {
      const address = await keyPair.address();
      addr = await address.autoFormat();
    }

    const account = new Account({
      addr,
      addrType,
      name: bip32Account.name,
      index: bip32Account.index,
      pubKey: utils.hex.fromBytes(keyPair.pubKey),
      chainHash: chain.hash(),
      slip44: chain.slip44,
      chainId: chain.chainId,
    });

    return account;
  }

  static async fromPrivateKey(privateKey: Uint8Array, chain: ChainConfig, name: string): Promise<Account> {
    const keyPair = await KeyPair.fromPrivateKey(privateKey, chain.slip44);
    const addrType = keyPair.addressType();
    const pubKey = keyPair.pubKey;
    let addr: string;

    if (addrType == AddressType.Bech32) {
      const address = await Address.fromPubKeyType(pubKey, AddressType.EthCheckSum);
      const bech32 = await (await keyPair.address()).autoFormat();
      const evmAddr = await address.toEthChecksum();

      addr = `${bech32}:${evmAddr}`;
    } else {
      const address = await keyPair.address();
      addr = await address.autoFormat();
    }

    const account = new Account({
      addr,
      addrType,
      name: name,
      index: 0,
      pubKey: utils.hex.fromBytes(keyPair.pubKey),
      chainHash: chain.hash(),
      slip44: chain.slip44,
      chainId: chain.chainId,
    });

    return account;
  }

  static async fromWatchAccount(address: Address, chain: ChainConfig, name: string): Promise<Account> {
    let addr: string = await address.autoFormat();

    const account = new Account({
      addr,
      addrType: address.type,
      name: name,
      index: 0,
      pubKey: "",
      chainHash: chain.hash(),
      slip44: chain.slip44,
      chainId: chain.chainId,
    });

    return account;
  }

  static async fromLedger(ledgerAccount: LedgerPublicAddress, chain: ChainConfig): Promise<Account> {
    const address = Address.fromStr(ledgerAccount.pubAddr);
    let addr = await address.autoFormat();
    let addrType: AddressType = address.type;

    const account = new Account({
      addr,
      addrType,
      index: ledgerAccount.index,
      name: ledgerAccount.name,
      pubKey: ledgerAccount.publicKey,
      chainHash: chain.hash(),
      slip44: ledgerAccount.slip44,
      chainId: chain.chainId,
    });

    return account;
  }

  toJSON(): IAccountState {
    return {
      addr: this.addr,
      addrType: this.addrType,
      name: this.name,
      pubKey: this.pubKey,
      chainHash: this.chainHash,
      chainId: this.chainId,
      slip44: this.slip44,
      index: this.index,
    };
  }
}
