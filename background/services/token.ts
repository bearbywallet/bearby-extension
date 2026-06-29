import { RpcProvider } from "background/rpc";
import { buildNFTRequests, NFTMetadataField, processEthNFTBalanceResponse, processEthNFTMetadataResponse, processZilBaseUriResponse, processZilNFTBalanceResponse, processZilNFTMetadataResponse } from "background/rpc/nft_parser";
import type { BackgroundState } from "background/storage";
import type { FToken } from "background/storage/ftoken";
import type { ChainConfig } from "background/storage/chain";
import { RatesApiOptions } from "config/api";
import { ZERO_EVM } from "config/common";
import { ConnectError } from "config/errors";
import { NFTStandard } from "config/token";
import { ZILLIQA } from "config/slip44";
import { AddressType } from "config/wallet";
import { Address } from "crypto/address";
import type { StreamResponse } from "lib/streem";
import { hexToUint8Array } from "lib/utils/hex";
import { hashXORHex } from "lib/utils/hashing";
import type { NFTMetadata, NFTTokenInfo } from "types/token";

interface ZilstreamToken {
  symbol: string;
  price_eth: string;
}

interface ZilstreamResponse {
  data: ZilstreamToken[];
}

interface BearbyRate {
  from: string;
  rate: number | null;
}

interface ZilliqaEvmToken {
  address: string;
  decimals: number;
  name: string;
  symbol: string;
}

interface PortfolioToken {
  address: string;
  symbol: string;
  decimals?: number;
  name: string;
  type: string;
  metadata?: {
    logoUrl?: string;
    protectionInfo?: {
      result: string;
    };
  };
}

interface PortfolioBalance {
  token: PortfolioToken;
  amount?: {
    raw: string;
  };
  priceUsd?: number;
}

interface PortfolioResponse {
  portfolio?: {
    balances: PortfolioBalance[];
  };
}

export class TokenService {
  #state: BackgroundState;

  constructor(state: BackgroundState) {
    this.#state = state;
  }

  async tokensHints(sendResponse: StreamResponse) {
    try {
      const currentAccount = this.#state.getCurrentAccount();
      if (!currentAccount) {
        throw new Error(ConnectError.AddressMismatch);
      }

      const chainConfig = this.#state.getChain(currentAccount.chainHash);
      if (!chainConfig || chainConfig.testnet) {
        throw new Error(ConnectError.ChainNotFound);
      }

      const tokens = chainConfig.slip44 === ZILLIQA
        ? await this.#fetchZilliqaTokens(currentAccount, chainConfig)
        : await this.#fetchUniswapTokens(currentAccount, chainConfig);

      sendResponse({ resolve: tokens });
    } catch (err) {
      sendResponse({ reject: String(err) });
    }
  }

  async #fetchZilliqaTokens(
    account: ReturnType<BackgroundState["getCurrentAccount"]> & {},
    chainConfig: ChainConfig
  ) {
    const response = await fetch("https://api.zilpay.io/api/v1/tokens_evm");

    if (!response.ok) {
      throw new Error(`Zilliqa tokens API error: ${response.status}`);
    }

    const data: ZilliqaEvmToken[] = await response.json();
    const defaultLogo = chainConfig.ftokens[0]?.logo ?? null;

    return data.map((token) => ({
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      addr: token.address,
      addrType: Address.fromStr(token.address).type,
      logo: defaultLogo,
      balances: {},
      rate: 0,
      default_: false,
      native: false,
      chainHash: account.chainHash,
    }));
  }

  async #fetchUniswapTokens(
    account: ReturnType<BackgroundState["getCurrentAccount"]> & {},
    chainConfig: ChainConfig
  ) {
    const addr = account.addr.split(":").at(-1) ?? account.addr;
    const response = await fetch(
      "https://interface.gateway.uniswap.org/v2/data.v1.DataApiService/GetPortfolio",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://app.uniswap.org",
        },
        body: JSON.stringify({
          walletAccount: { platformAddresses: [{ address: addr }] },
          chainIds: [account.chainId],
          modifier: { address: addr, includeOverrides: [] },
        }),
      }
    );

    const result: PortfolioResponse = await response.json();
    const balances = result?.portfolio?.balances ?? [];

    const pubKeyHash = hashXORHex(account.pubKey);
    const defaultLogo = chainConfig.ftokens[0]?.logo ?? null;

    return balances
      .filter((balance) => {
        const token = balance.token;
        const protection = token?.metadata?.protectionInfo?.result;
        if (protection === "PROTECTION_RESULT_MALICIOUS" || protection === "PROTECTION_RESULT_WARNING") {
          return false;
        }
        return token?.type === "TOKEN_TYPE_ERC20" && token?.address !== ZERO_EVM;
      })
      .map((balance) => ({
        name: balance.token.name ?? "",
        symbol: balance.token.symbol ?? "",
        decimals: balance.token.decimals ?? 18,
        addr: balance.token.address,
        addrType: account.addrType,
        logo: balance.token.metadata?.logoUrl || defaultLogo,
        balances: { [pubKeyHash]: balance.amount?.raw ?? "0" },
        rate: 0,
        default_: false,
        native: false,
        chainHash: account.chainHash,
      }));
  }

  async fetchNFTMetadata(
    contract: string,
    walletIndex: number,
    sendResponse: StreamResponse
  ) {
    try {
      const contractAddr = Address.fromStr(contract);
      const wallet = this.#state.wallets[walletIndex];
      await wallet.trhowSession();
      const account = wallet.accounts[wallet.selectedAccount];
      const chainConfig = this.#state.getChain(account.chainHash);

      if (!chainConfig) {
        throw new Error(ConnectError.ChainNotFound);
      }

      const provider = new RpcProvider(chainConfig);
      const pubKeys = wallet.accounts.map((a) => hexToUint8Array(a.pubKey));

      const requestsWithTypes = await buildNFTRequests(
        contractAddr,
        pubKeys,
      );

      const payloads = requestsWithTypes.map((r) => r.payload);
      const responses = await provider.req<any[]>(payloads);

      let name = "";
      let symbol = "";
      let totalSupply: string | undefined;
      let standard = NFTStandard.ERC721;
      let baseURI: string | undefined;
      let balances: Record<number, Record<string, NFTTokenInfo>> = {};

      if (contractAddr.type === AddressType.Bech32) {
        const metadata = processZilNFTMetadataResponse(responses[0]);
        name = metadata.name;
        symbol = metadata.symbol;
        standard = NFTStandard.ZRC6;

        baseURI = processZilBaseUriResponse(responses[3]);

        const result = await processZilNFTBalanceResponse(
          responses[1],
          responses[2],
          baseURI,
          pubKeys
        );
    
        balances = result.balances;
      } else if (contractAddr.type === AddressType.EthCheckSum) {
        name = processEthNFTMetadataResponse(
          responses[0],
          NFTMetadataField.Name,
        );
        symbol = processEthNFTMetadataResponse(
          responses[1],
          NFTMetadataField.Symbol,
        );
        totalSupply = processEthNFTMetadataResponse(
          responses[2],
          NFTMetadataField.TotalSupply,
        );

        requestsWithTypes.slice(3).forEach((reqWithType, index) => {
          if (reqWithType.requestType.type === "Balance") {
            const response = responses[3 + index];
            const balance = processEthNFTBalanceResponse(response);
        
            if (balance > 0n) {
              balances[reqWithType.requestType.pubKeyHash] = {};
            }
          }
        });
      }

      const metadata: NFTMetadata = {
        name,
        symbol,
        totalSupply,
        standard,
        balances,
        contractAddress: contract,
        baseURI,
      };

      sendResponse({
        resolve: metadata,
      });
    } catch (err) {
      sendResponse({
        reject: String(err),
      });
    }
  }

  async updateRates(walletIndex: number, sendResponse: StreamResponse) {
    try {
      const wallet = this.#state.wallets[walletIndex];
      await wallet.trhowSession();

      const account = wallet.accounts[wallet.selectedAccount];
      const chain = this.#state.getChain(account.chainHash);

      if (!chain) {
        throw new Error(ConnectError.ChainNotFound);
      }

      const nativeToken = chain.ftokens[0];
      if (!nativeToken) {
        throw new Error("Native token not found");
      }

      const currency = wallet.settings.currencyConvert;
      const chainHash = chain.hash();
      const chainTokens = wallet.tokens.filter((t) => t.chainHash === chainHash);

      if (wallet.settings.ratesApiOptions === RatesApiOptions.None) {
        sendResponse({ resolve: wallet.tokens });
        return;
      }

      if (chain.slip44 === ZILLIQA) {
        const convertRate = await this.#fetchConvertRate(
          wallet.settings.ratesApiOptions,
          nativeToken.symbol,
          currency
        );

        if (convertRate === null) {
          sendResponse({ resolve: wallet.tokens });
          return;
        }

        await this.#updateZilliqaRates(chainTokens, convertRate);
      } else {
        await this.#updateBearbyRates(chainTokens, currency);
      }

      await this.#state.sync();

      sendResponse({ resolve: wallet.tokens });
    } catch (err) {
      sendResponse({ reject: String(err) });
    }
  }

  async #fetchConvertRate(
    ratesApiOptions: RatesApiOptions,
    symbol: string,
    currency: string
  ): Promise<number | null> {
    switch (ratesApiOptions) {
      case RatesApiOptions.CoinGecko:
        return this.#fetchCoinGeckoRate(symbol, currency);
      case RatesApiOptions.Bearby:
        return this.#fetchBearbyRate(symbol, currency);
      default:
        return null;
    }
  }

  async #fetchCoinGeckoRate(symbol: string, currency: string): Promise<number> {
    const symbolId = symbol.toLowerCase();
    const url = `https://api.coingecko.com/api/v3/simple/price?symbols=${symbolId}&vs_currencies=${currency.toLowerCase()}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "ZilPay-Wallet/1.0" }
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    return data[symbolId]?.[currency.toLowerCase()] ?? 0;
  }

  async #fetchBearbyRate(symbol: string, currency: string): Promise<number> {
    const url = `https://rates.bearby.io/convert?to=${currency.toUpperCase()}&for=${symbol.toUpperCase()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Bearby rates API error: ${response.status}`);
    }

    const data: BearbyRate[] = await response.json();
    const entry = data.find((r) => r.from.toUpperCase() === symbol.toUpperCase());
    return entry?.rate ?? 0;
  }

  async #updateZilliqaRates(tokens: FToken[], convertRate: number): Promise<void> {
    const response = await fetch("https://api-v2.zilstream.com/tokens?page=1&per_page=500");

    if (!response.ok) {
      throw new Error(`Zilstream API error: ${response.status}`);
    }

    const data: ZilstreamResponse = await response.json();
    const rateMap = new Map<string, number>();

    for (const token of data.data) {
      const rate = parseFloat(token.price_eth);
      if (!isNaN(rate)) {
        rateMap.set(token.symbol.toUpperCase(), rate);
      }
    }

    for (const token of tokens) {
      const symbolUpper = token.symbol.toUpperCase();
      const rateZil = rateMap.get(symbolUpper);

      if (rateZil !== undefined) {
        token.rate = rateZil * convertRate;
      } else if (token.native) {
        token.rate = convertRate;
      }
    }
  }

  async #updateBearbyRates(
    tokens: FToken[],
    currency: string
  ): Promise<void> {
    if (tokens.length === 0) return;

    const symbols = tokens.map((t) => t.symbol.toUpperCase()).join(",");
    const url = `https://rates.bearby.io/convert?to=${currency.toUpperCase()}&for=${symbols}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Bearby rates API error: ${response.status}`);
    }

    const data: BearbyRate[] = await response.json();
    const rateMap = new Map<string, number>();

    for (const entry of data) {
      if (entry.rate !== null) {
        rateMap.set(entry.from.toUpperCase(), entry.rate);
      }
    }

    for (const token of tokens) {
      const symbolUpper = token.symbol.toUpperCase();
      const rate = rateMap.get(symbolUpper);
      if (rate !== undefined) {
        token.rate = rate;
      }
    }
  }
}
