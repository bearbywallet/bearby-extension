import type { IFTokenState } from "background/storage";
import { ZILLIQA } from "config/slip44";
import { TransactionStatus } from "config/tx";
import { Address } from "crypto/address";
import type { SignedTransaction } from "crypto/tx";
import { chainIdFromVersion } from "crypto/zilliqa_tx";
import { HEX_PREFIX, hexToUint8Array, uint8ArrayToHex } from "lib/utils/hex";
import type { TxType } from "micro-eth-signer/core/tx-internal";
import type {
  SignedMessageReceipt,
  TransactionMetadata,
  TransactionReceiptEVM,
  TransactionReceiptScilla,
} from "types/tx";

export const typeMap: Record<string, TxType> = {
  '0x0': 'legacy',
  '0x1': 'eip2930',
  '0x2': 'eip1559',
  '0x3': 'eip4844',
  '0x4': 'eip7702',
  '0': 'legacy',
  '1': 'eip2930',
  '2': 'eip1559',
  '3': 'eip4844',
  '4': 'eip7702',
};

export interface SignedMessageDappMeta {
  readonly domain?: string;
  readonly title?: string;
  readonly icon?: string;
}

export interface IHistoricalTransactionState {
  status: TransactionStatus;
  metadata: TransactionMetadata;
  evm?: TransactionReceiptEVM;
  scilla?: TransactionReceiptScilla;
  signedMessage?: SignedMessageReceipt;
  timestamp: number;
}

export class HistoricalTransaction implements IHistoricalTransactionState {
  status: TransactionStatus;
  metadata: TransactionMetadata;
  evm?: TransactionReceiptEVM;
  scilla?: TransactionReceiptScilla;
  signedMessage?: SignedMessageReceipt;
  timestamp: number;

  constructor(data: IHistoricalTransactionState) {
    this.status = data.status;
    this.metadata = data.metadata;
    this.evm = data.evm;
    this.scilla = data.scilla;
    this.signedMessage = data.signedMessage;
    this.timestamp = data.timestamp;
  }

  toJSON(): IHistoricalTransactionState {
    return {
      status: this.status,
      metadata: this.metadata,
      evm: this.evm,
      scilla: this.scilla,
      signedMessage: this.signedMessage,
      timestamp: this.timestamp,
    };
  }

  static createSignedMessageMetadata(
    chainHash: number,
    dapp: SignedMessageDappMeta,
    nativeToken: IFTokenState,
  ): TransactionMetadata {
    return {
      chainHash,
      domain: dapp.domain,
      title: dapp.title || dapp.domain,
      icon: dapp.icon,
      token: {
        ...nativeToken,
        balances: undefined,
      },
    };
  }

  static fromSignedMessage(
    metadata: TransactionMetadata,
    signedMessage: SignedMessageReceipt,
  ): HistoricalTransaction {
    return new HistoricalTransaction({
      status: TransactionStatus.Success,
      metadata,
      signedMessage,
      timestamp: Date.now(),
    });
  }

  static async fromSignedTransaction(
    signedTx: SignedTransaction, 
    hash: string
  ): Promise<HistoricalTransaction> {
    const commonData = {
      status: TransactionStatus.Pending,
      metadata: signedTx.metadata,
      timestamp: Date.now(),
    };

    if (signedTx.scilla) {
      const scillaData = await signedTx.scilla.toJSON();
      const senderPubKey = uint8ArrayToHex(signedTx.scilla.pubKey);
      const senderAddr = await Address.fromPubKey(
        signedTx.scilla.pubKey, 
        ZILLIQA
      );

      const historicalScilla: TransactionReceiptScilla = {
        ...scillaData,
        hash,
        senderPubKey,
        senderAddr: await senderAddr.toZilBech32(),
        version: String(scillaData.version),
        nonce: String(scillaData.nonce),
        receipt: undefined,
      };
    
      return new HistoricalTransaction({
        ...commonData,
        scilla: historicalScilla,
      });
    } else if (signedTx.evm) {
      const sender = signedTx.evm.recoverSender();
      const raw = signedTx.evm.raw;
      const historicalEvm: TransactionReceiptEVM = {
        transactionHash: hash,
        from: sender.address,
        to: raw.to,
        type: String(signedTx.evm.type),
        value: raw.value.toString(),
        nonce: raw.nonce.toString(),
        data: raw.data?.toString(),
        chainId: raw.chainId?.toString(),
        r: raw.r?.toString(),
        s: raw.s?.toString(),
        yParity: raw.yParity?.toString(),
      };

      if ('data' in raw && raw.data) {
        historicalEvm.data = raw.data.toString();
      }
      if ('gasLimit' in raw && raw.gasLimit) {
        historicalEvm.gasLimit = raw.gasLimit.toString();
      }
      if ('gasPrice' in raw && raw.gasPrice) {
        historicalEvm.gasPrice = raw.gasPrice.toString();
      }
      if ('maxFeePerGas' in raw && raw.maxFeePerGas) {
        historicalEvm.maxFeePerGas = raw.maxFeePerGas.toString();
      }
      if ('maxPriorityFeePerGas' in raw && raw.maxPriorityFeePerGas) {
        historicalEvm.maxPriorityFeePerGas = raw.maxPriorityFeePerGas.toString();
      }

      return new HistoricalTransaction({
        ...commonData,
        evm: historicalEvm,
      });
    }

    throw new Error("Invalid SignedTransaction: missing scilla or evm");
  }

  async updateFromJsonRPCResult(result: unknown): Promise<void> {
    if (!result) {
      throw new Error("Invalid result");
    }

    if (this.scilla) {
      const data = result as any;
      
      this.scilla = {
        hash: HEX_PREFIX + data.ID,
        version: data.version,
        nonce: data.nonce,
        toAddr: data.toAddr,
        amount: data.amount,
        gasPrice: data.gasPrice,
        gasLimit: data.gasLimit,
        code: data.code || "",
        data: data.data || "",
        senderPubKey: data.senderPubKey,
        signature: data.signature,
        priority: this.scilla.priority ?? false,
        senderAddr: "",
        receipt: data.receipt,
        chainId: chainIdFromVersion(Number(data.version)),
      };

      if (this.scilla.senderPubKey) {
        const pubKeyBytes = hexToUint8Array(this.scilla.senderPubKey);
        const addr = await Address.fromPubKey(pubKeyBytes, ZILLIQA);
        this.scilla.senderAddr = await addr.toZilBech32();
      }

      this.status = this.scilla.receipt?.success 
        ? TransactionStatus.Success 
        : TransactionStatus.Failed;
    } else if (this.evm) {
      const data = result as TransactionReceiptEVM;
    
      this.evm = {
        ...this.evm,
        blockHash: data.blockHash,
        blockNumber: BigInt(data.blockNumber ?? 0).toString(),
        contractAddress: data.contractAddress,
        cumulativeGasUsed: BigInt(data.cumulativeGasUsed ?? 0).toString(),
        effectiveGasPrice: BigInt(data.effectiveGasPrice ?? 0).toString(),
        from: data.from,
        gasUsed: BigInt(data.gasUsed ?? 0).toString(),
        logs: data.logs,
        logsBloom: data.logsBloom,
        status: data.status,
        to: data.to,
        transactionHash: data.transactionHash,
        transactionIndex: data.transactionIndex,
        type: typeMap[String(data.type)],
      };

      this.status = data.status === "0x1" 
        ? TransactionStatus.Success 
        : TransactionStatus.Failed;
    }
  }
}

