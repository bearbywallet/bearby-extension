import { FToken } from "../background/storage/ftoken";
import { ChainConfig } from "../background/storage/chain";
import { hashChainConfig } from "../lib/utils/hashing";
import { AddressType } from "../config/wallet";
import mainnetChains from "../public/chains/mainnet.json";
import testnetChains from "../public/chains/testnet.json";
import { GasSpeed } from "../config/gas";
import { ShaAlgorithms } from "../config/pbkdf2";
import { HashTypes } from "../config/argon2";
import { HRP } from "lib/zilliqa";
import { Address } from "../crypto/address";
import { ETHEREUM, ZILLIQA } from "../config/slip44";
import { toQueryAccount, type QueryAccount } from "../background/rpc/query_account";

export const WORDS =
  "rule hard brush glare magic east glimpse tank junk will media submit";
export const PASSWORD = "iA3J&UKNRSp7Y3&yhzo68gjib9L&Vh*W1mT1zS6T";
export const KEY =
  "717da2dd3d2ca78461d814c0bfbdbaf3e676be396585f83a0fbee04e89e0a64d";
export const IMPORTED_KEY =
  "7e5727ce710c2e96c152a7a1e5c571c6695539866b407a578575981e92177ae4";
export const STORAGE_V2 = {
  "address-format": "bech32",
  blocknumber: "0",
  connect: "undefined",
  "connection-list": "[]",
  contacts: "[]",
  "phishing-detection": "1",
  "popup-enabled": "1",
  "rate-of-currencies": '{"usd":0.01126979,"btc":1.07634e-7,"eth":0.0000045}',
  "selected-currency": "usd",
  "selected-local": "auto",
  "ssn-list":
    '{"selected":0,"list":[{"address":"0x0000000000000000000000000000000000000000","api":"https://api.zilliqa.com","id":1,"name":"Main","ok":true,"time":420}]}',
  theme: "light",
  time_before_lock: "3",
  "tokens-list/mainnet":
    '[{"base16":"0x0000000000000000000000000000000000000000","bech32":"zil1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9yf6pz","decimals":12,"name":"Zilliqa","symbol":"ZIL","rate":1},{"base16":"0xfbd07e692543d3064b9cf570b27faabfd7948da4","bech32":"zil1l0g8u6f9g0fsvjuu74ctyla2hltefrdyt7k5f4","decimals":18,"name":"ZilPay wallet","symbol":"ZLP","rate":2.7688998049}]',
  vault:
    "U2FsdGVkX19+DrC9DG/qvYEC6koZfMhpQl6K4eVH5GSE1qXyn4vENND7zZFNT5R4yZM/45MiWMTw+Olu2Va948mputTGoby3VfmNmIm1uiVgRYt6hycdMiUBFuWs0KqN",
  "wallet-identities":
    '{"selectedAddress":1,"identities":[{"name":"Account 0","bech32":"zil1ntrynx04349sk6py7uyata03gka6qswg7um95y","index":0,"base16":"0x9ac64999F58d4b0B6824f709D5f5f145BBA041c8","type":2,"pubKey":"0316f2d913f13c6aa15ad5c80b58464d25b6363a1b9d997260e8061977a3f43e10","zrc2":{"0x0000000000000000000000000000000000000000":"0","0xfbd07e692543d3064b9cf570b27faabfd7948da4":"0"},"nft":{}},{"name":"Imported 0","bech32":"zil14at57zaj4pe3tuy734usy2xnlquapkd4d0ne43","index":0,"base16":"0xaf574f0BB2a87315F09e8d790228D3F839D0d9B5","type":1,"pubKey":"0232970d0472220180c1779610f0ffae5a1ad79048b4f01f366c52d99317534024","privKey":"U2FsdGVkX1+E7PpB7lTzKwR7J0aWq1xJWMTNRrxo3Vd76jcnA7GmMTS9DtkRQCkAWJdYemsAVH90lMRGzLFOYPYxd6UhNsPWiGD7MlNxvfHtRdL64G+tdULtICMXB23F","zrc2":{"0x0000000000000000000000000000000000000000":"0","0xfbd07e692543d3064b9cf570b27faabfd7948da4":"0"},"nft":{}}]}',
};
export const STORAGE_V3 = {
  "address-format": "bech32",
  "badge-counter": "0",
  blocknumber: "0",
  "confirm/mainnet": "[]",
  connect: "undefined",
  "connection-list": "[]",
  contacts: "[]",
  "dex-proto":
    '{"liquidityFee":0,"protocolFee":0,"slippage":1,"blocks":10,"rewarded":"0x0000000000000000000000000000000000000000","contract":{"mainnet":"0x30dfe64740ed459ea115b517bd737bbadf21b838","testnet":"0xb0c677b5ba660925a8f1d5d9687d0c2c379e16ee","private":""}}',
  "guard-configuration": "SHA-512:442368",
  "phishing-detection": "1",
  "popup-enabled": "1",
  "rate-of-currencies":
    '{"aed":0.04247757,"amd":4.44,"ars":13.71,"aud":0.01781949,"bdt":1.41,"bhd":0.00435975,"brl":0.065154,"btc":1.099e-7,"cad":0.01581764,"chf":0.00947171,"clp":10.85,"cny":0.083074,"cop":47.37,"crc":5.88,"czk":0.251386,"dkk":0.075591,"dop":0.682575,"eth":0.0000044,"eur":0.01013389,"gbp":0.0085369,"gel":0.0317456,"gtq":0.088835,"hkd":0.090732,"hnl":0.300787,"huf":4.08,"idr":188.38,"ils":0.04029691,"inr":0.99304,"jpy":1.65,"kes":1.5,"krw":15.73,"lbp":1035.62,"lkr":3.46,"ltc":0.00013082,"mmk":24.26,"mxn":0.222062,"myr":0.04908136,"ngn":18.22,"nok":0.116999,"nzd":0.01918035,"pen":0.04188673,"php":0.643042,"pkr":3.26,"pln":0.04338162,"ron":0.05104161,"rub":0.917076,"sar":0.0433747,"sek":0.110942,"sgd":0.01488506,"svc":0.101144,"thb":0.377194,"try":0.454718,"twd":0.346177,"uah":0.479191,"usd":0.01156488,"vnd":301.88,"xrp":0.00524131,"zar":0.206394}',
  "selected-currency": "btc",
  "selected-local": "auto",
  "ssn-list":
    '{"selected":0,"list":[{"address":"0x0000000000000000000000000000000000000000","api":"https://api.zilliqa.com","id":1,"name":"Main","ok":true,"time":420}]}',
  theme: "light",
  time_before_lock: "3",
  "tokens-list/mainnet":
    '[{"base16":"0x0000000000000000000000000000000000000000","bech32":"zil1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9yf6pz","decimals":12,"name":"Zilliqa","symbol":"ZIL","rate":1,"pool":[]},{"base16":"0xfbd07e692543d3064b9cf570b27faabfd7948da4","bech32":"zil1l0g8u6f9g0fsvjuu74ctyla2hltefrdyt7k5f4","decimals":18,"name":"ZilPay wallet","symbol":"ZLP","rate":2.7915277475,"pool":["65618957804322222","23506468048851034758203"]},{"base16":"0xe6f14afc8739a4ead0a542c07d3ff978190e3b92","bech32":"zil1umc54ly88xjw4599gtq860le0qvsuwuj72s246","decimals":12,"name":"StZIL","symbol":"stZIL","rate":1.2063766095,"pool":["363937420859731210","301678114446274419"]}]',
  vault:
    "ZGM1ODdhZGI0YWVhY2E3Njk4MDJlYTEyMzMxOGY5OGZlMjMxMzNhYzY1ZDc4ZTUzYjFiZmI0YTYxNDY5OTAzZGQ2NDAzNWFjZmQzNGVkODZjYzc3NTc0NWE4NjI4N2Y3NWI0OTdiYzk4OGFjMzg0MDM5MWY5MGJjY2FmMjllNmU4NmEyMjJkMy8zODIzZWMwNmEyMDA4ZDZhODcyMTY3MzAwMzlmZTBlYw==",
  "wallet-identities":
    '{"selectedAddress":1,"identities":[{"name":"Account 0","bech32":"zil1ntrynx04349sk6py7uyata03gka6qswg7um95y","index":0,"base16":"0x9ac64999F58d4b0B6824f709D5f5f145BBA041c8","type":2,"pubKey":"0316f2d913f13c6aa15ad5c80b58464d25b6363a1b9d997260e8061977a3f43e10","zrc2":{"0x0000000000000000000000000000000000000000":"0","0xfbd07e692543d3064b9cf570b27faabfd7948da4":"0","0xe6f14afc8739a4ead0a542c07d3ff978190e3b92":"0"},"nft":{}},{"name":"Imported 0","bech32":"zil14at57zaj4pe3tuy734usy2xnlquapkd4d0ne43","index":0,"base16":"0xaf574f0BB2a87315F09e8d790228D3F839D0d9B5","type":1,"pubKey":"0232970d0472220180c1779610f0ffae5a1ad79048b4f01f366c52d99317534024","privKey":"OGRmNzA0YzAzM2Q4ZmVhODM4ODFlMmYyZjI3ZDIyMzQ4NTM1ZmZiZDVjNDMzNmM1MDBjZWM4YzU4ZDg2YWU5Yi82NTVkYWRjZWZkNDZiODEyOWRhYzZhZTUxMjE2NTdiMQ==","zrc2":{"0x0000000000000000000000000000000000000000":"0","0xfbd07e692543d3064b9cf570b27faabfd7948da4":"0","0xe6f14afc8739a4ead0a542c07d3ff978190e3b92":"0"},"nft":{}}]}',
};
export const EXTENSION_ID = "klnaejjgbibmhlephnhpmaofohgkpgkd";

export const CHAINS = JSON.parse(`[
    {
    "name": "Zilliqa",
    "chain": "ZIL",
    "logo": "https://raw.githubusercontent.com/zilpay/tokens_meta/refs/heads/master/ft/%{shortName}%/chain/%{dark,light}%.svg",
    "rpc": [
      "https://api.zilliqa.com",
      "https://ssn.zilpay.io/api"
    ],
    "features": [],
    "ftokens": [
      {
        "native": true,
        "logo": "https://raw.githubusercontent.com/zilpay/tokens_meta/refs/heads/master/ft/zilliqa/%{contract_address}%/%{dark,light}%.webp",
        "addr": "0x0000000000000000000000000000000000000000",
        "name": "Zilliqa",
        "symbol": "ZIL",
        "decimals": 18
      },
      {
        "native": true,
        "logo": "https://raw.githubusercontent.com/zilpay/tokens_meta/refs/heads/master/ft/zilliqa/%{contract_address}%/%{dark,light}%.webp",
        "addr": "zil1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9yf6pz",
        "name": "Zilliqa",
        "symbol": "ZIL",
        "decimals": 12
      }
    ],
    "chainIds": [32769, 1],
    "infoURL": "https://www.zilliqa.com/",
    "shortName": "zilliqa",
    "slip44": 313,
    "explorers": [
      {
        "name": "Otterscan",
        "icon": "https://otterscan.zilliqa.com/assets/otter-DYFeLtFi.png",
        "url": "https://otterscan.zilliqa.com/",
        "standard": "EIP3091"
      }
    ]
  },
  {
    "name": "Binance testnet",
    "chain": "BNB",
    "logo": "https://raw.githubusercontent.com/zilpay/tokens_meta/refs/heads/master/ft/%{shortName}%/chain/%{dark,light}%.svg",
    "rpc": [
      "https://data-seed-prebsc-1-s1.binance.org:8545/",
      "https://data-seed-prebsc-2-s1.binance.org:8545/",
      "http://data-seed-prebsc-1-s2.binance.org:8545/",
      "http://data-seed-prebsc-2-s2.binance.org:8545/",
      "https://data-seed-prebsc-1-s3.binance.org:8545/",
      "https://data-seed-prebsc-2-s3.binance.org:8545/"
    ],
    "features": [
      "EIP1559",
      "EIP155",
      "EIP4844"
    ],
    "ftokens": [
      {
        "native": true,
        "logo": "https://raw.githubusercontent.com/zilpay/tokens_meta/refs/heads/master/ft/bnbchain/%{contract_address}%/%{dark,light}%.webp",
        "addr": "0x0000000000000000000000000000000000000000",
        "name": "BinanceCoin",
        "symbol": "BNB",
        "decimals": 18
      }
    ],
    "infoURL": "https://www.bnbchain.org",
    "shortName": "bnbchain",
    "testnet": true,
    "chainIds": [97, 0],
    "slip44": 60,
    "explorers": [
      {
        "name": "BscScan",
        "url": "https://testnet.bscscan.com",
        "icon": "https://bscscan.com/assets/bsc/images/svg/brandassets/logo-symbol.svg",
        "standard": "EIP3091"
      }
    ]
  },
  {
    "name": "Sepolia",
    "logo": "https://raw.githubusercontent.com/zilpay/tokens_meta/refs/heads/master/ft/ethereum/chain/%{dark,light}%.svg",
    "chain": "ETH",
    "rpc": [
      "https://sepolia.infura.io/v3/b6bf7d3508c941499b10025c0776eaf8",
      "https://rpc-sepolia.rockx.com",
      "https://rpc.sepolia.dev"
    ],
    "features": [
      "EIP155",
      "EIP1559",
      "EIP4844"
    ],
    "ftokens": [
      {
        "native": true,
        "addr": "0x0000000000000000000000000000000000000000",
        "name": "Ethereum",
        "logo": "https://raw.githubusercontent.com/zilpay/tokens_meta/refs/heads/master/ft/bnbchain/%{contract_address}%/%{dark,light}%.webp",
        "symbol": "ETH",
        "decimals": 18
      }
    ],
    "testnet": true,
    "infoURL": "https://sepolia.dev/",
    "shortName": "ethereum",
    "chainIds": [11155111, 0],
    "slip44": 60,
    "explorers": [
      {
        "name": "Etherscan",
        "url": "https://sepolia.etherscan.io/",
        "icon": "https://etherscan.io/images/brandassets/etherscan-logo-circle.svg",
        "standard": "EIP3091"
      }
    ]
  }
]`);

export const ZERO_ADDR_BECH32 = "zil1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9yf6pz";
export const ZERO_ADDR_HEX = "0x0000000000000000000000000000000000000000";

export const createZilliqaConfig = (): ChainConfig =>
  new ChainConfig({
    ...mainnetChains[2],
    features: mainnetChains[2].features.map((n) =>
      Number(n.replace("EIP", "")),
    ),
    explorers: [],
    fallbackEnabled: true,
    batchRequest: true,
    testnet: true,
    ftokens: mainnetChains[2].ftokens.map(
      (t) =>
        new FToken({
          ...t,
          default_: true,
          balances: {},
          rate: 0,
          addrType: AddressType.EthCheckSum,
          chainHash: hashChainConfig(
            mainnetChains[2].chainIds,
            mainnetChains[2].slip44,
            mainnetChains[2].chain,
          ),
        }),
    ),
    chainId: mainnetChains[2].chainIds[0],
    ens: null,
    diffBlockTime: 1,
  });

export const createBscConfig = (): ChainConfig =>
  new ChainConfig({
    ...mainnetChains[0],
    features: mainnetChains[0].features.map((n) =>
      Number(n.replace("EIP", "")),
    ),
    explorers: [],
    fallbackEnabled: true,
    batchRequest: true,
    testnet: true,
    ftokens: mainnetChains[0].ftokens.map(
      (t) =>
        new FToken({
          ...t,
          default_: true,
          balances: {},
          rate: 0,
          addrType: AddressType.EthCheckSum,
          chainHash: hashChainConfig(
            mainnetChains[0].chainIds,
            mainnetChains[0].slip44,
            mainnetChains[0].chain,
          ),
        }),
    ),
    chainId: mainnetChains[0].chainIds[0],
    ens: null,
    diffBlockTime: 1,
  });

export const createEthConfig = (): ChainConfig =>
  new ChainConfig({
    ...mainnetChains[1],
    features: mainnetChains[1].features.map((n) =>
      Number(n.replace("EIP", "")),
    ),
    explorers: [],
    fallbackEnabled: true,
    batchRequest: true,
    testnet: true,
    ftokens: mainnetChains[1].ftokens.map(
      (t) =>
        new FToken({
          ...t,
          default_: true,
          balances: {},
          rate: 0,
          addrType: AddressType.EthCheckSum,
          chainHash: hashChainConfig(
            mainnetChains[1].chainIds,
            mainnetChains[1].slip44,
            mainnetChains[1].chain,
          ),
        }),
    ),
    chainId: mainnetChains[1].chainIds[0],
    ens: null,
    diffBlockTime: 1,
  });

export const createSepoliaConfig = (): ChainConfig =>
  new ChainConfig({
    ...testnetChains[2],
    features: testnetChains[2].features.map((n) =>
      Number(n.replace("EIP", "")),
    ),
    explorers: [],
    fallbackEnabled: true,
    batchRequest: false,
    testnet: true,
    ftokens: testnetChains[2].ftokens.map(
      (t) =>
        new FToken({
          ...t,
          default_: true,
          balances: {},
          rate: 0,
          addrType: AddressType.EthCheckSum,
          chainHash: hashChainConfig(
            testnetChains[2].chainIds,
            testnetChains[2].slip44,
            testnetChains[2].chain,
          ),
        }),
    ),
    chainId: testnetChains[2].chainIds[0],
    ens: null,
    diffBlockTime: 1,
  });

export const createZilliqaTestnetConfig = (): ChainConfig =>
  new ChainConfig({
    ...testnetChains[2],
    features: testnetChains[2].features.map((n) =>
      Number(n.replace("EIP", "")),
    ),
    explorers: [],
    fallbackEnabled: true,
    batchRequest: true,
    testnet: true,
    ftokens: testnetChains[2].ftokens.map(
      (t) =>
        new FToken({
          ...t,
          default_: true,
          balances: {},
          rate: 0,
          addrType: t.addr.startsWith(HRP)
            ? AddressType.Bech32
            : AddressType.EthCheckSum,
          chainHash: hashChainConfig(
            testnetChains[2].chainIds,
            testnetChains[2].slip44,
            testnetChains[2].chain,
          ),
        }),
    ),
    chainId: testnetChains[2].chainIds[0],
    ens: null,
    diffBlockTime: 1,
  });

export const createBscTestNetConfig = (): ChainConfig =>
  new ChainConfig({
    ...testnetChains[1],
    features: testnetChains[1].features.map((n) =>
      Number(n.replace("EIP", "")),
    ),
    explorers: [],
    fallbackEnabled: true,
    batchRequest: true,
    testnet: true,
    ftokens: testnetChains[1].ftokens.map(
      (t) =>
        new FToken({
          ...t,
          default_: true,
          balances: {},
          rate: 0,
          addrType: AddressType.EthCheckSum,
          chainHash: hashChainConfig(
            testnetChains[1].chainIds,
            testnetChains[1].slip44,
            testnetChains[1].chain,
          ),
        }),
    ),
    chainId: testnetChains[1].chainIds[0],
    ens: null,
    diffBlockTime: 1,
  });

export const BASE_SETTINGS = {
  gasOption: GasSpeed.Market,
  cipherOrders: [1],
  hashFnParams: {
    memory: 64,
    iterations: 1,
    threads: 1,
    secret: "",
    hashType: HashTypes.Argon2,
    hashSize: ShaAlgorithms.sha256,
  },
  currencyConvert: "btc",
  ipfsNode: null,
  ensEnabled: false,
  tokensListFetcher: false,
  nodeRankingEnabled: false,
  maxConnections: 10,
  requestTimeoutSecs: 30,
  ratesApiOptions: 0,
  sessionTime: 60,
};

export const ZLP = new FToken({
  name: "ZilPay wallet",
  symbol: "ZLP",
  decimals: 18,
  addr: "zil1l0g8u6f9g0fsvjuu74ctyla2hltefrdyt7k5f4",
  addrType: 0,
  logo: "",
  balances: {},
  rate: 0,
  default_: false,
  native: false,
  chainHash: 208425510,
});

export async function queryAccountFromPubKey(pubKey: Uint8Array): Promise<QueryAccount> {
  const zilAddr = await Address.fromPubKey(pubKey, ZILLIQA);
  const ethAddr = await Address.fromPubKey(pubKey, ETHEREUM);
  return toQueryAccount({
    addr: `${await zilAddr.toZilBech32()}:${await ethAddr.toEthChecksum()}`,
  });
}
