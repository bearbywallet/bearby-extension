import { createContract } from 'micro-eth-signer/advanced/abi.js';
import { RpcError, RpcProvider, type JsonRPCRequest, type JsonRPCResponse } from './provider';
import { EvmMethods, ZilMethods } from 'config/jsonrpc';
import { hexToBigInt, hexToUint8Array, uint8ArrayToHex } from 'lib/utils/hex';
import { Address } from 'crypto/address';
import { TypeOf } from 'lib/types';
import { AddressType } from 'config/wallet';
import type { QueryAccount } from './query_account';

const ERC20_ABI = [
  { name: 'name', type: 'function', outputs: [{ type: 'string' }] },
  { name: 'symbol', type: 'function', outputs: [{ type: 'string' }] },
  { name: 'decimals', type: 'function', outputs: [{ type: 'uint8' }] },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

export enum MetadataField {
  Name = 'name',
  Symbol = 'symbol',
  Decimals = 'decimals',
}

type FunctionName = 'name' | 'symbol' | 'decimals' | 'balanceOf' | 'transfer';
type FunctionArgs = {
  name: [];
  symbol: [];
  decimals: [];
  balanceOf: [string];
  transfer: [string, bigint];
};

export type RequestType =
  | { type: 'Metadata'; field: MetadataField; address?: Address }
  | { type: 'Balance'; address: Address, addrHash: number, };

export interface GetTokenInitItem {
  vname: string;
  type: string;
  value: string;
}

export interface ZilBalanceResponse {
  balance: string;
  nonce: number;
}

export interface ZilSmartContractSubStateResponse {
  balances: {
    [key: string]: string;
  };
}

function validateResponse<T>(response: JsonRPCResponse<T>, ignore: number[] = []): T {
  if (response.error) {
    if (ignore.includes(response.error.code)) {
      return null as T;
    }
    throw new RpcError(
      response.error.message,
      response.error.code,
      response.error.data,
    );
  }
  if (TypeOf.isUndefined(response.result)) {
    throw new RpcError('Bad Res', -32603);
  }

  return response.result as T;
}

export class ERC20Helper {
  readonly #contract;

  constructor() {
    this.#contract = createContract(ERC20_ABI);
  }

  encodeFunctionCall<T extends FunctionName>(
    functionName: T,
    args: FunctionArgs[T],
  ): string {
    let encodedData: Uint8Array;

    switch (functionName) {
      case 'name':
        encodedData = this.#contract.name.encodeInput();
        break;
      case 'symbol':
        encodedData = this.#contract.symbol.encodeInput();
        break;
      case 'decimals':
        encodedData = this.#contract.decimals.encodeInput();
        break;
      case 'balanceOf':
        encodedData = this.#contract.balanceOf.encodeInput(String(args[0]));
        break;
      case 'transfer':
        encodedData = this.#contract.transfer.encodeInput({
          recipient: String(args[0]),
          amount: BigInt(args[1] ?? 0), 
        });
        break;
      default:
        throw new Error(`Unsupported function: ${functionName}`);
    }

    return uint8ArrayToHex(encodedData, true);
  }

  decodeFunctionOutput(functionName: FunctionName, data: string) {
    const bytes = hexToUint8Array(data);

    switch (functionName) {
      case 'name':
        return this.#contract.name.decodeOutput(bytes);
      case 'symbol':
        return this.#contract.symbol.decodeOutput(bytes);
      case 'decimals':
        return this.#contract.decimals.decodeOutput(bytes);
      case 'balanceOf':
        return this.#contract.balanceOf.decodeOutput(bytes);
      case 'transfer':
        return this.#contract.transfer.decodeOutput(bytes);
      default:
        throw new Error(`Unsupported function: ${functionName}`);
    }
  }

  public generateTransferInput(to: string, amount: bigint): string {
    return this.encodeFunctionCall('transfer', [to, amount]);
  }
}

export function generateErc20TransferData(to: string, amount: bigint): string {
  const erc20 = new ERC20Helper();
  return erc20.generateTransferInput(to, amount);
}

export async function buildTokenRequests(
  contract: Address,
  accounts: readonly QueryAccount[],
  native: boolean,
): Promise<{ payload: JsonRPCRequest; requestType: RequestType }[]> {
  const requests: { payload: JsonRPCRequest; requestType: RequestType }[] = [];

  if (contract.type === AddressType.Bech32) {
    await buildZilRequests(contract, accounts, native, requests);
  } else if (contract.type === AddressType.EthCheckSum) {
    await buildEthRequests(contract, accounts, native, requests);
  }

  return requests;
}

export async function buildMetadataOnlyRequests(
  contract: Address,
): Promise<{ payload: JsonRPCRequest; requestType: RequestType; contractAddr: string }[]> {
  const requests: { payload: JsonRPCRequest; requestType: RequestType; contractAddr: string }[] = [];

  if (contract.type === AddressType.Bech32) {
    const base16Contract = contract.toBase16();
    requests.push({
      payload: RpcProvider.buildPayload(ZilMethods.GetSmartContractInit, [
        base16Contract,
      ]),
      requestType: { type: 'Metadata', field: MetadataField.Name },
      contractAddr: await contract.toZilBech32(),
    });
  } else if (contract.type === AddressType.EthCheckSum) {
    const erc20 = new ERC20Helper();
    const tokenAddr = await contract.toEthChecksum();

    const buildEthCall = (data: string): JsonRPCRequest => {
      return RpcProvider.buildPayload(EvmMethods.Call, [
        {
          to: tokenAddr,
          data,
        },
        'latest',
      ]);
    };

    const metadataFields: FunctionName[] = [
      'name',
      'symbol',
      'decimals',
    ];

    for (const field of metadataFields) {
      const data = erc20.encodeFunctionCall(field, []);
      requests.push({
        payload: buildEthCall(data),
        requestType: { type: 'Metadata', field: field as MetadataField },
        contractAddr: tokenAddr,
      });
    }
  }

  return requests;
}

async function buildZilRequests(
  contract: Address,
  accounts: readonly QueryAccount[],
  native: boolean,
  requests: { payload: JsonRPCRequest; requestType: RequestType }[],
): Promise<void> {
  const base16Contract = contract.toBase16();
  requests.push({
    payload: RpcProvider.buildPayload(ZilMethods.GetSmartContractInit, [
      base16Contract,
    ]),
    requestType: { type: 'Metadata', field: MetadataField.Name },
  });
  for (const account of accounts) {
    const addr = account.zilAddr;
    if (!addr) continue;
    const base16Account = (await addr.toZilChecksum()).toLowerCase();
    let payload;
    if (native) {
      payload = RpcProvider.buildPayload(ZilMethods.GetBalance, [
        base16Account,
      ]);
    } else {
      payload = RpcProvider.buildPayload(ZilMethods.GetSmartContractSubState, [
        base16Contract,
        'balances',
        [base16Account],
      ]);
    }
    requests.push({
      payload,
      requestType: { type: 'Balance', address: addr, addrHash: account.addrHash },
    });
  }
}

async function buildEthRequests(
  contract: Address,
  accounts: readonly QueryAccount[],
  native: boolean,
  requests: { payload: JsonRPCRequest; requestType: RequestType }[],
): Promise<void> {
  const erc20 = new ERC20Helper();
  const tokenAddr = await contract.toEthChecksum();

  const buildEthCall = (data: string): JsonRPCRequest => {
    return RpcProvider.buildPayload(EvmMethods.Call, [
      {
        to: tokenAddr,
        data,
      },
      'latest',
    ]);
  };

  const metadataFields: FunctionName[] = [
    'name',
    'symbol',
    'decimals',
  ];

  for (const field of metadataFields) {
    const data = erc20.encodeFunctionCall(field, []);
    requests.push({
      payload: buildEthCall(data),
      requestType: { type: 'Metadata', field: field as MetadataField },
    });
  }

  for (const account of accounts) {
    const addr = account.ethAddr;
    if (!addr) continue;
    let payload;
    const ethAddress = await addr.toEthChecksum();
    if (native) {
      payload = RpcProvider.buildPayload(EvmMethods.GetBalance, [
        ethAddress,
        'latest',
      ]);
    } else {
      const callData = erc20.encodeFunctionCall('balanceOf', [
        ethAddress,
      ]);
      payload = buildEthCall(callData);
    }
    requests.push({
      payload,
      requestType: { type: 'Balance', address: addr, addrHash: account.addrHash },
    });
  }
}

export function processEthMetadataResponse(
  response: JsonRPCResponse<string>,
  field: MetadataField,
): string {
  const resultHex = validateResponse(response);
  const erc20 = new ERC20Helper();

  const decoded = erc20.decodeFunctionOutput(
    field as FunctionName,
    resultHex,
  );
  return String(decoded);
}

export function processZilMetadataResponse(
  response: JsonRPCResponse<GetTokenInitItem[]>,
): { name: string; symbol: string; decimals: number } {
  const initData = validateResponse(response);

  const getField = (fieldName: string): string => {
    const item = initData.find((item) => item.vname === fieldName);
    if (!item) {
      throw new Error(`Invalid contract init: missing ${fieldName}`);
    }
    return item.value;
  };

  const name = getField('name');
  const symbol = getField('symbol');
  const decimals = parseInt(getField('decimals'), 10);
  if (isNaN(decimals)) {
    throw new Error('Invalid decimals format in contract init');
  }

  return { name, symbol, decimals };
}

export function processEthBalanceResponse(response: JsonRPCResponse<string>): bigint {
  const resultHex = validateResponse(response);
  return hexToBigInt(resultHex);
}

export async function processZilBalanceResponse(
  response: JsonRPCResponse<ZilBalanceResponse | ZilSmartContractSubStateResponse>,
  account: Address,
  isNative: boolean,
): Promise<bigint> {
  const IGNORE_CODES = [
    -5, // ignore account is not created
  ];
  const result = validateResponse(response, IGNORE_CODES);

  if (!result) {
    return 0n;
  }

  if (isNative) {
    return BigInt((result as ZilBalanceResponse).balance || '0');
  } else {
    const addr = (await account.toZilChecksum()).toLowerCase();
    const balances = (result as ZilSmartContractSubStateResponse).balances;
    return BigInt(balances?.[addr] || '0');
  }
}
