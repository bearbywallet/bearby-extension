import type { BackgroundState } from "background/storage";
import { LegacyZilliqaTabMsg, type StreamResponse } from "lib/streem";
import { ConfirmState, type IConfirmState } from "background/storage/confirm";
import type { BuildTokenTransferParams, FTState, TransactionMetadata } from "types/tx";
import { uuid } from "crypto/uuid";
import { processTokenLogo } from "lib/popup/url";
import { AddressType, WalletTypes } from "config/wallet";
import { generateErc20TransferData, NetworkProvider } from "background/rpc";
import { SignedTransaction, TransactionRequest } from "crypto/tx";
import { ZILTransactionRequest } from "crypto/zilliqa_tx";
import { Address } from "crypto/address";
import { hexToUint8Array, uint8ArrayToHex } from "lib/utils/hex";
import { ETHEREUM } from "config/slip44";
import type { WorkerService } from "./worker";
import { TransactionStatus } from "config/tx";
import { TabsMessage } from "lib/streem/tabs-message";
import { MTypePopup } from "config/stream";
import { ConnectError } from "config/errors";
import { bip32asUInt8Array } from "ledger/bip32";
import { HRP } from "lib/zilliqa";
import { createStepLogger } from "lib/utils/debug-log";


const logTxStep = createStepLogger("TransactionService");

export class TransactionService {
  #state: BackgroundState;
  #worker: WorkerService;

  constructor(state: BackgroundState, worker: WorkerService) {
    this.#state = state;
    this.#worker = worker;
  }

  async updateTransactionsHistory(walletIndex: number, sendResponse: StreamResponse) {
    try {
      const wallet = this.#state.wallets[walletIndex];
      const account = wallet.accounts[wallet.selectedAccount];
      const chainConfig = this.#state.getChain(account.chainHash)!;
      const provider = new NetworkProvider(chainConfig);
      const pendingTransactions = wallet.history.filter(
        (tx) => (tx.status === TransactionStatus.Pending && tx.metadata.chainHash == account.chainHash)
      );

      await provider.updateTransactionsHistory(pendingTransactions, this.#worker.notifier);
      await this.#state.sync();

      sendResponse({
        resolve: wallet.history,
      });
    } catch (err) {
      sendResponse({
        reject: String(err),
      });
    }
  }

  async genRLPTx(confirmIndex: number, walletIndex: number, accountIndex: number, sendResponse: StreamResponse, path?: string) {
    try {
      const wallet = this.#state.wallets[walletIndex];
      await wallet.trhowSession();
      const account = wallet.accounts[accountIndex];
      const confirm= wallet.confirm[confirmIndex];
      const metadata  = confirm.metadata!; 
      const scilla = confirm.scilla ? ZILTransactionRequest.from(confirm.scilla) : undefined;
      const evm = confirm.evm;
      const txReq = new TransactionRequest(metadata, scilla, evm);
      const pubKeyBytes = hexToUint8Array(account.pubKey);
      const derivationPath = path ? bip32asUInt8Array(path) : undefined;
      const rlp = await txReq.toRLP(pubKeyBytes, derivationPath);

      sendResponse({
        resolve: rlp.map((chunk) => uint8ArrayToHex(chunk)),
      });
    } catch (err) {
      console.error(err);
      sendResponse({ reject: String(err) });
    }
  }

  async signTxAndbroadcastJsonRPC(confirmIndex: number, walletIndex: number, accountIndex: number, sendResponse: StreamResponse, sig?: string) {
    try {
      logTxStep("start", {
        confirmIndex,
        walletIndex,
        accountIndex,
        hasSig: Boolean(sig),
      });

      const wallet = this.#state.wallets[walletIndex];
      await wallet.trhowSession();
      const account = wallet.accounts[accountIndex];
      const confirm = wallet.confirm[confirmIndex];

      const chainConfig = this.#state.getChain(account.chainHash)!;
      const defaultChainConfig = this.#state.getChain(wallet.defaultChainHash)!;

      const provider = new NetworkProvider(chainConfig);
      const metadata = confirm.metadata!;
      const scilla = confirm.scilla ? ZILTransactionRequest.from(confirm.scilla) : undefined;
      const evm = confirm.evm;
      const txReq = new TransactionRequest(metadata, scilla, evm);

      logTxStep("context-loaded", {
        walletType: wallet.walletType,
        accountAddr: account.addr,
        accountAddrType: account.addrType,
        accountSlip44: account.slip44,
        accountChainHash: account.chainHash,
        accountIndex: account.index,
        hasPubKey: Boolean(account.pubKey),
        pubKeyLen: account.pubKey?.length ?? 0,
        chainConfigSlip44: chainConfig.slip44,
        chainConfigChainId: chainConfig.chainId,
        chainConfigChainIds: chainConfig.chainIds,
        defaultChainSlip44: defaultChainConfig.slip44,
        defaultChainChainId: defaultChainConfig.chainId,
        hasScilla: Boolean(scilla),
        hasEvm: Boolean(evm),
      });

      let signedTx: SignedTransaction;

      if (wallet.walletType == WalletTypes.Ledger && sig) {
        logTxStep("ledger-path", {
          walletType: wallet.walletType,
          sigLen: sig.length,
        });
        signedTx = await txReq.withSignature(sig, account.pubKey);
        await signedTx.verify();
        logTxStep("ledger-signed-and-verified", {});
      } else {
        const allSlip44s = new Set(this.#state.chains.map((c) => c.slip44));
        const intendedSigningType = scilla ? ("schnorr" as const) : ("eip191" as const);
        const keyPair = await wallet.resolveKeypair(
          account.index,
          chainConfig,
          allSlip44s,
          intendedSigningType,
        );

        logTxStep("signing", {
          keyPairSlip44: keyPair.slip44,
          txType: scilla ? "scilla" : evm ? "evm" : "unknown",
        });
        signedTx = await txReq.sign(keyPair);
        logTxStep("signed", { transactionType: scilla ? "scilla" : "evm" });
      }

      logTxStep("broadcasting", {
        transactionType: scilla ? "scilla" : "evm",
        domain: confirm.metadata?.domain,
      });

      const [history] = await provider.broadcastSignedTransactions([signedTx]);

      this.#state.wallets[walletIndex].history.push(history);
      this.#state.wallets[walletIndex].confirm.splice(confirmIndex, 1);
      await this.#state.sync();

      logTxStep("broadcast-success", {
        txHash: history.scilla?.hash ?? history.evm?.transactionHash,
        confirmRemaining: wallet.confirm.length,
      });

      if (confirm && confirm.scilla && confirm.uuid && confirm.metadata?.domain) {
        new TabsMessage({
          type: LegacyZilliqaTabMsg.TX_RESULT,
          uuid: confirm.uuid,
          payload: {
           resolve:  history.scilla,
          },
        }).send(confirm.metadata?.domain);
      } else if (confirm && confirm.evm && confirm.uuid && confirm.metadata?.domain) {
        new TabsMessage({
          type: MTypePopup.EVM_RESPONSE,
          uuid: confirm.uuid,
          payload: {
            result: history.evm?.transactionHash,
          },
        }).send(confirm.metadata?.domain);
      }

      sendResponse({
        resolve: history,
      });
    } catch (err) {
      logTxStep("error", {
        confirmIndex,
        walletIndex,
        accountIndex,
        error: String(err),
      });
      sendResponse({ reject: String(err) });
    }
  }

  async buildTokenTransfer(payload: BuildTokenTransferParams, sendResponse: StreamResponse) {
    try {
      const wallet = this.#state.wallets[payload.walletIndex];
      const account = wallet.accounts[payload.accountIndex];
      const token = wallet.tokens.find(t => t.addr.toLowerCase() === payload.tokenAddr.toLowerCase());
      const chain = this.#state.getChain(account.chainHash);

      if (!token || !chain) {
        throw new Error("Token or chain not found");
      }

      const amountBigInt = BigInt(payload.amount);
      const isNative = token.native;
      const tokenMetadata: FTState = {
        ...token,
        balances: undefined,
        value: payload.amount,
        recipient: payload.to,
      };
      const metadata: TransactionMetadata = {
        chainHash: account.chainHash,
        token: tokenMetadata,
        title: `Send ${token.symbol}`, // TODO: change title.
        icon: processTokenLogo({ token, theme: this.#state.appearances }),
      }

      const confirmTx: IConfirmState = {
        uuid: uuid(),
        metadata,
      };

      if (token.addr.startsWith(HRP) && token.addrType === AddressType.Bech32) {
        const chainId = token.addrType == AddressType.Bech32 ? chain.chainIds[1] : chain.chainIds[0];
        const to = Address.fromStr(payload.to);

        if (isNative) {
          confirmTx.scilla = {
            chainId,
            toAddr: to.toBase16(),
            amount: amountBigInt.toString(),
            gasLimit: 50,
          };
        } else {
          const tokenAddr = Address.fromStr(token.addr);
          confirmTx.scilla = {
            chainId,
            toAddr: tokenAddr.toBase16(),
            amount: '0',
            gasLimit: 5000,
            data: JSON.stringify({
              _tag: 'Transfer',
              params: [
                { vname: 'to', type: 'ByStr20', value: (await to.toZilChecksum()).toLowerCase() },
                { vname: 'amount', type: 'Uint128', value: amountBigInt.toString() }
              ]
            })
          };
        }
      } else if (token.addrType === AddressType.EthCheckSum) {
        const evmAddr = await Address.fromPubKey(hexToUint8Array(account.pubKey), ETHEREUM);

        if (isNative) {
          confirmTx.evm = {
            from: await evmAddr.toEthChecksum(),
            to: payload.to,
            value: amountBigInt.toString(),
            chainId: chain.chainId,
          };
        } else {
          confirmTx.evm = {
            from: await evmAddr.toEthChecksum(),
            to: token.addr,
            value: '0',
            data: generateErc20TransferData(payload.to, amountBigInt),
            chainId: chain.chainId,
          };
        }
      }

      wallet.confirm.push(new ConfirmState(confirmTx));
      await this.#state.sync();

      sendResponse({ resolve: this.#state });
    } catch (err) {
      sendResponse({ reject: String(err) });
    }
  }

  async reject(index: number, walletIndex: number, sendResponse: StreamResponse) {
    try {
      const wallet = this.#state.wallets[walletIndex];
      await wallet.trhowSession();
      const confirm = wallet.confirm[index];

      wallet.confirm.splice(index, 1);
      await this.#state.sync();

      if (confirm  && confirm.scilla && confirm.uuid && confirm.metadata?.domain) {
        new TabsMessage({
          type: LegacyZilliqaTabMsg.TX_RESULT,
          uuid: confirm.uuid,
          payload: {
           reject: ConnectError.UserRejected, 
          },
        }).send(confirm.metadata?.domain);
      } else if (confirm && confirm.evm && confirm.uuid && confirm.metadata?.domain) {
        new TabsMessage({
          type: MTypePopup.EVM_RESPONSE,
          uuid: confirm.uuid,
          payload: {
            error: {
              message: ConnectError.UserRejected,
              code: 4001,
              data: null,
            }
          },
        }).send(confirm.metadata?.domain);
      }

      sendResponse({
        resolve: true,
      });
    } catch (err) {
      sendResponse({
        reject: String(err),
      });
    }
  }

  async estimateGas(confirmIndex: number, walletIndex: number, accountIndex: number, sendResponse: StreamResponse) {
    try {
      const wallet = this.#state.wallets[walletIndex];
      await wallet.trhowSession();
      const account = wallet.accounts[accountIndex];
      const confirm= wallet .confirm[confirmIndex];
      const chainConfig = this.#state.getChain(account.chainHash)!;
      const provider = new NetworkProvider(chainConfig);
      const metadata  = confirm.metadata!; 
      const scilla = confirm.scilla ? ZILTransactionRequest.from(confirm.scilla) : undefined;
      const sender = await Address.fromPubKeyType(hexToUint8Array(account.pubKey), confirm.metadata!.token.addrType);
      const evm = confirm.evm;

      if (evm && confirm.evm?.to) {
        const addr = Address.fromStr(confirm.evm?.to);
        evm.to = await addr.toEthChecksum();
      }

      const txReq = new TransactionRequest(metadata, scilla, evm);
      const gas = await provider.estimateGasParamsBatch(txReq, sender, 4, null);

      sendResponse({
        resolve: {
          gasPrice: gas.gasPrice.toString(),
          maxPriorityFee: gas.maxPriorityFee.toString(),
          feeHistory: {
            maxFee: gas.feeHistory.maxFee.toString(),
            priorityFee: gas.feeHistory.priorityFee.toString(),
            baseFee: gas.feeHistory.baseFee.toString(),
          },
          txEstimateGas: gas.txEstimateGas.toString(),
          blobBaseFee: gas.blobBaseFee.toString(),
          nonce: gas.nonce,
        },
      });
    } catch (err) {
      sendResponse({
        reject: String(err),
      });
    }
  }
}

