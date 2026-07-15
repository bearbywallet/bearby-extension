import type { IFTokenState } from "background/storage";

export interface BuildTokenTransferParams {
  walletIndex: number;
  accountIndex: number;
  tokenAddr: string;
  to: string;
  amount: string;
}

export interface TransactionRequestScilla {
  chainId?: number;
  nonce?: string | number;
  gasPrice?: string | number;
  gasLimit?: string | number;
  priority?: boolean;
  code?: string;
  data?: string;
  toAddr: string;
  amount: string;
}

export interface TransactionReceiptScilla extends TransactionRequestScilla {
  hash: string;
  version: string;
  signature: string;
  nonce: string;
  senderPubKey: string;
  senderAddr: string;
  gasPrice: string;
  gasLimit: string;
  receipt?: {
    accepted: boolean;
    gas_used: string;
    cumulative_gas_used: string;
    cumulative_gas: string;
    epoch_num: string;
    event_logs?: unknown[];
    errors?: unknown;
    success?: boolean;
    exceptions?: {
      line: number;
      message: string;
    }[];
  };
}

export interface Authorization {
  chainId: number | string;
  address: string;
  nonce: number | string;
  yParity: number;
  r: string;
  s: string;
}

export interface TransactionRequestEVM {
  type?: TxType;
  nonce?: number;
  from?: string;
  to?: string;
  value?: string;
  gasLimit?: number;
  data?: string;
  chainId?: number;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  accessList?: AccessListItem[];
  blobVersionedHashes?: string[];
  maxFeePerBlobGas?: string;
  authorizationList?: Authorization[];
}

export interface Log {
  address: string;
  blockHash: string;
  blockNumber: string;
  blockTimestamp: string;
  data: string;
  logIndex: string;
  removed: boolean;
  topics: string[];
  transactionHash: string;
  transactionIndex: string;
}

export interface TransactionReceiptEVM {
  transactionHash: string;
  from: string;
  to: string;
  type: string;
  value: string;
  nonce: string;
  data?: string;
  chainId?: string;

  gas?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;

  r?: string;
  s?: string;
  yParity?: string;

  blockHash?: string;
  blockNumber?: string;
  status?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
  cumulativeGasUsed?: string;
  contractAddress?: string | null;
  logs?: Log[];
  logsBloom?: string;
  transactionIndex?: string;
}

export interface AccessListItem {
  address: string;
  storageKeys: string[];
}

export interface FTState extends IFTokenState {
  balances: undefined;
  value?: string;
  recipient?: string;
}

export interface TransactionMetadata {
  chainHash: number;
  icon?: string;
  title?: string;
  domain?: string;
  token: FTState;
}

export type SignedMessageKind = 'eth_sign' | 'personal_sign' | 'eip712' | 'scilla';

export interface SignedMessageReceipt {
  readonly kind: SignedMessageKind;
  readonly address: string;
  readonly signature: string;
  readonly message?: string;
  readonly typedDataJson?: string;
}

export interface SignMesageReqScilla {
  content: string;
  title: string;
  icon: string;
  domain: string;
  hash: string;
}

export interface SignMessageEVM {
  messageHash: string;
  address: string;
  domain: string;
  title: string;
  icon: string;
}

export interface SignPersonalMessageEVM {
  message: string;
  address: string;
  domain: string;
  title: string;
  icon: string;
}

export interface SignTypedDataEVM {
  hashStructMessage: string;
  domainSeparator: string;
  typedData: string;
  address: string;
  domain: string;
  title: string;
  icon: string;
}
