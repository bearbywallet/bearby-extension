import type { TypedData } from "micro-eth-signer";

import { ETHEREUM, ZILLIQA } from "config/slip44";
import { deriveFromPrivateKeyPublicKey, derivePrivateKey } from "./bip32";
import { DerivationPath } from "./bip49";
import { sign, verify } from "./zilliqa/schnorr";
import { eip191Signer, signTyped, verifyTyped } from "micro-eth-signer";
import { hexToUint8Array, uint8ArrayToHex } from "lib/utils/hex";
import { Signature } from "@noble/secp256k1";
import { randomBytes } from "./random";
import { Address } from "./address";
import { AddressType } from "config/wallet";
import type { IKeyPair } from "types/wallet";
import { createStepLogger } from "lib/utils/debug-log";

const logKeypair = createStepLogger("KeyPair");

export class KeyPair {
  #privateKey: Uint8Array;
  #pubKey: Uint8Array;
  #slip44: number;

  static addressType(slip44: number): AddressType {
    switch (slip44) {
      case ZILLIQA:
        return AddressType.Bech32;
      case ETHEREUM:
        return AddressType.EthCheckSum;
      default:
        return AddressType.EthCheckSum;
    }
  }

  static addressTypeFromAddress(addr: string): AddressType {
    if (addr.startsWith("0x")) {
      return AddressType.EthCheckSum;
    } else if (addr.startsWith("zil1")) {
      return AddressType.Bech32;
    } else {
      throw new Error(`Invlid addr: ${addr}`);
    }
  }

  static async fromPrivateKey(privateKey: Uint8Array, slip44: number) {
    logKeypair("fromPrivateKey", {
      slip44,
      addressType: KeyPair.addressType(slip44),
      pkLen: privateKey?.length,
    });
    const pubKey = await deriveFromPrivateKeyPublicKey(privateKey, slip44);

    return new KeyPair(privateKey, pubKey, slip44);
  }

  static async generate(slip44: number) {
    const privateKey = randomBytes(32);
    const pubKey = await deriveFromPrivateKeyPublicKey(privateKey, slip44);

    return new KeyPair(privateKey, pubKey, slip44);
  }

  static async fromSeed(seed: Uint8Array, slip44: number, index: number) {
    const hdPath = new DerivationPath(slip44, index);
    const path = hdPath.getPath();
    logKeypair("fromSeed", {
      slip44,
      index,
      derivationPath: path,
      addressType: KeyPair.addressType(slip44),
      seedLen: seed?.length,
    });
    const privateKey = await derivePrivateKey(seed, path);
    const pubKey = await deriveFromPrivateKeyPublicKey(privateKey, slip44);

    return new KeyPair(privateKey, pubKey, slip44);
  }

  get privateKey() {
    return this.#privateKey;
  }

  get pubKey() {
    return this.#pubKey;
  }

  get slip44() {
    return this.#slip44;
  }

  constructor(privateKey: Uint8Array, pubKey: Uint8Array, slip44: number) {
    this.#privateKey = privateKey;
    this.#pubKey = pubKey;
    this.#slip44 = slip44;
  }

  addressType(): AddressType {
    return KeyPair.addressType(this.#slip44);
  }

  async address(): Promise<Address> {
    const addr = await Address.fromPubKey(this.pubKey, this.slip44);
    logKeypair("address", {
      slip44: this.#slip44,
      addressType: this.addressType(),
    });
    return addr;
  }

  async signMessage(msg: Uint8Array) {
    const addrType = this.addressType();
    logKeypair("signMessage", {
      slip44: this.#slip44,
      addressType: addrType,
      msgLen: msg.length,
    });
    switch (addrType) {
      case AddressType.Bech32:
        const sigZil = await sign(msg, this.privateKey);
        return Uint8Array.from(sigZil.toBytes());
      case AddressType.EthCheckSum:
        const sigEth = eip191Signer.sign(msg, this.privateKey);
        return hexToUint8Array(sigEth);
    }
  }

  signDataEIP712(typedData: TypedData<any, any>): Uint8Array {
    logKeypair("signDataEIP712", {
      slip44: this.#slip44,
      addressType: this.addressType(),
      primaryType: typeof typedData?.primaryType === "string" ? typedData.primaryType : undefined,
    });
    const entropy = randomBytes(120);
    const signature = signTyped(typedData, this.privateKey, entropy);
    return hexToUint8Array(signature);
  }

  async verifyTypedEIP712(
    signature: Uint8Array,
    typedData: TypedData<any, any>,
    address: Address,
  ): Promise<boolean> {
    const sigHex = uint8ArrayToHex(signature, true);
    const ethChecsumAddr = await address.toEthChecksum();

    return verifyTyped(sigHex, typedData, ethChecsumAddr);
  }

  async verifySig(msg: Uint8Array, sig: Uint8Array): Promise<boolean> {
    switch (this.addressType()) {
      case AddressType.Bech32:
        return await verify(msg, this.pubKey, Signature.fromBytes(sig));
      case AddressType.EthCheckSum:
        const address = await this.address();
        const ethChecsum = await address.toEthChecksum();
        const sigHex = uint8ArrayToHex(sig);

        return eip191Signer.verify(sigHex, msg, ethChecsum);
    }
  }

  async toJSON(): Promise<IKeyPair> {
    return {
      address: await (await this.address()).autoFormat(),
      privateKey: uint8ArrayToHex(this.#privateKey),
      publicKey: uint8ArrayToHex(this.#pubKey),
      slip44: this.#slip44,
    };
  }
}
