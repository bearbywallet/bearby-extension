import type { Wallet } from "background/storage/wallet";
import type { Account } from "background/storage/account";
import { ConnectError } from "config/errors";
import type { StreamResponse } from "lib/streem";
import type { ConnectService } from "./connect";
import type { ConnectParams } from "types/connect";
import { NetworkProvider, type JsonRPCRequest } from "background/rpc";
import {
  bigintToHex,
  HEX_PREFIX,
  hexToUint8Array,
  uint8ArrayToHex,
} from "lib/utils/hex";
import { tryHexToUtf8, messageToUint8Array } from "lib/utils/utf8";
import { TabsMessage } from "lib/streem/tabs-message";
import { MTypePopup } from "config/stream";
import { hashXORHex } from "lib/utils/hashing";
import { ETHEREUM, ZILLIQA } from "config/slip44";
import { ConfirmState } from "background/storage/confirm";
import { PromptService } from "lib/popup/prompt";
import { AddressType, WalletTypes } from "config/wallet";
import type { TransactionRequestEVM, TransactionMetadata } from "types/tx";
import {
  ChainConfig,
  FToken,
  Explorer,
  type BackgroundState,
} from "background/storage";
import type { ProviderService } from "./provider";
import type { EvmAddChainParams } from "types/chain";
import type { ParamsWatchAsset } from "types/token";
import { eip191Signer, verifyTyped } from "micro-eth-signer";
import { encoder, getDomainType } from "micro-eth-signer/core/typed-data";
import { Address } from "crypto/address";
import { KeyPair } from "crypto/keypair";

export class EvmService {
  #state: BackgroundState;
  #connectService: ConnectService;
  #provider: ProviderService;

  constructor(
    state: BackgroundState,
    connectService: ConnectService,
    provider: ProviderService,
  ) {
    this.#state = state;
    this.#connectService = connectService;
    this.#provider = provider;
  }

  async handleRequest(
    msg: ConnectParams<JsonRPCRequest>,
    sendResponse: StreamResponse,
  ) {
    const wallet = this.#state.getCurrentWallet();

    if (!wallet) {
      this.#sendError(msg.uuid, msg.domain, ConnectError.WalletNotFound, 4100);
      sendResponse({ reject: ConnectError.WalletNotFound });
      return;
    }

    try {
      await wallet.trhowSession();
      const payload = msg.payload;

      if (!payload) {
        throw new Error(ConnectError.InvalidPayload);
      }

      const account = wallet.accounts[wallet.selectedAccount];
      switch (payload.method) {
        case "eth_chainId":
          this.#handleChainId(msg, account);
          break;

        case "eth_accounts":
          this.#handleAccounts(msg, wallet, account);
          break;

        case "eth_requestAccounts":
          await this.#connectService.callConnect(msg, sendResponse);
          return;

        case "wallet_requestPermissions":
          await this.#handleRequestPermissions(msg, sendResponse);
          return;

        case "wallet_getPermissions":
          this.#handleGetPermissions(msg, account);
          break;

        case "wallet_switchEthereumChain":
          await this.#handleSwitchChain(msg, sendResponse);
          return;

        case "eth_sign":
          await this.#handleEthSign(msg, wallet, sendResponse);
          return;

        case "personal_sign":
          await this.#handlePersonalSign(msg, wallet, sendResponse);
          return;

        case "eth_signTypedData_v4":
          await this.#handleSignTypedDataV4(msg, wallet, sendResponse);
          return;

        case "eth_sendTransaction":
          await this.#handleSendTransaction(msg, wallet, sendResponse);
          return;

        case "wallet_addEthereumChain":
          await this.#handleAddEthereumChain(msg, wallet, sendResponse);
          return;
        case "wallet_watchAsset":
          await this.#handleWatchAsset(msg, wallet, sendResponse);
          return;

        default:
          await this.#proxyRequest(msg, account);
          break;
      }

      sendResponse({ resolve: true });
    } catch (err) {
      console.error(err);
      this.#sendError(msg.uuid, msg.domain, String(err), 4000);
      sendResponse({ reject: String(err) });
    }
  }

  async addEthereumChainResponse(
    uuid: string,
    walletIndex: number,
    approve: boolean,
    sendResponse: StreamResponse,
  ) {
    try {
      const wallet = this.#state.wallets[walletIndex];

      if (!wallet) {
        throw new Error(ConnectError.WalletNotFound);
      }

      await wallet.trhowSession();

      const confirmRequest = wallet.confirm.find((c) => c.uuid === uuid);
      if (!confirmRequest || !confirmRequest.evmAddChainRequest) {
        throw new Error(`${ConnectError.RequestNotFound}: ${uuid}`);
      }

      const { params: chainParams, domain } = confirmRequest.evmAddChainRequest;

      wallet.confirm = wallet.confirm.filter((c) => c.uuid !== uuid);

      if (!approve) {
        this.#sendError(uuid, domain, ConnectError.UserRejected, 4001);
      } else {
        const chainId = parseInt(chainParams.chainId, 16);
        const existingChain = this.#state.chains.find(
          (c) => c.chainId === chainId,
        );

        if (existingChain) {
          if (chainParams.rpcUrls) {
            existingChain.rpc = [
              ...new Set([...existingChain.rpc, ...chainParams.rpcUrls]),
            ];
          }
          if (chainParams.blockExplorerUrls) {
            const existingExplorerUrls = new Set(
              existingChain.explorers.map((e) => e.url),
            );
            const newExplorers = chainParams.blockExplorerUrls
              .filter((url) => !existingExplorerUrls.has(url))
              .map(
                (url) =>
                  new Explorer({
                    name: new URL(url).hostname,
                    url,
                    icon: null,
                    standard: 3091,
                  }),
              );
            existingChain.explorers.push(...newExplorers);
          }
        } else {
          const newChainData = new ChainConfig({
            name: chainParams.chainName,
            chain: chainParams.nativeCurrency.symbol,
            logo:
              chainParams.iconUrls?.[0] ||
              "https://raw.githubusercontent.com/zilpay/tokens_meta/refs/heads/master/ft/%{shortName}%/chain/%{dark,light}%.svg",
            rpc: chainParams.rpcUrls,
            features: [],
            ftokens: [],
            chainId: chainId,
            chainIds: [chainId, 0],
            shortName: chainParams.chainName.toLowerCase().replace(/\s/g, ""),
            slip44: ETHEREUM,
            explorers:
              chainParams.blockExplorerUrls?.map(
                (url) =>
                  new Explorer({
                    name: new URL(url).hostname,
                    url,
                    icon: null,
                    standard: 3091,
                  }),
              ) || [],
            diffBlockTime: 15,
            ens: null,
            fallbackEnabled: true,
            batchRequest: true,
            testnet: null,
          });
          const token = new FToken({
            native: true,
            logo: "https://raw.githubusercontent.com/zilpay/tokens_meta/refs/heads/master/ft/%{name}%/%{contract_address}%/%{dark,light}%.webp",
            addr: "0x0000000000000000000000000000000000000000",
            name: chainParams.nativeCurrency.name,
            symbol: chainParams.nativeCurrency.symbol,
            decimals: chainParams.nativeCurrency.decimals,
            addrType: AddressType.EthCheckSum,
            balances: {},
            rate: 0,
            default_: true,
            chainHash: newChainData.hash(),
          });
          newChainData.ftokens.push(token);
          this.#state.chains.push(newChainData);
        }

        this.#sendSuccess(uuid, domain, null);
      }

      await this.#state.sync();
      sendResponse({ resolve: this.#state.chains });
    } catch (e) {
      sendResponse({ reject: String(e) });
    }
  }

  async #handleSwitchChain(
    msg: ConnectParams<JsonRPCRequest>,
    sendResponse: StreamResponse,
  ) {
    try {
      if (!msg.payload) {
        throw new Error(ConnectError.InvalidPayload);
      }

      interface Params {
        method: string;
        params: { chainId: string }[];
      }

      const { params } = msg.payload as Params;

      if (!params || params.length == 0) {
        throw new Error(ConnectError.InvalidParams);
      }

      const chainIdHex = params[0].chainId;
      const chainId = parseInt(chainIdHex, 16);
      const chainIndex = this.#state.chains.findIndex(
        (c) => c.chainId == chainId,
      );

      if (chainIndex == -1) {
        throw new Error(ConnectError.ChainNotFound);
      }

      await this.#provider.swichNetwork(
        this.#state.selectedWallet,
        chainIndex,
        sendResponse,
      );
      this.#sendSuccess(msg.uuid, msg.domain, null);
    } catch (error) {
      this.#sendError(msg.uuid, msg.domain, String(error), 4902);
      sendResponse({ reject: String(error) });
    }
  }

  async addEthereumWatchAssetResponse(
    uuid: string,
    walletIndex: number,
    approve: boolean,
    sendResponse: StreamResponse,
  ) {
    try {
      const wallet = this.#state.wallets[walletIndex];

      if (!wallet) {
        throw new Error(ConnectError.WalletNotFound);
      }

      await wallet.trhowSession();

      const confirmRequest = wallet.confirm.find((c) => c.uuid === uuid);
      if (!confirmRequest || !confirmRequest.evmAddAssetRequest) {
        throw new Error(`${ConnectError.RequestNotFound}: ${uuid}`);
      }

      const domain = confirmRequest.metadata!.domain!;

      wallet.confirm = wallet.confirm.filter((c) => c.uuid !== uuid);

      if (approve) {
        const [tokenToAdd] = confirmRequest.evmAddAssetRequest;

        const tokenExists = wallet.tokens.some(
          (token) =>
            token.addr.toLowerCase() === tokenToAdd.addr.toLowerCase() &&
            token.chainHash === tokenToAdd.chainHash,
        );

        if (!tokenExists) {
          wallet.tokens.push(tokenToAdd);
        }

        this.#sendSuccess(uuid, domain, true);
      } else {
        this.#sendError(uuid, domain, ConnectError.UserRejected, 4001);
      }

      await this.#state.sync();
      sendResponse({ resolve: wallet.confirm });
    } catch (e) {
      sendResponse({ reject: String(e) });
    }
  }

  async responseToEthSign(
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
      const evmMessage = wallet.confirm.find((c) => c.uuid === uuid);

      if (!evmMessage || !evmMessage.signMessageEVM) {
        throw new Error(`${ConnectError.RequestNotFound}: ${uuid}`);
      }

      if (!approve) {
        this.#sendError(
          uuid,
          evmMessage.signMessageEVM.domain,
          ConnectError.UserRejected,
          4001,
        );
      } else {
        const defaultChain = this.#state.getChain(wallet.defaultChainHash);

        if (!defaultChain) {
          throw new Error(ConnectError.ChainNotFound);
        }

        let signature: string;

        if (wallet.walletType == WalletTypes.Ledger && sig) {
          const messageBytes = messageToUint8Array(
            evmMessage.signMessageEVM.messageHash,
          );
          let verify = eip191Signer.verify(sig, messageBytes, account.addr);
          if (!verify) {
            throw new Error(ConnectError.InvalidSig);
          }
          signature = sig;
        } else {
          const nativeKeyPair = await wallet.revealKeypair(
            account.index,
            defaultChain,
          );
          const keyPair = await KeyPair.fromPrivateKey(
            nativeKeyPair.privateKey,
            ETHEREUM,
          );
          const derivedAddr = await Address.fromPubKeyType(
            keyPair.pubKey,
            account.addrType,
          );
          const addr = await derivedAddr.autoFormat();
          if (!account.addr.includes(addr)) {
            throw new Error(ConnectError.AddressMismatch);
          }
          const hashBuffer = messageToUint8Array(
            evmMessage.signMessageEVM.messageHash,
          );
          const s = await keyPair.signMessage(hashBuffer);
          signature = uint8ArrayToHex(s, true);
        }

        this.#sendSuccess(uuid, evmMessage.signMessageEVM.domain, signature);
      }

      wallet.confirm = wallet.confirm.filter((c) => c.uuid !== uuid);
      await this.#state.sync();
      sendResponse({ resolve: wallet.confirm });
    } catch (e) {
      sendResponse({ reject: String(e) });
    }
  }

  async responseToSignPersonalMessageEVM(
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
      const evmMessage = wallet.confirm.find((c) => c.uuid === uuid);

      if (!evmMessage || !evmMessage.signPersonalMessageEVM) {
        throw new Error(`${ConnectError.RequestNotFound}: ${uuid}`);
      }

      if (!approve) {
        this.#sendError(
          uuid,
          evmMessage.signPersonalMessageEVM.domain,
          ConnectError.UserRejected,
          4001,
        );
      } else {
        const defaultChain = this.#state.getChain(wallet.defaultChainHash);

        if (!defaultChain) {
          throw new Error(ConnectError.ChainNotFound);
        }

        let signature: string;

        const messageBytes = messageToUint8Array(
          evmMessage.signPersonalMessageEVM.message,
        );

        if (wallet.walletType == WalletTypes.Ledger && sig) {
          let verify = eip191Signer.verify(sig, messageBytes, account.addr);
          if (!verify) {
            throw new Error(ConnectError.InvalidSig);
          }
          signature = sig;
        } else {
          const nativeKeyPair = await wallet.revealKeypair(
            account.index,
            defaultChain,
          );
          const keyPair = await KeyPair.fromPrivateKey(
            nativeKeyPair.privateKey,
            ETHEREUM,
          );
          const derivedAddr = await Address.fromPubKeyType(
            keyPair.pubKey,
            account.addrType,
          );
          const addr = await derivedAddr.autoFormat();
          if (!account.addr.includes(addr)) {
            throw new Error(ConnectError.AddressMismatch);
          }
          const s = await keyPair.signMessage(messageBytes);
          signature = uint8ArrayToHex(s, true);
        }

        this.#sendSuccess(
          uuid,
          evmMessage.signPersonalMessageEVM.domain,
          signature,
        );
      }

      wallet.confirm = wallet.confirm.filter((c) => c.uuid !== uuid);
      await this.#state.sync();
      sendResponse({ resolve: wallet.confirm });
    } catch (e) {
      sendResponse({ reject: String(e) });
    }
  }

  async responseToSignTypedDataEVM(
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
      const evmTypedData = wallet.confirm.find((c) => c.uuid === uuid);

      if (!evmTypedData || !evmTypedData.signTypedDataJsonEVM) {
        throw new Error(`${ConnectError.RequestNotFound}: ${uuid}`);
      }

      if (!approve) {
        this.#sendError(
          uuid,
          evmTypedData.signTypedDataJsonEVM.domain,
          ConnectError.UserRejected,
          4001,
        );
      } else {
        const defaultChain = this.#state.getChain(wallet.defaultChainHash);

        if (!defaultChain) {
          throw new Error(ConnectError.ChainNotFound);
        }

        let signature: string;

        if (wallet.walletType == WalletTypes.Ledger && sig) {
          const typedData = JSON.parse(
            evmTypedData.signTypedDataJsonEVM.typedData,
          );
          const verify = verifyTyped(sig, typedData, account.addr);
          if (!verify) {
            throw new Error(ConnectError.InvalidSig);
          }
          signature = sig;
        } else {
          const nativeKeyPair = await wallet.revealKeypair(
            account.index,
            defaultChain,
          );
          const keyPair = await KeyPair.fromPrivateKey(
            nativeKeyPair.privateKey,
            ETHEREUM,
          );
          const derivedAddr = await Address.fromPubKeyType(
            keyPair.pubKey,
            account.addrType,
          );
          const addr = await derivedAddr.autoFormat();
          if (!account.addr.includes(addr)) {
            throw new Error(ConnectError.AddressMismatch);
          }
          const typedData = JSON.parse(
            evmTypedData.signTypedDataJsonEVM.typedData,
          );
          const s = keyPair.signDataEIP712(typedData);
          signature = uint8ArrayToHex(s, true);
        }

        this.#sendSuccess(
          uuid,
          evmTypedData.signTypedDataJsonEVM.domain,
          signature,
        );
      }

      wallet.confirm = wallet.confirm.filter((c) => c.uuid !== uuid);

      await this.#state.sync();
      sendResponse({ resolve: wallet.confirm });
    } catch (e) {
      sendResponse({ reject: String(e) });
    }
  }

  async #handleEthSign(
    msg: ConnectParams<JsonRPCRequest>,
    wallet: Wallet,
    sendResponse: StreamResponse,
  ) {
    try {
      const params = msg.payload?.params;

      if (!params || params.length < 2) {
        throw new Error(ConnectError.InvalidParams);
      }

      const address = String(params[0]);
      const messageHash = String(params[1]);

      const account = wallet.accounts[wallet.selectedAccount];
      const currentAddress =
        account.slip44 === ZILLIQA
          ? account.addr.split(":").at(-1)
          : account.addr;

      if (
        !currentAddress ||
        currentAddress?.toLowerCase() !== address.toLowerCase()
      ) {
        throw new Error(ConnectError.AddressMismatch);
      }

      wallet.confirm.push(
        new ConfirmState({
          uuid: msg.uuid,
          signMessageEVM: {
            messageHash,
            address: currentAddress,
            domain: msg.domain,
            title: msg.title || msg.domain,
            icon: msg.icon || "",
          },
        }),
      );

      await this.#state.sync();
      new PromptService().open("/sign-message");

      sendResponse({ resolve: true });
    } catch (error) {
      console.error(error);
      this.#sendError(msg.uuid, msg.domain, String(error), 4001);
      sendResponse({ reject: String(error) });
    }
  }

  async #handlePersonalSign(
    msg: ConnectParams<JsonRPCRequest>,
    wallet: Wallet,
    sendResponse: StreamResponse,
  ) {
    try {
      const params = msg.payload?.params;

      if (!params || params.length < 2) {
        throw new Error(ConnectError.InvalidParams);
      }

      let message = String(params[0]);
      const address = String(params[1]);

      if (message.startsWith(HEX_PREFIX)) {
        try {
          message = tryHexToUtf8(message);
        } catch {}
      }

      const account = wallet.accounts[wallet.selectedAccount];
      const currentAddress =
        account.slip44 === ZILLIQA
          ? account.addr.split(":").at(-1)
          : account.addr;

      if (
        !currentAddress ||
        currentAddress?.toLowerCase() !== address.toLowerCase()
      ) {
        throw new Error(ConnectError.AddressMismatch);
      }

      wallet.confirm.push(
        new ConfirmState({
          uuid: msg.uuid,
          signPersonalMessageEVM: {
            message,
            address: currentAddress,
            domain: msg.domain,
            title: msg.title || msg.domain,
            icon: msg.icon || "",
          },
        }),
      );

      await this.#state.sync();
      new PromptService().open("/sign-message");

      sendResponse({ resolve: true });
    } catch (error) {
      this.#sendError(msg.uuid, msg.domain, String(error), 4001);
      sendResponse({ reject: String(error) });
    }
  }

  async #handleSignTypedDataV4(
    msg: ConnectParams<JsonRPCRequest>,
    wallet: Wallet,
    sendResponse: StreamResponse,
  ) {
    try {
      const params = msg.payload?.params;

      if (!params) {
        throw new Error(ConnectError.InvalidParams);
      }

      const address = String(params[0]);
      const typedDataJson = String(params[1]);
      const account = wallet.accounts[wallet.selectedAccount];

      if (!account.addr.toLowerCase().includes(address.toLowerCase())) {
        throw new Error(ConnectError.AddressMismatch);
      }

      const typedData = JSON.parse(typedDataJson);
      const domainTypes = getDomainType(typedData.domain);
      const types = {
        EIP712Domain: domainTypes,
        ...typedData.types,
      };
      const enc = encoder(types, typedData.domain);
      const hashStructMessage = enc.structHash(
        typedData.primaryType,
        typedData.message,
      );
      const domainSeparator = enc.structHash("EIP712Domain", typedData.domain);

      wallet.confirm.push(
        new ConfirmState({
          uuid: msg.uuid,
          signTypedDataJsonEVM: {
            domainSeparator,
            hashStructMessage,
            typedData: typedDataJson,
            address: account.addr,
            domain: msg.domain,
            title: msg.title || msg.domain,
            icon: msg.icon || "",
          },
        }),
      );

      await this.#state.sync();
      new PromptService().open("/sign-message");

      sendResponse({ resolve: true });
    } catch (error) {
      this.#sendError(msg.uuid, msg.domain, String(error), 4001);
      sendResponse({ reject: String(error) });
    }
  }

  async #handleSendTransaction(
    msg: ConnectParams<JsonRPCRequest>,
    wallet: Wallet,
    sendResponse: StreamResponse,
  ) {
    try {
      const params = msg.payload?.params;

      if (!params || params.length < 1) {
        throw new Error(ConnectError.InvalidParams);
      }

      const txParams = params[0] as TransactionRequestEVM;
      const account = wallet.accounts[wallet.selectedAccount];
      const chainConfig = this.#state.getChain(account.chainHash);

      if (!chainConfig) {
        throw new Error(ConnectError.ChainNotFound);
      }

      const currentAddress =
        account.slip44 === ZILLIQA
          ? account.addr.split(":").at(-1)
          : account.addr;

      if (
        txParams.from &&
        !currentAddress?.toLowerCase().includes(txParams.from.toLowerCase())
      ) {
        throw new Error(ConnectError.AddressMismatch);
      }

      const metadata: TransactionMetadata = {
        chainHash: account.chainHash,
        domain: msg.domain,
        title: msg.title || msg.domain,
        icon: msg.icon,
        token: {
          ...chainConfig.ftokens[0],
          balances: undefined,
        },
      };

      wallet.confirm.push(
        new ConfirmState({
          uuid: msg.uuid,
          metadata,
          evm: {
            ...txParams,
            from: currentAddress,
            chainId: chainConfig.chainId,
          },
        }),
      );

      await this.#state.sync();
      new PromptService().open("/confirm");

      sendResponse({ resolve: true });
    } catch (error) {
      this.#sendError(msg.uuid, msg.domain, String(error), 4001);
      sendResponse({ reject: String(error) });
    }
  }

  async #handleAddEthereumChain(
    msg: ConnectParams<JsonRPCRequest>,
    wallet: Wallet,
    sendResponse: StreamResponse,
  ) {
    try {
      const params = msg.payload?.params;

      if (!params || params.length < 1) {
        throw new Error(ConnectError.InvalidParams);
      }

      const chainParams = params[0] as EvmAddChainParams;

      if (
        !chainParams.chainId ||
        !chainParams.chainName ||
        !chainParams.nativeCurrency ||
        !chainParams.rpcUrls
      ) {
        throw new Error(ConnectError.InvalidParams);
      }

      wallet.confirm.push(
        new ConfirmState({
          uuid: msg.uuid,
          evmAddChainRequest: {
            params: chainParams,
            domain: msg.domain,
            title: msg.title || msg.domain,
            icon: msg.icon || "",
          },
        }),
      );

      await this.#state.sync();
      new PromptService().open("/add-chain");

      sendResponse({ resolve: true });
    } catch (error) {
      this.#sendError(msg.uuid, msg.domain, String(error), 4001);
      sendResponse({ reject: String(error) });
    }
  }

  async #proxyRequest(msg: ConnectParams<JsonRPCRequest>, account: Account) {
    try {
      const chainConfig = this.#state.getChain(account.chainHash);

      if (!chainConfig) {
        this.#sendError(msg.uuid, msg.domain, ConnectError.ChainNotFound, 4100);
        return;
      }

      const provider = new NetworkProvider(chainConfig);
      let rpcPayload: JsonRPCRequest | JsonRPCRequest[];

      if (Array.isArray(msg.payload)) {
        rpcPayload = msg.payload.map((p, index) => ({
          jsonrpc: "2.0",
          id: index + 1,
          method: p.method,
          params: p.params || [],
        }));
      } else {
        rpcPayload = {
          jsonrpc: "2.0",
          id: 1,
          method: msg.payload!.method,
          params: msg.payload!.params || [],
        };
      }

      const response = await provider.proxyReq(rpcPayload);

      if (response.error) {
        this.#sendError(
          msg.uuid,
          msg.domain,
          response.error.message,
          response.error.code,
        );
      } else {
        this.#sendSuccess(msg.uuid, msg.domain, response.result);
      }
    } catch (error) {
      this.#sendError(msg.uuid, msg.domain, String(error), 4000);
    }
  }

  #handleChainId(msg: ConnectParams<JsonRPCRequest>, account: Account) {
    const chain = this.#state.getChain(account.chainHash);
    const chainId = bigintToHex(BigInt(chain?.chainId ?? 0));

    this.#sendSuccess(msg.uuid, msg.domain, chainId);
  }

  #handleAccounts(
    msg: ConnectParams<JsonRPCRequest>,
    wallet: Wallet,
    account: Account,
  ) {
    const hash = hashXORHex(account.pubKey);
    const isConnected = this.#state.connections.isConnected(msg.domain, hash);

    if (isConnected) {
      const addresses = this.#getAddresses(wallet, account);
      this.#sendSuccess(msg.uuid, msg.domain, addresses);
    } else {
      this.#sendSuccess(msg.uuid, msg.domain, []);
    }
  }

  async #handleWatchAsset(
    msg: ConnectParams<JsonRPCRequest>,
    wallet: Wallet,
    sendResponse: StreamResponse,
  ) {
    try {
      if (!msg.payload) {
        throw new Error(ConnectError.InvalidParams);
      }

      const params = msg.payload.params as unknown as ParamsWatchAsset;

      if (!params || params.type !== "ERC20" || !params.options) {
        throw new Error(`${ConnectError.UnsupportedType} ${params?.type}`);
      }

      const { options } = params;
      const account = wallet.accounts[wallet.selectedAccount];
      const chainConfig = this.#state.getChain(account.chainHash);

      if (!chainConfig) {
        throw new Error(ConnectError.ChainNotFound);
      }

      const tokenExists = wallet.tokens.some(
        (token) =>
          token.addr.toLowerCase() === options.address.toLowerCase() &&
          token.chainHash === account.chainHash,
      );

      if (tokenExists) {
        this.#sendSuccess(msg.uuid, msg.domain, true);
        sendResponse({ resolve: true });
        return;
      }

      const newFToken = new FToken({
        name: options.symbol,
        symbol: options.symbol,
        decimals: options.decimals,
        addr: options.address,
        addrType: AddressType.EthCheckSum,
        logo: options.image ?? chainConfig.ftokens[0].logo ?? null,
        balances: {},
        rate: 0,
        default_: false,
        native: false,
        chainHash: account.chainHash,
      });

      wallet.confirm.push(
        new ConfirmState({
          uuid: msg.uuid,
          evmAddAssetRequest: [newFToken],
          metadata: {
            domain: msg.domain,
            title: msg.title || msg.domain,
            icon: msg.icon,
            chainHash: account.chainHash,
            token: {
              ...newFToken,
              balances: undefined,
            },
          },
        }),
      );

      await this.#state.sync();
      new PromptService().open("/add-asset");
      sendResponse({ resolve: true });
    } catch (error) {
      this.#sendError(msg.uuid, msg.domain, String(error), 4001);
      sendResponse({ reject: String(error) });
    }
  }

  async #handleRequestPermissions(
    msg: ConnectParams<JsonRPCRequest>,
    sendResponse: StreamResponse,
  ) {
    const params = msg.payload?.params?.[0] as
      | Record<string, unknown>
      | undefined;

    if (params?.eth_accounts) {
      await this.#connectService.callConnect(msg, sendResponse);
    } else {
      this.#sendError(
        msg.uuid,
        msg.domain,
        ConnectError.InvalidPermissionRequest,
        4001,
      );
      sendResponse({ reject: ConnectError.InvalidPermissionRequest });
    }
  }

  #handleGetPermissions(msg: ConnectParams<JsonRPCRequest>, account: Account) {
    const connection = this.#state.connections.find(msg.domain);

    if (!connection) {
      this.#sendSuccess(msg.uuid, msg.domain, []);
      return;
    }

    const address =
      account.slip44 === ZILLIQA
        ? account.addr.split(":").at(-1)
        : account.addr;

    const permissions = [
      {
        invoker: msg.domain,
        parentCapability: "eth_accounts",
        caveats: [
          {
            type: "restrictReturnedAccounts",
            value: [address],
          },
        ],
      },
    ];

    this.#sendSuccess(msg.uuid, msg.domain, permissions);
  }

  #getAddresses(_wallet: Wallet, selectedAccount: Account): string[] {
    if (selectedAccount.addrType === AddressType.Bech32) {
      return [selectedAccount.addr.split(":")[1]];
    } else {
      return [selectedAccount.addr];
    }
  }

  #sendSuccess(uuid: string, domain: string, result: unknown): void {
    new TabsMessage({
      type: MTypePopup.EVM_RESPONSE,
      uuid,
      payload: {
        result,
      },
    }).send(domain);
  }

  #sendError(
    uuid: string,
    domain: string,
    message: string,
    code: number,
  ): void {
    new TabsMessage({
      type: MTypePopup.EVM_RESPONSE,
      uuid,
      payload: {
        error: {
          message,
          code,
          data: null,
        },
      },
    }).send(domain);
  }
}
