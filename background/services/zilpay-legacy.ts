import { Signature } from "@noble/secp256k1";
import { NetworkProvider, type JsonRPCRequest } from "background/rpc";
import type { BackgroundState } from "background/storage";
import { ConfirmState } from "background/storage/confirm";
import { ConnectError } from "config/errors";
import { WalletTypes } from "config/wallet";
import { Address } from "crypto/address";
import { sha256 } from "crypto/sha256";
import { verify } from "crypto/zilliqa/schnorr";
import { PromptService } from "lib/popup/prompt";
import { LegacyZilliqaTabMsg, type StreamResponse } from "lib/streem";
import { TabsMessage } from "lib/streem/tabs-message";
import { hexToUint8Array, uint8ArrayToHex } from "lib/utils/hex";
import { utf8ToUint8Array } from "lib/utils/utf8";
import type { SignMesageReqScilla, TransactionRequestScilla } from "types/tx";


export class ZilPayLegacyService {
  #state: BackgroundState;

  constructor(state: BackgroundState) {
    this.#state = state;
  }

  async signTx(uuid: string, domain: string, payload: TransactionRequestScilla, title: string, icon: string, sendResponse: StreamResponse) {
    try {

      const isConnected = this.#state.connections.isConnected(domain);

      if (!isConnected) {
        throw new Error(ConnectError.WalletNotConnected);
      }

      const wallet = this.#state.wallets[this.#state.selectedWallet];

      if (!wallet) {
        throw new Error(ConnectError.WalletNotFound);
      }

      await wallet.trhowSession();

      const account = wallet.accounts[wallet.selectedAccount];

      const chain = this.#state.getChain(account.chainHash);

      wallet.confirm.push(new ConfirmState({
        uuid: uuid,
        scilla: {
          ...payload,
          chainId: chain!.chainIds[1],
          gasLimit: Number(payload.gasLimit ?? 0),
          gasPrice: Number(payload.gasPrice ?? 0),
        },
        metadata: {
          title,
          icon,
          domain,
          chainHash: account.chainHash,
          token: {
            ...chain!.ftokens[1],
            balances: undefined,
          },
        }
      }));

      await this.#state.sync();

      new PromptService().open("/confirm");

      sendResponse({ resolve: true, });
    } catch (e) {
        new TabsMessage({
          type: LegacyZilliqaTabMsg.TX_RESULT,
          uuid,
          payload: {
           reject: String(e), 
          },
        }).send(domain);
      sendResponse({ reject: String(e) });
    }
  }

  async jsonRPCProxy(domain: string, payload: JsonRPCRequest | JsonRPCRequest[], sendResponse: StreamResponse) {
    try {
      const isConnected = this.#state.connections.isConnected(domain);

      if (!isConnected) {
        throw new Error(ConnectError.WalletNotConnected);
      }

      const wallet = this.#state.wallets[this.#state.selectedWallet];

      if (!wallet) {
        throw new Error(ConnectError.WalletNotFound);
      }

      const selectedAccount = wallet.accounts[wallet.selectedAccount];
      const chain = this.#state.getChain(selectedAccount.chainHash);
      const provider = new NetworkProvider(chain!);
      const res = await provider.proxyReq(payload);

      sendResponse({ resolve: res, });
    } catch (e) {
      sendResponse({ reject: String(e) });
    }
  }

  async signMessage(uuid: string, domain: string, content: string, title: string, icon: string, sendResponse: StreamResponse) {
    try {
      const isConnected = this.#state.connections.isConnected(domain);

      if (!isConnected) {
        throw new Error(ConnectError.WalletNotConnected);
      }

      const wallet = this.#state.wallets[this.#state.selectedWallet];

      if (!wallet) {
        throw new Error(ConnectError.WalletNotFound);
      }
      
      await wallet.trhowSession();
      const messageBytes = utf8ToUint8Array(content);
      const messageScilla: SignMesageReqScilla = {
        content,
        icon,
        domain,
        title,
        hash: uint8ArrayToHex(await sha256(messageBytes)),
      };
      wallet.confirm.push(new ConfirmState({
        uuid: uuid,
        signMessageScilla: messageScilla,
      }));
      await this.#state.sync();
      new PromptService().open("/sign-message");

      sendResponse({ resolve: true, });
    } catch (e) {
        new TabsMessage({
          type: LegacyZilliqaTabMsg.SING_MESSAGE_RES,
          uuid ,
          payload: {
           reject: String(e), 
          },
        }).send(domain);
      sendResponse({ reject: String(e) });
    }
  }

  async signMessageRes(
    uuid: string,
    walletIndex: number,
    accountIndex: number,
    approve: boolean,
    sendResponse: StreamResponse,
    sig?: string,
  ) {
    try {
      const wallet = this.#state.wallets[walletIndex];

      if (!wallet) {
        throw new Error(ConnectError.WalletNotFound);
      }

      await wallet.trhowSession();

      const account = wallet.accounts[accountIndex];
      const scillaMessage = wallet.confirm.find((c) => c.uuid == uuid);

      if (!scillaMessage || !scillaMessage.signMessageScilla) {
        throw new Error(`not found ${uuid}`);
      }

      if (!approve) {
        new TabsMessage({
          type: LegacyZilliqaTabMsg.SING_MESSAGE_RES,
          uuid: scillaMessage.uuid,
          payload: {
           reject: ConnectError.UserRejected, 
          },
        }).send(scillaMessage.signMessageScilla.domain);
      } else {
        let signature: string;

        if (wallet.walletType == WalletTypes.Ledger && sig) {
          const sigBytes = hexToUint8Array(sig);
          const hash = hexToUint8Array(scillaMessage.signMessageScilla.hash);
          const pubKeyBytes = hexToUint8Array(account.pubKey);
          const isvalid = await verify(hash, pubKeyBytes, Signature.fromBytes(sigBytes))
          if (!isvalid) {
            throw new Error(ConnectError.InvalidSig);
          }
          signature = sig;
        } else {
          const defaultChainConfig = this.#state.getChain(wallet.defaultChainHash)!;

          const allSlip44s = new Set(this.#state.chains.map((c) => c.slip44));
          const keyPair = await wallet.resolveKeypair(
            account.index,
            defaultChainConfig,
            allSlip44s,
            "schnorr",
          );

          const hashBytes = hexToUint8Array(scillaMessage.signMessageScilla.hash);
          const sig = await keyPair.signMessage(hashBytes);

          signature = uint8ArrayToHex(sig);
        }

        new TabsMessage({
          type: LegacyZilliqaTabMsg.SING_MESSAGE_RES,
          uuid: scillaMessage.uuid,
          payload: {
           resolve: {
             signature: signature,
              message: scillaMessage.signMessageScilla.content,
              publicKey: account.pubKey,
           }, 
          },
        }).send(scillaMessage.signMessageScilla.domain);
      }

      wallet.confirm = wallet.confirm.filter(c => c.uuid !== uuid);
      await this.#state.sync();

      sendResponse({ resolve: wallet.confirm, });
    } catch (e) {
      sendResponse({ reject: String(e) });
    }
  }

  async getData(domain: string, sendResponse: StreamResponse) {
    try {
      const wallet = this.#state.wallets[this.#state.selectedWallet];
      const emptyResponse = {
        account: null,
        network: null,
        http: null,
        nativeHttp: null,
        isConnect: false,
        isEnable: Boolean(wallet),
      };

      if (!wallet) {
        throw new Error(ConnectError.WalletNotFound);
      }

      const isSession = await wallet.checkSession();

      if (!wallet || !isSession) {
        sendResponse({ resolve: emptyResponse });
        return;
      }

      const selectedAccount = wallet.accounts[wallet.selectedAccount];
      if (!selectedAccount) {
        sendResponse({ resolve: emptyResponse });
        return;
      }

      const chain = this.#state.getChain(selectedAccount.chainHash);
      if (!chain || !chain.rpc[0]) {
        sendResponse({ resolve: emptyResponse });
        return;
      }

      const isConnected = this.#state.connections.isConnected(domain);
      let account = null;

      if (isConnected) {
        const addr = Address.fromStr(selectedAccount.addr.split(":")[0]);
        account = {
          base16: await addr.toZilChecksum(),
          bech32: await addr.toZilBech32(),
        };
      }

      sendResponse({
        resolve: {
          account,
          network: chain.testnet ? "testnet" : "mainnet",
          http: chain.rpc[0],
          nativeHttp: chain.rpc[0],
          isConnect: isConnected,
          isEnable: true,
        }
      });
    } catch (e) {
      sendResponse({ reject: String(e) });
    }
  }
}
