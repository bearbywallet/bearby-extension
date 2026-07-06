import { addr as ethAddr } from "micro-eth-signer";
import {
  fromBech32Address,
  fromZilPubKey,
  toBech32Address,
  toChecksumBytesAddress,
} from "lib/zilliqa";
import { KeyPair } from "./keypair";
import { HRP } from "lib/zilliqa/config";
import { hasHexPrefix, hexToUint8Array, uint8ArrayToHex } from "lib/utils/hex";
import { AddressType } from "config/wallet";


export class Address {
  readonly #bytes: Uint8Array;
  #type: AddressType;

  get bytes() {
    return this.#bytes;
  }

  get type() {
    return this.#type;
  }

  static empty(slip44: number) {
    const addressType = KeyPair.addressType(slip44);
    return new Address(new Uint8Array(20), addressType);
  }

  static fromStr(address: string) {
    if (hasHexPrefix(address)) {
      const ethCheckSumAddress = ethAddr.parse(address);
      const bytes = hexToUint8Array(ethCheckSumAddress.data);

      return new Address(bytes, AddressType.EthCheckSum);
    } else if (address.startsWith(HRP)) {
      const checkSumZil = fromBech32Address(address);
      const bytes = hexToUint8Array(checkSumZil);

      return new Address(bytes, AddressType.Bech32);
    }

    throw new Error("Unsupported address format");
  }

  static async fromPubKey(pubKey: Uint8Array, slip44: number) {
    const addressType = KeyPair.addressType(slip44);

    return Address.fromPubKeyType(pubKey, addressType);
  }

  static async fromPubKeyType(pubKey: Uint8Array, addressType: AddressType) {
    switch (addressType) {
      case AddressType.Bech32: {
        const zilBytes = await fromZilPubKey(pubKey);
        return new Address(zilBytes, addressType);
      }
      case AddressType.EthCheckSum: {
        const ethChecsumAddress = ethAddr.fromPublicKey(pubKey);
        const ethBytes = hexToUint8Array(ethChecsumAddress);
        return new Address(ethBytes, addressType);
      }
    }
  }

  static async fromPrivateKey(privateKey: Uint8Array, slip44: number) {
    const keypair = await KeyPair.fromPrivateKey(privateKey, slip44);
    const addressType = keypair.addressType();

    switch (addressType) {
      case AddressType.Bech32:
        const base16 = await fromZilPubKey(keypair.pubKey);
        return new Address(base16, addressType);

      case AddressType.EthCheckSum:
        const ethChecsumAddress = ethAddr.fromPublicKey(keypair.pubKey);
        const ethBytes = hexToUint8Array(ethChecsumAddress);

        return new Address(ethBytes, addressType);
    }
  }

  constructor(bytes: Uint8Array, type: AddressType) {
    this.#bytes = bytes;
    this.#type = type;
  }

  toBase16(): string {
    return uint8ArrayToHex(this.bytes);
  }

  async autoFormat() {
    const result = await (async () => {
      switch (this.#type) {
        case AddressType.Bech32:
          return this.toZilBech32();
        case AddressType.EthCheckSum:
          return this.toEthChecksum();
      }
    })();
    return result;
  }

  async toEthChecksum(): Promise<string> {
    const nonChecksummedAddress = uint8ArrayToHex(this.bytes);
    return ethAddr.addChecksum(nonChecksummedAddress);
  }

  async toZilChecksum(): Promise<string> {
    return toChecksumBytesAddress(this.bytes);
  }

  async toZilBech32(): Promise<string> {
    const zilChecSum = await this.toZilChecksum();

    return toBech32Address(zilChecSum);
  }
}
