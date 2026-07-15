import { createContract } from 'micro-eth-signer/advanced/abi.js';
import { RpcError, RpcProvider, type JsonRPCRequest, type JsonRPCResponse } from './provider';
import { EvmMethods, ZilMethods } from 'config/jsonrpc';
import { hexToBigInt, hexToUint8Array, uint8ArrayToHex } from 'lib/utils/hex';
import { Address } from 'crypto/address';
import { TypeOf } from 'lib/types';
import { AddressType } from 'config/wallet';
import type { QueryAccount } from './query_account';
import { NFTStandard } from 'config/token';
import type { NFTTokenInfo } from 'types/token';

const ERC721_ABI = [
  { name: 'name', type: 'function', outputs: [{ type: 'string' }] },
  { name: 'symbol', type: 'function', outputs: [{ type: 'string' }] },
  { name: 'totalSupply', type: 'function', outputs: [{ type: 'uint256' }] },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'ownerOf',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'tokenURI',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'string' }],
  },
] as const;

export enum NFTMetadataField {
  Name = 'name',
  Symbol = 'symbol',
  TotalSupply = 'totalSupply',
}

type ERC721FunctionName = 'name' | 'symbol' | 'totalSupply' | 'balanceOf' | 'ownerOf' | 'tokenURI';

type ERC721FunctionArgs = {
  name: [];
  symbol: [];
  totalSupply: [];
  balanceOf: [string];
  ownerOf: [bigint];
  tokenURI: [bigint];
};

export type NFTRequestType =
  | { type: 'Metadata'; field: NFTMetadataField; standard: NFTStandard }
  | { type: 'Balance'; address: Address; addrHash: number; standard: NFTStandard }
  | { type: 'TokenOwners'; standard: NFTStandard }
  | { type: 'TokenUris'; standard: NFTStandard }
  | { type: 'BaseUri'; standard: NFTStandard };

export interface ZRC6Init {
  vname: string;
  type: string;
  value: string;
}

export interface ZilContractState {
  [key: string]: any;
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
    throw new RpcError('Bad Response', -32603);
  }

  return response.result as T;
}

export class ERC721Helper {
  readonly #contract;

  constructor() {
    this.#contract = createContract(ERC721_ABI);
  }

  encodeFunctionCall<T extends ERC721FunctionName>(
    functionName: T,
    args: ERC721FunctionArgs[T],
  ): string {
    let encodedData: Uint8Array;

    switch (functionName) {
      case 'name':
        encodedData = this.#contract.name.encodeInput();
        break;
      case 'symbol':
        encodedData = this.#contract.symbol.encodeInput();
        break;
      case 'totalSupply':
        encodedData = this.#contract.totalSupply.encodeInput();
        break;
      case 'balanceOf':
        encodedData = this.#contract.balanceOf.encodeInput(String(args[0]));
        break;
      case 'ownerOf':
        encodedData = this.#contract.ownerOf.encodeInput(BigInt(args[0] ?? 0));
        break;
      case 'tokenURI':
        encodedData = this.#contract.tokenURI.encodeInput(BigInt(args[0] ?? 0));
        break;
      default:
        throw new Error(`Unsupported function: ${functionName}`);
    }

    return uint8ArrayToHex(encodedData, true);
  }

  decodeFunctionOutput(functionName: ERC721FunctionName, data: string) {
    const bytes = hexToUint8Array(data);

    if (bytes.length == 0) {
      return '';
    }

    switch (functionName) {
      case 'name':
        return this.#contract.name.decodeOutput(bytes);
      case 'symbol':
        return this.#contract.symbol.decodeOutput(bytes);
      case 'totalSupply':
        return this.#contract.totalSupply.decodeOutput(bytes);
      case 'balanceOf':
        return this.#contract.balanceOf.decodeOutput(bytes);
      case 'ownerOf':
        return this.#contract.ownerOf.decodeOutput(bytes);
      case 'tokenURI':
        return this.#contract.tokenURI.decodeOutput(bytes);
      default:
        throw new Error(`Unsupported function: ${functionName}`);
    }
  }
}

export async function buildNFTRequests(
  contract: Address,
  accounts: readonly QueryAccount[],
): Promise<{ payload: JsonRPCRequest; requestType: NFTRequestType }[]> {
  const requests: { payload: JsonRPCRequest; requestType: NFTRequestType }[] = [];

  if (contract.type === AddressType.Bech32) {
    await buildZilNFTRequests(contract, requests);
  } else if (contract.type === AddressType.EthCheckSum) {
    await buildEthNFTRequests(contract, accounts, requests);
  }

  return requests;
}

async function buildZilNFTRequests(
  contract: Address,
  requests: { payload: JsonRPCRequest; requestType: NFTRequestType }[],
): Promise<void> {
  const base16Contract = contract.toBase16();
  
  requests.push({
    payload: RpcProvider.buildPayload(ZilMethods.GetSmartContractInit, [base16Contract]),
    requestType: { type: 'Metadata', field: NFTMetadataField.Name, standard: NFTStandard.ZRC6 },
  });

  requests.push({
    payload: RpcProvider.buildPayload(ZilMethods.GetSmartContractSubState, [
      base16Contract,
      'token_owners',
      []
    ]),
    requestType: { type: 'TokenOwners', standard: NFTStandard.ZRC6 },
  });

  requests.push({
    payload: RpcProvider.buildPayload(ZilMethods.GetSmartContractSubState, [
      base16Contract,
      'token_uris',
      []
    ]),
    requestType: { type: 'TokenUris', standard: NFTStandard.ZRC6 },
  });

  requests.push({
    payload: RpcProvider.buildPayload(ZilMethods.GetSmartContractSubState, [
      base16Contract,
      'base_uri',
      []
    ]),
    requestType: { type: 'BaseUri', standard: NFTStandard.ZRC6 },
  });
}

async function buildEthNFTRequests(
  contract: Address,
  accounts: readonly QueryAccount[],
  requests: { payload: JsonRPCRequest; requestType: NFTRequestType }[],
): Promise<void> {
  const contractAddr = await contract.toEthChecksum();
  const erc721 = new ERC721Helper();
  
  const buildEthCall = (data: string): JsonRPCRequest => {
    return RpcProvider.buildPayload(EvmMethods.Call, [
      { to: contractAddr, data },
      'latest',
    ]);
  };

  const nameData = erc721.encodeFunctionCall('name', []);
  requests.push({
    payload: buildEthCall(nameData),
    requestType: { type: 'Metadata', field: NFTMetadataField.Name, standard: NFTStandard.ERC721 },
  });
  
  const symbolData = erc721.encodeFunctionCall('symbol', []);
  requests.push({
    payload: buildEthCall(symbolData),
    requestType: { type: 'Metadata', field: NFTMetadataField.Symbol, standard: NFTStandard.ERC721 },
  });
  
  const totalSupplyData = erc721.encodeFunctionCall('totalSupply', []);
  requests.push({
    payload: buildEthCall(totalSupplyData),
    requestType: { type: 'Metadata', field: NFTMetadataField.TotalSupply, standard: NFTStandard.ERC721 },
  });
  
  for (const account of accounts) {
    const addr = account.ethAddr;
    if (!addr) continue;
    const ethAddress = await addr.toEthChecksum();
    const balanceData = erc721.encodeFunctionCall('balanceOf', [ethAddress]);

    requests.push({
      payload: buildEthCall(balanceData),
      requestType: {
        type: 'Balance',
        address: addr,
        addrHash: account.addrHash,
        standard: NFTStandard.ERC721,
      },
    });
  }
}

export function processEthNFTMetadataResponse(
  response: JsonRPCResponse<string>,
  field: NFTMetadataField,
): string {
  if (response.error) {
    return '';
  }

  const resultHex = response.result;
  
  if (!resultHex) {
    return '';
  }
  
  const erc721 = new ERC721Helper();
  const decoded = erc721.decodeFunctionOutput(field as ERC721FunctionName, resultHex);
  return String(decoded);
}

export function processZilNFTMetadataResponse(
  response: JsonRPCResponse<ZRC6Init[]>,
): { name: string; symbol: string } {
  const initData = validateResponse(response);

  const getField = (fieldName: string): string => {
    const item = initData.find((item) => item.vname === fieldName);
    return item?.value ?? '';
  };

  const name = getField('name');
  const symbol = getField('symbol');

  return { name, symbol };
}

export function processZilBaseUriResponse(
  response: JsonRPCResponse<{ base_uri?: string }>,
): string | undefined {
  const result = validateResponse(response, []);
  return result?.base_uri;
}

export function processEthNFTBalanceResponse(
  response: JsonRPCResponse<string>,
): bigint {
  if (response.error) {
    return 0n;
  }

  const resultHex = response.result;
  
  if (!resultHex) {
    return 0n;
  }
  
  return hexToBigInt(resultHex);
}

export async function processZilNFTBalanceResponse(
  tokenOwnersResponse: JsonRPCResponse<{ token_owners?: Record<string, string> }>,
  tokenUrisResponse: JsonRPCResponse<{ token_uris?: Record<string, string> }>,
  baseURI: string | undefined,
  accounts: readonly QueryAccount[],
): Promise<{ balances: Record<number, Record<string, NFTTokenInfo>> }> {
  const tokenOwners = validateResponse(tokenOwnersResponse, [])?.token_owners || {};
  const tokenUris = validateResponse(tokenUrisResponse, [])?.token_uris || {};

  const balances: Record<number, Record<string, NFTTokenInfo>> = {};

  let cleanBaseUri: string | undefined;
  if (baseURI) {
    cleanBaseUri = baseURI.endsWith('/') ? baseURI.slice(0, -1) : baseURI;
  }

  for (const account of accounts) {
    const addr = account.zilAddr;
    if (!addr) continue;
    const base16Account = (await addr.toZilChecksum()).toLowerCase();

    const userTokens: Record<string, NFTTokenInfo> = {};

    for (const tokenId in tokenOwners) {
      const owner = String(tokenOwners[tokenId]).toLowerCase();
      
      if (owner === base16Account) {
        let url = tokenUris[tokenId];
        
        if (!url && cleanBaseUri) {
          url = `${cleanBaseUri}/${tokenId}`;
        }

        userTokens[tokenId] = {
          id: tokenId,
          url,
        };
      }
    }

    balances[account.addrHash] = userTokens;
  }

  return { balances };
}
