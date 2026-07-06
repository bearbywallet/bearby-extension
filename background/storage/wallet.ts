import type { IAccountState } from './account';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../../crypto/b64';
import { generateSalt } from '../../lib/runtime';
import { Account } from './account';
import { FToken, type IFTokenState } from './ftoken';
import { WalletSettings, type IWalletSettingsState } from './settings';
import { Session } from '../secure/session';
import { ChainConfig } from './chain';
import { Bip39 } from '../../crypto/bip39';
import { uuid } from '../../crypto/uuid';
import { TypeOf } from 'lib/types';
import { KeyPair } from 'crypto/keypair';
import { uint8ArrayToUtf8, utf8ToUint8Array } from 'lib/utils/utf8';
import { HistoricalTransaction, type IHistoricalTransactionState } from 'background/rpc/history_tx';
import { ConfirmState, type IConfirmState } from './confirm';
import { AuthMethod, WalletTypes } from 'config/wallet';
import type { Bip32Account } from 'types/wallet';
import type { NFTMetadata } from 'types/token';
import type { Address } from 'crypto/address';
import type { LedgerPublicAddress } from 'types/ledger';
import { ConnectError } from 'config/errors';

export interface IWalletState {
  uuid: string;
  walletType: WalletTypes;
  walletName: string;
  authType: AuthMethod;
  accounts: IAccountState[];
  selectedAccount: number;
  tokens: IFTokenState[];
  nft: NFTMetadata[];
  history: IHistoricalTransactionState[];
  confirm: IConfirmState[];
  settings: IWalletSettingsState;
  defaultChainHash: number;
  vault?: string;
}

export class Wallet implements IWalletState {
  #session: Session;
  #vault: string;

  uuid: string;
  walletType: WalletTypes;
  walletName: string;
  authType: AuthMethod;
  accounts: Account[];
  selectedAccount: number;
  tokens: FToken[];
  nft: NFTMetadata[];
  history: HistoricalTransaction[];
  confirm: ConfirmState[];
  settings: WalletSettings;
  defaultChainHash: number;

  constructor(data: IWalletState) {
    this.walletType = data.walletType as WalletTypes;
    this.walletName = data.walletName as string;
    this.authType = data.authType as AuthMethod;
    this.accounts = (data.accounts).map(
      (a) => new Account(a)
    );
    this.selectedAccount = data.selectedAccount as number;
    this.tokens = (data.tokens).map(
      (t) => new FToken(t)
    );
    this.settings = new WalletSettings(data.settings);
    this.defaultChainHash = data.defaultChainHash as number;
    this.uuid = data.uuid as string;
    this.nft = data.nft ?? [];
    this.history = TypeOf.isArray(data.history) ? data.history.map((h) => new HistoricalTransaction(h)) : [];
    this.confirm = TypeOf.isArray(data.confirm) ? data.confirm.map((c) => new ConfirmState(c)) : [];
    this.#session = new Session(this.uuid);

    this.#vault = data.vault as string ?? "";
  }

  static async fromPrivateKey(
    keyPair: KeyPair,
    walletName: string,
    accountName: string,
    settings: WalletSettings,
    chain: ChainConfig,
    password: string,
  ) {
    const passwordBytes = utf8ToUint8Array(password);
    const account = await Account.fromPrivateKey(keyPair.privateKey, chain, accountName);
    const wallet = new Wallet({
      settings,
      walletName,
      walletType: WalletTypes.SecretKey,
      selectedAccount: 0,
      tokens: chain.ftokens,
      nft: [],
      defaultChainHash: chain.hash(),
      uuid: uuid(),
      accounts: [account],
      authType: AuthMethod.None,
      history: [],
      confirm: [],
    });

    await wallet.encrypt(passwordBytes, keyPair.privateKey);
    await wallet.setSession(keyPair.privateKey);

    return wallet;
  }

  static async fromWatchedAccount(
    address: Address,
    walletName: string,
    accountName: string,
    settings: WalletSettings,
    chain: ChainConfig,
  ) {
    const account = await Account.fromWatchAccount(address, chain, accountName);
    const wallet = new Wallet({
      settings,
      walletName,
      walletType: WalletTypes.Watch,
      selectedAccount: 0,
      tokens: chain.ftokens,
      nft: [],
      defaultChainHash: chain.hash(),
      uuid: uuid(),
      accounts: [account],
      authType: AuthMethod.None,
      history: [],
      confirm: [],
    });

    return wallet;
  }

  static async fromBip39(
    words: string,
    verifyCheckSum: boolean,
    walletName: string,
    bip32Accounts: Bip32Account[],
    settings: WalletSettings,
    chain: ChainConfig,
    password: string,
    wordList: string[],
    passphrase?: string
  ) {
    if (verifyCheckSum) {
      await Bip39.validateMnemonic(words, wordList);
    }

    const seed = await Bip39.mnemonicToSeed(words, passphrase);
    const wallet = new Wallet({
      settings,
      walletName,
      walletType: WalletTypes.SecretPhrase,
      selectedAccount: 0,
      tokens: chain.ftokens,
      nft: [],
      defaultChainHash: chain.hash(),
      uuid: uuid(),
      accounts: [],
      authType: AuthMethod.None,
      history: [],
      confirm: [],
    });
    const passwordBytes = utf8ToUint8Array(password);
    const wordsBytes = utf8ToUint8Array(words);

    wallet.accounts = await Promise.all(bip32Accounts.map((acc) => Account.fromBip39(acc, chain, seed)));
    await wallet.encrypt(passwordBytes, wordsBytes);
    await wallet.setSession(words);


    return wallet;
  }

  static async fromLedger(
    walletName: string,
    ledgerAccounts: LedgerPublicAddress[],
    settings: WalletSettings,
    chain: ChainConfig,
  ) {
    const wallet = new Wallet({
      settings,
      walletName,
      walletType: WalletTypes.Ledger,
      selectedAccount: 0,
      tokens: [],
      nft: [],
      defaultChainHash: chain.hash(),
      uuid: uuid(),
      accounts: [],
      authType: AuthMethod.None,
      history: [],
      confirm: [],
    });

    wallet.accounts = await Promise.all(
      ledgerAccounts.map((acc) => Account.fromLedger(acc, chain))
    );
    wallet.tokens = chain.ftokens.filter((t) => t.addrType == wallet.accounts[0].addrType);

    return wallet;
  }

  async decrypt(password: Uint8Array): Promise<Uint8Array | string> {
    const salt = await generateSalt();
    const keychain = await this.settings.hashFnParams.deriveKey(password, salt);
    const ciphertext = base64ToUint8Array(this.#vault);
    const decrypted = await keychain.decrypt(ciphertext, this.settings.cipherOrders);

    if (this.walletType == WalletTypes.SecretKey) {      
      return decrypted;
    } else if (this.walletType == WalletTypes.SecretPhrase) {
      let words = uint8ArrayToUtf8(decrypted);
      let words_list = words.split(" ");
      const count = words_list.length;

      if (count < 12) {
        throw new Error("invalid session");
      }

      return words;
    } else {
      throw new Error("unknown wallet type");
    }
  }

  async encrypt(password: Uint8Array, plaintext: Uint8Array) : Promise<Uint8Array>{
    const salt = await generateSalt();
    const keychain = await this.settings.hashFnParams.deriveKey(password, salt);
    const cipher = await keychain.encrypt(plaintext, this.settings.cipherOrders);

    this.#vault = uint8ArrayToBase64(cipher);

    return cipher;
  }

  async unlock(password: Uint8Array) {
    if (this.walletType == WalletTypes.Watch || this.walletType == WalletTypes.Ledger) {
      return;
    }

    const wordsOrKey = await this.decrypt(password);
    await this.setSession(wordsOrKey);
  }

  async revealKeypair(accountIndex: number, chain: ChainConfig): Promise<KeyPair> {
    switch (this.walletType) {
      case WalletTypes.SecretPhrase:
        const seed = await this.#session.getVault();
        return KeyPair.fromSeed(seed, chain.slip44, accountIndex);
      case WalletTypes.SecretKey:
        const privateKey = await this.#session.getVault();
        return KeyPair.fromPrivateKey(privateKey, chain.slip44);
      default:
        throw new Error(`Invalid wallet type ${WalletTypes[this.walletType]}`);
    }
  }

  async addAccountBip39(bip32Accounts: Bip32Account, chain: ChainConfig) {
    switch (this.walletType) {
      case WalletTypes.SecretPhrase:
        const seed = await this.#session.getVault();
        const nextAccount = await Account.fromBip39(bip32Accounts, chain, seed);

        this.accounts.push(nextAccount);
        break;
      default:
        throw new Error(`Invalid wallet type ${WalletTypes[this.walletType]}`);
    }
  }

  async revealKeypairWithSlip44(accountIndex: number, slip44: number): Promise<KeyPair> {
    switch (this.walletType) {
      case WalletTypes.SecretPhrase:
        const seed = await this.#session.getVault();
        return KeyPair.fromSeed(seed, slip44, accountIndex);
      case WalletTypes.SecretKey:
        const privateKey = await this.#session.getVault();
        return KeyPair.fromPrivateKey(privateKey, slip44);
      default:
        throw new Error(`Invalid wallet type ${WalletTypes[this.walletType]}`);
    }
  }

  async revealMnemonic(password: Uint8Array, chain: ChainConfig): Promise<string> {
    if (chain.hash() !== this.defaultChainHash) {
      throw new Error(ConnectError.DefaultChainNotValid);
    }

    switch (this.walletType) {
      case WalletTypes.SecretPhrase:
        const words = await this.decrypt(password);

        return String(words);
      default:
        throw new Error(`Invalid wallet type ${WalletTypes[this.walletType]}`);
    }
  }

  async setSession(wordsOrKey: string | Uint8Array) {
    if (this.walletType == WalletTypes.Watch || this.walletType == WalletTypes.Ledger) {
      return;
    }

    const sessionTime = this.settings.sessionTime;

    if (TypeOf.isString(wordsOrKey)) {
      const seed = await Bip39.mnemonicToSeed(String(wordsOrKey));

      await this.#session.setSession(sessionTime, seed);
    } else if (wordsOrKey instanceof Uint8Array) {
      await this.#session.setSession(sessionTime, wordsOrKey);
    } else {
      throw new Error("unk vault");
    }
  }

  async checkSession(): Promise<boolean> {
    if (this.walletType == WalletTypes.Watch || this.walletType == WalletTypes.Ledger) {
      return true;
    }

    try {
      await this.#session.getVault();
      return true;
    } catch {
      return false;
    }
  }

  async trhowSession(): Promise<void> {
    if (this.walletType == WalletTypes.Watch || this.walletType == WalletTypes.Ledger) {
      return;
    }

    const session = await this.#session.getVault();

    if (!session || session.length == 0) {
      throw new Error("Session expired");
    }
  }

  async clearSession() {
    await this.#session.clearSession();
  }

  get vault() {
    return this.#vault;
  }

  toJSON(): IWalletState {
    return {
      uuid: this.uuid,
      walletType: this.walletType,
      walletName: this.walletName,
      authType: this.authType,
      nft: this.nft,
      accounts: this.accounts.map(a => a.toJSON()),
      selectedAccount: this.selectedAccount,
      tokens: this.tokens.map(t => t.toJSON()),
      history: this.history.map(h => h.toJSON() as unknown as IHistoricalTransactionState),
      confirm: this.confirm.map(c => c.toJSON()),
      settings: this.settings.toJSON(),
      defaultChainHash: this.defaultChainHash,
      vault: this.#vault,
    };
  }
}
