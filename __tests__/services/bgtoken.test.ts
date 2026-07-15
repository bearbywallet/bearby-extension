import type { BuildTokenTransferParams } from '../../types/tx';
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getGlobalState,
  walletFromBip39Mnemonic,
  walletFromPrivateKey,
} from "../../popup/background/wallet";
import { changeChainProvider } from "../../popup/background/provider";
import { buildTokenTransfer, rejectConfirm } from "../../popup/background/transactions";
import { GlobalState } from "../../background/state";
import { startBackground } from "../../background/background";
import { BrowserStorage } from "../../lib/storage";
import {
    BASE_SETTINGS,
  createBscConfig,
  createEthConfig,
  createSepoliaConfig,
  createZilliqaConfig,
  IMPORTED_KEY,
  PASSWORD,
  WORDS,
  ZLP,
} from "../data";
import { WORD_LIST } from '../crypto/word_list';
import { ZILLIQA } from "../../config/slip44";
import { AddressType } from "../../config/wallet";
import type {
  IKeyPair,
  WalletFromBip39Params,
  WalletFromPrivateKeyParams,
} from "../../types/wallet";
import { FToken, WalletSettings } from "../../background/storage";
import '../setupTests';
import { messageManager } from "../setupTests";
import { fetchNFTMeta } from 'popup/background/token';
import { NFTStandard } from 'config/token';
import { hashAddress } from '../../lib/utils/hashing';

describe("WalletService through background messaging", () => {
  let globalState: GlobalState;
  const zilMainnnetConfig = createZilliqaConfig();
  const bscMainnnetConfig = createBscConfig();

  beforeEach(async () => {
    await BrowserStorage.clear();
    messageManager.onMessage.clearListeners();
    const statePromise = GlobalState.fromStorage();
    globalState = await statePromise;
    startBackground(statePromise);
  });

  describe("Wallet Creation", () => {
    const keyPairZilliqa: IKeyPair = {
      privateKey: IMPORTED_KEY,
      publicKey:
        "0232970d0472220180c1779610f0ffae5a1ad79048b4f01f366c52d99317534024",
      address: "zil14at57zaj4pe3tuy734usy2xnlquapkd4d0ne43",
      slip44: ZILLIQA,
    };

    it("test build scilla tx transfer", async () => {
      const params: WalletFromPrivateKeyParams = {
        key: keyPairZilliqa,
        walletName: "My Imported Wallet",
        accountName: "Imported Account",
        chain: zilMainnnetConfig,
        password: PASSWORD,
        settings: new WalletSettings(BASE_SETTINGS),
      };

      let state = await walletFromPrivateKey(params);

      const token = state.wallets[0].tokens[1];
      const txParams: BuildTokenTransferParams = {
        walletIndex: 0,
        accountIndex: 0,
        tokenAddr: token.addr,
        to: 'zil1wl38cwww2u3g8wzgutxlxtxwwc0rf7jf27zace',
        amount: '1',
      };

      await buildTokenTransfer(txParams);
      state = await getGlobalState();

      const confirm = state.wallets[0].confirm[0];
      const account = state.wallets[0].accounts[0];

      expect(confirm.metadata?.chainHash).toBe(account.chainHash);
      expect(confirm.metadata?.token.name).toBe(token.name);
      expect(confirm.metadata?.token.symbol).toBe(token.symbol);
      expect(confirm.metadata?.token.addr).toBe(token.addr);
      expect(confirm.metadata?.token.value).toBe(txParams.amount);
      expect(confirm.metadata?.token.recipient).toBe(txParams.to);

      expect(confirm.evm).toBeUndefined();
      expect(confirm.signMessageScilla).toBeUndefined();
      expect(confirm.signPersonalMessageEVM).toBeUndefined();
      expect(confirm.signTypedDataJsonEVM).toBeUndefined();

      expect(confirm.scilla?.chainId).toBe(1);
      expect(confirm.scilla?.toAddr).toBe("77e27c39ce572283b848e2cdf32cce761e34fa49");
      expect(confirm.scilla?.amount).toBe('1');
    });

    it("test build ERC20 token request", async () => {
      const ethNetConfig = createEthConfig();
      const params: WalletFromPrivateKeyParams = {
        key: keyPairZilliqa,
        walletName: "My ETH Wallet",
        accountName: "ETH 0",
        chain: ethNetConfig,
        password: PASSWORD,
        settings: new WalletSettings(BASE_SETTINGS),
      };

      let state = await walletFromPrivateKey(params);
      const token = state.wallets[0].tokens[0];

      const txParams: BuildTokenTransferParams = {
        walletIndex: 0,
        accountIndex: 0,
        tokenAddr: token.addr,
        to: '0xEC6bB19886c9D5f5125DfC739362Bf54AA23d51F',
        amount: '1',
      };

      await buildTokenTransfer(txParams);
      state = await getGlobalState();
      let confirm = state.wallets[0].confirm[0];
      let account = state.wallets[0].accounts[0];

      expect(confirm.metadata?.chainHash).toBe(account.chainHash);
      expect(confirm.metadata?.token.name).toBe(ethNetConfig.ftokens[0].name);
      expect(confirm.metadata?.token.symbol).toBe(ethNetConfig.ftokens[0].symbol);
      expect(confirm.metadata?.token.addr).toBe(ethNetConfig.ftokens[0].addr);
      expect(confirm.metadata?.token.value).toBe(txParams.amount);
      expect(confirm.metadata?.token.recipient).toBe(txParams.to);

      expect(confirm.scilla).toBeUndefined();
      expect(confirm.signMessageScilla).toBeUndefined();
      expect(confirm.signPersonalMessageEVM).toBeUndefined();
      expect(confirm.signTypedDataJsonEVM).toBeUndefined();

      expect(confirm.evm?.chainId).toBe(1);
      expect(confirm.evm?.to).toBe(txParams.to);
      expect(confirm.evm?.value).toBe(txParams.amount);

      await rejectConfirm(0, 0);
      state = await getGlobalState();

      const usdt = new FToken ({
        name: 'Tether USD',
        symbol: 'USDT',
        decimals: 6,
        addr: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        addrType: AddressType.EthCheckSum,
        logo: '',
        balances: {},
        rate: 0,
        default_: false,
        native: false,
        chainHash: ethNetConfig.hash(),       
      });
      state.wallets[0].tokens.push(usdt);
      await globalState.wallet.setGlobalState(state, () => null);
      state = await getGlobalState();

      const usdtTrasnferParams: BuildTokenTransferParams = {
        walletIndex: 0,
        accountIndex: 0,
        tokenAddr: usdt.addr,
        to: '0xEC6bB19886c9D5f5125DfC739362Bf54AA23d51F',
        amount: '1',
      };

      await buildTokenTransfer(usdtTrasnferParams);
      state = await getGlobalState();
      confirm = state.wallets[0].confirm[0];


      expect(confirm.scilla).toBeUndefined();
      expect(confirm.signMessageScilla).toBeUndefined();
      expect(confirm.signPersonalMessageEVM).toBeUndefined();
      expect(confirm.signTypedDataJsonEVM).toBeUndefined();

      expect(confirm.evm?.from).toBe(account.addr);
      expect(confirm.evm?.to).toBe(usdt.addr);
      expect(confirm.evm?.value).toBe('0');
      expect(confirm.evm?.chainId).toBe(ethNetConfig.chainId);
      expect(confirm.evm?.data).toBe("0xa9059cbb000000000000000000000000ec6bb19886c9d5f5125dfc739362bf54aa23d51f0000000000000000000000000000000000000000000000000000000000000001");

      expect(confirm.metadata?.chainHash).toBe(account.chainHash);
      expect(confirm.metadata?.token.name).toBe(usdt.name);
      expect(confirm.metadata?.token.symbol).toBe(usdt.symbol);
      expect(confirm.metadata?.token.addr).toBe(usdt.addr);
      expect(confirm.metadata?.token.value).toBe(usdtTrasnferParams.amount);
      expect(confirm.metadata?.token.recipient).toBe(usdtTrasnferParams.to);
    });

    it("try ZRC2 tokens build", async () => {
      const bip39Params: WalletFromBip39Params = {
        mnemonic: WORDS,
        bip39WordList: WORD_LIST,
        walletName: "My BIP39 Wallet",
        accounts: [{ index: 0, name: "Main Account" }],
        verifyCheckSum: true,
        chain: zilMainnnetConfig,
        password: PASSWORD,
        settings: new WalletSettings(BASE_SETTINGS),
      };

      let state = await walletFromBip39Mnemonic(bip39Params);

      await globalState.wallet.setGlobalState(state, () => null);
      state = await getGlobalState();
      let wallet = state.wallets[0];


      wallet.tokens.push(ZLP);
      await globalState.wallet.setGlobalState(state, () => null);

      state = await getGlobalState();

      state.chains.push(bscMainnnetConfig);
      await globalState.wallet.setGlobalState(state, () => null);
      state = await changeChainProvider(0, 1);
      wallet = state.wallets[0];
      
      expect(wallet.accounts[0].chainHash).toBe(state.chains[1].hash());
      expect(wallet.accounts[0].chainId).toBe(state.chains[1].chainId);
      expect(wallet.defaultChainHash).toBe(state.chains[0].hash());
      expect(wallet.tokens[0]).equals(state.chains[1].ftokens[0]);
      expect(wallet.tokens[0].chainHash).equals(wallet.accounts[0].chainHash);
      expect(wallet.tokens[0].default_).toBeTruthy();
      expect(wallet.tokens[0].native).toBeTruthy();

      state = await changeChainProvider(0, 0);

      const params: BuildTokenTransferParams = {
        walletIndex: 0,
        accountIndex: 0,
        tokenAddr: ZLP.addr,
        to: 'zil1wl38cwww2u3g8wzgutxlxtxwwc0rf7jf27zace',
        amount: '1',
      };

      await buildTokenTransfer(params);

      state = await getGlobalState();

      expect(state.wallets[0].confirm).toHaveLength(1);

      const confirm = state.wallets[0].confirm[0];
      const account = state.wallets[0].accounts[0];

      expect(confirm.metadata?.chainHash).toBe(account.chainHash);
      expect(confirm.metadata?.token.name).toBe(ZLP.name);
      expect(confirm.metadata?.token.symbol).toBe(ZLP.symbol);
      expect(confirm.metadata?.token.addr).toBe("zil1l0g8u6f9g0fsvjuu74ctyla2hltefrdyt7k5f4");
      expect(confirm.metadata?.token.value).toBe(params.amount);
      expect(confirm.metadata?.token.recipient).toBe(params.to);

      expect(confirm.evm).toBeUndefined();
      expect(confirm.signMessageScilla).toBeUndefined();
      expect(confirm.signPersonalMessageEVM).toBeUndefined();
      expect(confirm.signTypedDataJsonEVM).toBeUndefined();

      expect(confirm.scilla?.chainId).toBe(1);
      expect(confirm.scilla?.toAddr).toBe("fbd07e692543d3064b9cf570b27faabfd7948da4");
      expect(confirm.scilla?.amount).toBe('0');
      expect(confirm.scilla?.data).toBe('{"_tag":"Transfer","params":[{"vname":"to","type":"ByStr20","value":"0x77e27c39ce572283b848e2cdf32cce761e34fa49"},{"vname":"amount","type":"Uint128","value":"1"}]}');

      await rejectConfirm(0, 0);
      state = await getGlobalState();

      expect(state.wallets[0].confirm).toHaveLength(0);
    });
  });

  describe("NFT Metadata Fetching", () => {
    const keyPairZilliqa: IKeyPair = {
      privateKey: IMPORTED_KEY,
      publicKey:
        "0232970d0472220180c1779610f0ffae5a1ad79048b4f01f366c52d99317534024",
      address: "zil14at57zaj4pe3tuy734usy2xnlquapkd4d0ne43",
      slip44: ZILLIQA,
    };

    it("should fetch ZRC1 NFT metadata from Zilliqa mainnet", async () => {
      const params: WalletFromPrivateKeyParams = {
        key: keyPairZilliqa,
        walletName: "My ZIL Wallet",
        accountName: "ZIL 0",
        chain: zilMainnnetConfig,
        password: PASSWORD,
        settings: new WalletSettings(BASE_SETTINGS),
      };

      await walletFromPrivateKey(params);

      const zrc6Contract = "zil1knvrhm9e2rqfdvqp50gu02a3pat34e6lst9d36";
      const nftMetadata = await fetchNFTMeta(0, zrc6Contract);

      expect(nftMetadata).toBeDefined();
      expect(nftMetadata.standard).toBe(NFTStandard.ZRC6);
      expect(nftMetadata.contractAddress).toBe(zrc6Contract);
      expect(nftMetadata.name).toBe("DragonZIL");
      expect(nftMetadata.symbol).toBe("DZT");
      const state = await getGlobalState();
      const balanceKey = hashAddress(state.wallets[0].accounts[0].addr);
      expect(JSON.stringify(nftMetadata.balances)).equal(JSON.stringify({
        [balanceKey]: {
          "3134": {
            "id": "3134",
            "url": "https://res.cloudinary.com/dev5gmsvw/image/upload/1_3134.png"
          }
        }
      }));
    }, 30000);

    it("should fetch ZRC6 with balance check", async () => {
      const params: WalletFromPrivateKeyParams = {
        key: keyPairZilliqa,
        walletName: "My ZIL Wallet",
        accountName: "ZIL 0",
        chain: zilMainnnetConfig,
        password: PASSWORD,
        settings: new WalletSettings(BASE_SETTINGS),
      };

      await walletFromPrivateKey(params);

      const zrc6Contract = "zil1zsqcprkghffsg9fe8cjsqyxry4mdgwytdvzklu";
      const nftMetadata = await fetchNFTMeta(0, zrc6Contract);

      expect(nftMetadata).toBeDefined();
      expect(nftMetadata.standard).toBe(NFTStandard.ZRC6);
      const state = await getGlobalState();
      const balanceKey = hashAddress(state.wallets[0].accounts[0].addr);
      expect(JSON.stringify(nftMetadata.balances)).toEqual(JSON.stringify({
        [balanceKey]: {
          "1": {
            "id": "1",
            "url": "https://res.cloudinary.com/dev5gmsvw/image/upload/1_3134.png"
          }
        }
    }));
    expect(nftMetadata.contractAddress).toBe("zil1zsqcprkghffsg9fe8cjsqyxry4mdgwytdvzklu");
    expect(nftMetadata.baseURI).toBe("https://res.cloudinary.com/dev5gmsvw/image/upload/");
    }, 30000);

   it("should fetch ERC721 NFT metadata", async () => {
      const params: WalletFromPrivateKeyParams = {
        key: keyPairZilliqa,
        walletName: "My Testnet Wallet",
        accountName: "Testnet 0",
        chain: createSepoliaConfig(),
        password: PASSWORD,
        settings: new WalletSettings(BASE_SETTINGS),
      };

      await walletFromPrivateKey(params);

      const erc721Contract = "0x4642f466Ede9EFD5ec1fbA12f75E7D2CA685202f";
      const nftMetadata = await fetchNFTMeta(0, erc721Contract);

      expect(nftMetadata).toBeDefined();
      expect(nftMetadata.standard).toBe(NFTStandard.ERC721);
      expect(nftMetadata.contractAddress).toBe(erc721Contract);
      expect(nftMetadata.name).toBe("SimpleNFT");
      expect(nftMetadata.symbol).toBe("SNFT");
      const state = await getGlobalState();
      const balanceKey = hashAddress(state.wallets[0].accounts[0].addr);
      expect(JSON.stringify(nftMetadata.balances)).toEqual(JSON.stringify({
        [balanceKey]: {}
      }));
      expect(nftMetadata.totalSupply).toBe('');
      expect(nftMetadata.baseURI).toBeUndefined();
    }, 30000);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });
});
