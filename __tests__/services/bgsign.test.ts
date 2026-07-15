import { describe, it, beforeEach, afterEach, vi, expect } from "vitest";
import { GlobalState } from "../../background/state";
import { startBackground } from "../../background/background";
import { BrowserStorage } from "../../lib/storage";
import "../setupTests";
import { messageManager } from "../setupTests";
import type { IKeyPair, WalletFromPrivateKeyParams } from "types/wallet";
import {
  BASE_SETTINGS,
  createBscTestNetConfig,
  createZilliqaTestnetConfig,
  IMPORTED_KEY,
  PASSWORD,
} from "__tests__/data";
import { ETHEREUM, ZILLIQA } from "config/slip44";
import { WalletSettings } from "background/storage";
import { ConfirmState } from "background/storage/confirm";
import {
  getGlobalState,
  walletFromPrivateKey,
} from "popup/background/wallet";
import {
  responseToEthSign,
  responseToSignPersonalMessageEVM,
  responseToSignTypedDataEVM,
  responseToSignMessageScilla,
} from "popup/background/sign-message";
import { KeyPair } from "crypto/keypair";
import { hexToUint8Array } from "lib/utils/hex";
import { TransactionStatus } from "config/tx";

describe("Signed message history recording", async () => {
  let globalState: GlobalState;
  const privateKey = hexToUint8Array(IMPORTED_KEY);
  const bscKeyPair: IKeyPair = await (
    await KeyPair.fromPrivateKey(privateKey, ETHEREUM)
  ).toJSON();
  const zilliqaKeyPair: IKeyPair = await (
    await KeyPair.fromPrivateKey(privateKey, ZILLIQA)
  ).toJSON();

  beforeEach(async () => {
    await BrowserStorage.clear();
    messageManager.onMessage.clearListeners();
    const statePromise = GlobalState.fromStorage();
    globalState = await statePromise;
    startBackground(statePromise);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function createBscWallet() {
    const BSC_CONFIG = createBscTestNetConfig();
    const params: WalletFromPrivateKeyParams = {
      key: bscKeyPair,
      walletName: "BSC Wallet",
      accountName: "BSC 0",
      chain: BSC_CONFIG,
      password: PASSWORD,
      settings: new WalletSettings(BASE_SETTINGS),
    };
    await walletFromPrivateKey(params);
    return BSC_CONFIG;
  }

  async function createZilWallet() {
    const ZIL_CONFIG = createZilliqaTestnetConfig();
    const params: WalletFromPrivateKeyParams = {
      key: zilliqaKeyPair,
      walletName: "ZIL Wallet",
      accountName: "ZIL 0",
      chain: ZIL_CONFIG,
      password: PASSWORD,
      settings: new WalletSettings(BASE_SETTINGS),
    };
    await walletFromPrivateKey(params);
    return ZIL_CONFIG;
  }

  it("records personal_sign history on approve", async () => {
    await createBscWallet();
    const wallet = globalState.state.wallets[0];
    const account = wallet.accounts[0];
    const uuid = "personal-sign-uuid";
    const message = "Hello personal_sign";

    wallet.confirm.push(
      new ConfirmState({
        uuid,
        signPersonalMessageEVM: {
          message,
          address: account.addr,
          domain: "dapp.example.com",
          title: "Example DApp",
          icon: "https://dapp.example.com/icon.png",
        },
      }),
    );
    await globalState.state.sync();

    expect(wallet.history).toHaveLength(0);

    await responseToSignPersonalMessageEVM(uuid, 0, 0, true);

    const state = await getGlobalState();
    const history = state.wallets[0].history;

    expect(state.wallets[0].confirm).toHaveLength(0);
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe(TransactionStatus.Success);
    expect(history[0].signedMessage?.kind).toBe("personal_sign");
    expect(history[0].signedMessage?.message).toBe(message);
    expect(history[0].signedMessage?.address).toBe(account.addr);
    expect(history[0].signedMessage?.signature).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(history[0].metadata.domain).toBe("dapp.example.com");
    expect(history[0].metadata.chainHash).toBe(account.chainHash);
  });

  it("does not record personal_sign history on reject", async () => {
    await createBscWallet();
    const wallet = globalState.state.wallets[0];
    const account = wallet.accounts[0];
    const uuid = "personal-sign-reject-uuid";

    wallet.confirm.push(
      new ConfirmState({
        uuid,
        signPersonalMessageEVM: {
          message: "reject me",
          address: account.addr,
          domain: "dapp.example.com",
          title: "Example DApp",
          icon: "",
        },
      }),
    );
    await globalState.state.sync();

    await responseToSignPersonalMessageEVM(uuid, 0, 0, false);

    const state = await getGlobalState();
    expect(state.wallets[0].confirm).toHaveLength(0);
    expect(state.wallets[0].history).toHaveLength(0);
  });

  it("records eip712 history on approve", async () => {
    await createBscWallet();
    const wallet = globalState.state.wallets[0];
    const account = wallet.accounts[0];
    const uuid = "eip712-uuid";
    const typedData = {
      types: {
        Mail: [
          { name: "from", type: "string" },
          { name: "to", type: "string" },
          { name: "contents", type: "string" },
        ],
      },
      primaryType: "Mail",
      domain: {
        name: "Ether Mail",
        version: "1",
        chainId: 1,
        verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
      },
      message: {
        from: "Alice",
        to: "Bob",
        contents: "Hello, Bob!",
      },
    };
    const typedDataJson = JSON.stringify(typedData);

    wallet.confirm.push(
      new ConfirmState({
        uuid,
        signTypedDataJsonEVM: {
          hashStructMessage: "0x00",
          domainSeparator: "0x00",
          typedData: typedDataJson,
          address: account.addr,
          domain: "typed.example.com",
          title: "Typed DApp",
          icon: "",
        },
      }),
    );
    await globalState.state.sync();

    await responseToSignTypedDataEVM(uuid, 0, 0, true);

    const state = await getGlobalState();
    const history = state.wallets[0].history;

    expect(history).toHaveLength(1);
    expect(history[0].signedMessage?.kind).toBe("eip712");
    expect(history[0].signedMessage?.typedDataJson).toBe(typedDataJson);
    expect(history[0].signedMessage?.signature).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(history[0].metadata.domain).toBe("typed.example.com");
  });

  it("does not record eip712 history on reject", async () => {
    await createBscWallet();
    const wallet = globalState.state.wallets[0];
    const account = wallet.accounts[0];
    const uuid = "eip712-reject-uuid";

    wallet.confirm.push(
      new ConfirmState({
        uuid,
        signTypedDataJsonEVM: {
          hashStructMessage: "0x00",
          domainSeparator: "0x00",
          typedData: JSON.stringify({
            types: { Mail: [{ name: "contents", type: "string" }] },
            primaryType: "Mail",
            domain: { name: "Ether Mail", version: "1", chainId: 1 },
            message: { contents: "x" },
          }),
          address: account.addr,
          domain: "typed.example.com",
          title: "Typed DApp",
          icon: "",
        },
      }),
    );
    await globalState.state.sync();

    await responseToSignTypedDataEVM(uuid, 0, 0, false);

    const state = await getGlobalState();
    expect(state.wallets[0].history).toHaveLength(0);
  });

  it("records eth_sign history on approve", async () => {
    await createBscWallet();
    const wallet = globalState.state.wallets[0];
    const account = wallet.accounts[0];
    const uuid = "eth-sign-uuid";
    const messageHash =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    wallet.confirm.push(
      new ConfirmState({
        uuid,
        signMessageEVM: {
          messageHash,
          address: account.addr,
          domain: "ethsign.example.com",
          title: "EthSign DApp",
          icon: "",
        },
      }),
    );
    await globalState.state.sync();

    await responseToEthSign(uuid, 0, 0, true);

    const state = await getGlobalState();
    const history = state.wallets[0].history;

    expect(history).toHaveLength(1);
    expect(history[0].signedMessage?.kind).toBe("eth_sign");
    expect(history[0].signedMessage?.message).toBe(messageHash);
    expect(history[0].signedMessage?.signature).toMatch(/^0x[0-9a-fA-F]+$/);
  });

  it("records scilla sign message history on approve", async () => {
    await createZilWallet();
    const wallet = globalState.state.wallets[0];
    const account = wallet.accounts[0];
    const uuid = "scilla-sign-uuid";
    const content = "Scilla hello";

    wallet.confirm.push(
      new ConfirmState({
        uuid,
        signMessageScilla: {
          content,
          title: "Scilla DApp",
          icon: "https://zil.example.com/icon.png",
          domain: "zil.example.com",
          hash: "0x" + "ab".repeat(32),
        },
      }),
    );
    await globalState.state.sync();

    await responseToSignMessageScilla(uuid, 0, 0, true);

    const state = await getGlobalState();
    const history = state.wallets[0].history;

    expect(history).toHaveLength(1);
    expect(history[0].signedMessage?.kind).toBe("scilla");
    expect(history[0].signedMessage?.message).toBe(content);
    expect(history[0].signedMessage?.address).toBe(account.addr);
    expect(history[0].signedMessage?.signature).toBeTruthy();
    expect(history[0].metadata.domain).toBe("zil.example.com");
  });

  it("does not record scilla sign message history on reject", async () => {
    await createZilWallet();
    const wallet = globalState.state.wallets[0];
    const uuid = "scilla-reject-uuid";

    wallet.confirm.push(
      new ConfirmState({
        uuid,
        signMessageScilla: {
          content: "reject",
          title: "Scilla DApp",
          icon: "",
          domain: "zil.example.com",
          hash: "0x" + "cd".repeat(32),
        },
      }),
    );
    await globalState.state.sync();

    await responseToSignMessageScilla(uuid, 0, 0, false);

    const state = await getGlobalState();
    expect(state.wallets[0].history).toHaveLength(0);
  });

  it("persists signed message history across state reload", async () => {
    await createBscWallet();
    const wallet = globalState.state.wallets[0];
    const account = wallet.accounts[0];
    const uuid = "persist-uuid";
    const message = "persist me";

    wallet.confirm.push(
      new ConfirmState({
        uuid,
        signPersonalMessageEVM: {
          message,
          address: account.addr,
          domain: "persist.example.com",
          title: "Persist DApp",
          icon: "",
        },
      }),
    );
    await globalState.state.sync();
    await responseToSignPersonalMessageEVM(uuid, 0, 0, true);

    const reloaded = await GlobalState.fromStorage();
    const history = reloaded.state.wallets[0].history;

    expect(history).toHaveLength(1);
    expect(history[0].signedMessage?.kind).toBe("personal_sign");
    expect(history[0].signedMessage?.message).toBe(message);
    expect(history[0].status).toBe(TransactionStatus.Success);
  });
});
