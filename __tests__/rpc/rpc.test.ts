import { describe, it, expect } from "vitest";
import { createBscConfig, createEthConfig, createZilliqaConfig, ZLP } from "../data";
import {
  generateErc20TransferData,
  NetworkProvider,
} from "../../background/rpc";
import { Address } from "../../crypto/address";
import { weieth, weigwei } from "micro-eth-signer";
import { TransactionRequest } from "../../crypto/tx";
import { ZILTransactionRequest } from "../../crypto/zilliqa_tx";
import {
  HistoricalTransaction,
} from "../../background/rpc/history_tx";
import { FToken } from "../../background/storage";
import { KeyPair } from "../../crypto/keypair";
import { hexToUint8Array } from "../../lib/utils/hex";
import { queryAccountFromPubKey } from "../data";
import { TransactionStatus } from '../../config/tx';
import { AddressType } from "../../config/wallet";
import type { TransactionRequestEVM } from "types/tx";

const pubKeys = [
  hexToUint8Array("0229fff97d3823f556f151623053415a7e8207742928e08dafe400c3d4a02642fd"),
  hexToUint8Array("03d6928f1e0127643059a268a2fc48e9267f288465932c5540af3603239a31d33b"),
  hexToUint8Array("03d235424094b812fe31458be3805265fb3eece18d84c44deb606874d19b3557e7"),
];

describe("JsonRPC provder tests", () => {
  const zilConfig = createZilliqaConfig();
  const ethConfig = createEthConfig();
  const bscConfig = createBscConfig();

  it("should get scilla ftoken metadata", async () => {
    const rpc = new NetworkProvider(zilConfig);
    const zlpContract = Address.fromStr(
      "zil1l0g8u6f9g0fsvjuu74ctyla2hltefrdyt7k5f4",
    );
    const accounts = [
      await queryAccountFromPubKey(
        hexToUint8Array("03b0194095e799a6a5f2e81a79fde0a927906c130520f050db263f0d9acbece1ba"),
      ),
    ];
    const result = await rpc.ftokenMeta(zlpContract, accounts);

    expect(result.addr).toBe(await zlpContract.toZilBech32());
    expect(result.addrType).toBe(AddressType.Bech32);
    expect(result.decimals).toBe(18);
    expect(result.symbol).toBe("ZLP");
    expect(result.name).toBe("ZilPay wallet");

    accounts.forEach((account) => {
      expect(result.balances[account.addrHash]).toBeDefined();
      expect(BigInt(result.balances[account.addrHash])).toBeGreaterThan(0);
    });
  });

  it("should get scilla ftoken metadata", async () => {
    const rpc = new NetworkProvider(ethConfig);
    const usdtContract = Address.fromStr(
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    );
    const accounts = await Promise.all(pubKeys.map(queryAccountFromPubKey));
    const result = await rpc.ftokenMeta(usdtContract, accounts);

    expect(result.addr).toBe(await usdtContract.toEthChecksum());
    expect(result.addrType).toBe(AddressType.EthCheckSum);
    expect(result.decimals).toBe(6);
    expect(result.name).toBe("Tether USD");
    expect(result.symbol).toBe("USDT");

    accounts.forEach((account) => {
      expect(result.balances[account.addrHash]).toBeDefined();
    });
  });

  it("test_calc_fee_eth_batch", async () => {
    const provider = new NetworkProvider(ethConfig);
    const tokenAddress = Address.fromStr(
      "0x524bC91Dc82d6b90EF29F76A3ECAaBAffFD490Bc",
    );
    const recipient = Address.fromStr(
      "0x246C5881E3F109B2aF170F5C773EF969d3da581B",
    );
    const from = Address.fromStr("0x451806FE45D9231eb1db3584494366edF05CB4AB");
    const amount = 100n;
    const transferData = generateErc20TransferData(
      await recipient.toEthChecksum(),
      amount,
    );
    const ethTx: TransactionRequestEVM = {
      to: await tokenAddress.toEthChecksum(),
      value: '0',
      maxFeePerGas: weigwei.decode("100").toString(),
      nonce: 0,
      chainId: ethConfig.chainId,
      data: transferData,
    };
    const txRequest = new TransactionRequest(
      {
        chainHash: ethConfig.hash(),
        token: {
          ...ethConfig.ftokens[0],
          balances: undefined,
        }
      },
      undefined,
      ethTx,
    );

    const fee = await provider.estimateGasParamsBatch(txRequest, from, 4, null);

    expect(fee.gasPrice).toBeGreaterThan(0n);
    expect(fee.nonce).toBeGreaterThan(0);
    expect(fee.maxPriorityFee).toBeGreaterThan(0n);
    expect(fee.txEstimateGas).toBe(22765n);
    expect(fee.feeHistory.baseFee).toBeGreaterThan(0n);
    expect(fee.feeHistory.maxFee).toBeGreaterThan(0n);
    expect(fee.feeHistory.priorityFee).toBeGreaterThan(0n);
  }, 20000);

  it("test_get_tx_params_payment_eth", async () => {
    const provider = new NetworkProvider(ethConfig);
    const recipient = Address.fromStr(
      "0x451806FE45D9231eb1db3584494366edF05CB4AB",
    );
    const from = Address.fromStr("0x451806FE45D9231eb1db3584494366edF05CB4AB");
    const amount = 100n;

    const ethTx: TransactionRequestEVM = {
      to: await recipient.toEthChecksum(),
      nonce: 0,
      value: amount.toString(),
      chainId: ethConfig.chainId,
      maxFeePerGas: weigwei.decode("100").toString(),
    };
    const txRequest = new TransactionRequest(
      {
        chainHash: ethConfig.hash(),
        token: {
          ...ethConfig.ftokens[0],
          balances: undefined,
        }
      },
      undefined,
      ethTx,
    );

    const fee = await provider.estimateGasParamsBatch(txRequest, from, 4, null);

    expect(fee.gasPrice).toBeGreaterThan(0n);
    expect(fee.nonce).toBeGreaterThan(0);
    expect(fee.maxPriorityFee).toBeGreaterThan(0n);
    expect(fee.txEstimateGas).toBe(21000n);
    expect(fee.blobBaseFee).toBeGreaterThan(0n);
    expect(fee.feeHistory.baseFee).toBeGreaterThan(0n);
    expect(fee.feeHistory.maxFee).toBeGreaterThan(0n);
    expect(fee.feeHistory.priorityFee).toBeGreaterThan(0n);
  }, 20000);

  it("test_calc_fee_bsc_batch", async () => {
    const provider = new NetworkProvider(bscConfig);
    const recipient = Address.fromStr(
      "0x246C5881E3F109B2aF170F5C773EF969d3da581B",
    );
    const from = Address.fromStr("0x7b501c7944185130DD4aD73293e8Aa84eFfDcee7");

    const bscTx: TransactionRequestEVM = {
      to: await recipient.toEthChecksum(),
      value: weieth.decode("1.1").toString(),
      maxFeePerGas: weigwei.decode("1").toString(),
      nonce: 0,
      chainId: bscConfig.chainId,
    };

    const txRequest = new TransactionRequest(
      {
        chainHash: bscConfig.hash(),
        token: {
          ...bscConfig.ftokens[0],
          balances: undefined,
        }
      },
      undefined,
      bscTx,
    );
    const fee = await provider.estimateGasParamsBatch(txRequest, from, 4, null);

    expect(fee.nonce).toBeGreaterThan(0);
    expect(fee.maxPriorityFee).toBeGreaterThan(1000n);
    expect(fee.txEstimateGas).toBe(21000n);
    expect(fee.blobBaseFee).toBe(1n);
    expect(fee.feeHistory.baseFee).toBe(0n);
    expect(fee.feeHistory.maxFee).toBeGreaterThanOrEqual(100n);
    expect(fee.feeHistory.priorityFee).toBeGreaterThan(1000000n);
  }, 20000);

  it("test_get_tx_prams_scilla", async () => {
    const provider = new NetworkProvider(zilConfig);
    const to = Address.fromStr("zil1xjj35ymsvf9ajqhprwh6pkvejm2lm2e9y4q4ev");
    const from = Address.fromStr("zil170u0aar9fjgu3hfma00wgk6axjl29l6hhnm2ua");

    const zilTx = new ZILTransactionRequest(
      zilConfig.chainId,
      1n,
      2000n * 10n ** 12n,
      100000n,
      to.bytes,
      10n ** 12n,
    );
    const txRequest = new TransactionRequest(
      {
        chainHash: zilConfig.hash(),
        token: {
          ...zilConfig.ftokens[0],
          balances: undefined,
        }
      },
      zilTx,
      undefined,
    );
    const params = await provider.estimateGasParamsBatch(
      txRequest,
      from,
      4,
      null,
    );

    expect(params.gasPrice).toBeDefined();
    expect(params.nonce).toBeGreaterThan(0);
  }, 20000);

  it("should get current block number for EVM", async () => {
    const provider = new NetworkProvider(bscConfig);
    const blockNumber = await provider.getCurrentBlockNumber();
    expect(typeof blockNumber).toBe("bigint");
    expect(blockNumber).toBeGreaterThan(0n);
  });

  it("should get current block number for Scilla", async () => {
    const provider = new NetworkProvider(zilConfig);
    const blockNumber = await provider.getCurrentBlockNumber();
    expect(typeof blockNumber).toBe("bigint");
    expect(blockNumber).toBeGreaterThan(0n);
  });

  it("should update multiple eth transaction receipts", async () => {
    const provider = new NetworkProvider(ethConfig);
    const mockTxns = [
      new HistoricalTransaction({
        status: TransactionStatus.Pending,
        metadata: {
          token: {
          ...ethConfig.ftokens[0],
              balances: undefined,
          },
          chainHash: ethConfig.hash(),
        },
        evm: {
          transactionHash: "0x1c38e47758ae1c69b8b339211261706fd16e93e1f84fecbd33b3b7cc9d1fefa1",
          from: "0x1c727a55ea3c11b0ab7d3a361fe0f3c47ce6de5d",
        } as any,
        timestamp: new Date().getSeconds(),
      }),
      new HistoricalTransaction({
        status: TransactionStatus.Pending,
        metadata: {
          token: {
            ...ethConfig.ftokens[0],
            balances: undefined,
          },
          chainHash: ethConfig.hash(),
        },
        evm: {
          transactionHash: "0x08dafea60b7cdac9b9ff2dfb3660c652820347ded94fb470d1cd68f0fbc7704a",
          from: "0x6cab48ab9945f0cb10b20d1181bae37a56d8e3d2",
        } as any,
        timestamp: new Date().getSeconds(),
      }),
    ];

    await provider.updateTransactionsHistory(mockTxns);

    expect(mockTxns[0].evm?.blockHash).toBeDefined();
    expect(mockTxns[0].evm?.blockNumber).toBeDefined();
    expect(mockTxns[0].evm?.status).toBe('0x1');
    expect(mockTxns[0].evm?.gasUsed).toBeDefined();
    expect(mockTxns[0].evm?.logs).toBeDefined();
    expect(mockTxns[0].evm?.logs?.length).toBeGreaterThan(0);

    expect(mockTxns[1].evm?.blockHash).toBeDefined();
    expect(mockTxns[1].evm?.blockNumber).toBeDefined();
    expect(mockTxns[1].evm?.status).toBe('0x1');
    expect(mockTxns[1].evm?.gasUsed).toBeDefined();
    expect(mockTxns[1].evm?.logs).toBeDefined();
    expect(mockTxns[1].evm?.logs?.length).toBeGreaterThan(0);

    expect(mockTxns[0].scilla).toBeUndefined();
    expect(mockTxns[1].scilla).toBeUndefined();
  }, 20000);

  it("should update multiple scilla transaction receipts", async () => {
    const provider = new NetworkProvider(zilConfig);
    const mockTxns = [
      new HistoricalTransaction({
        status: TransactionStatus.Pending,
        metadata: {
          token: {
            ...zilConfig.ftokens[1],
            balances: undefined,
          },
          chainHash: zilConfig.hash(),
        },
        scilla: {
          hash: "1878b575d736e88827c926f0251a13d639f605edb75ef916ab278485d96f1125",
          toAddr: "6eaf9b37f9870994f5853eb28405919f87e8dec2",
        } as any,
        timestamp: new Date().getSeconds(),
      }),
      new HistoricalTransaction({
        status: TransactionStatus.Pending,
        metadata: {
          token: {
            ...zilConfig.ftokens[1],
            balances: undefined,
          },
          chainHash: zilConfig.hash(),
        },
        scilla: {
          hash: "d4ffc62b9e7dd7764bc772959f5901e7d8149f1956fd9288116c073362373da4",
          toAddr: "fbd07e692543d3064b9cf570b27faabfd7948da4",
        } as any,
        timestamp: new Date().getSeconds(),
      }),
    ];

    await provider.updateTransactionsHistory(mockTxns);

    expect(mockTxns[0].status).toBe(TransactionStatus.Failed);
    expect(mockTxns[0].evm).toBeUndefined();
    expect(mockTxns[0].scilla?.hash).toBe("0x1878b575d736e88827c926f0251a13d639f605edb75ef916ab278485d96f1125");
    expect(mockTxns[0].scilla?.version).toBe("65537");
    expect(mockTxns[0].scilla?.nonce).toBe("1274");
    expect(mockTxns[0].scilla?.toAddr).toBe("6eaf9b37f9870994f5853eb28405919f87e8dec2");
    expect(mockTxns[0].scilla?.amount).toBe("0");
    expect(mockTxns[0].scilla?.gasPrice).toBe("2000000016");
    expect(mockTxns[0].scilla?.gasLimit).toBe("5000");
    expect(mockTxns[0].scilla?.data).toContain("CallRewards");
    expect(mockTxns[0].scilla?.senderPubKey).toBe("0x02f006b10b35ed60ac7cb79866b228a048b7d820561ec917b1ad3d2e5a851cedb9");
    expect(mockTxns[0].scilla?.priority).toBe(false);
    expect(mockTxns[0].scilla?.senderAddr).toBe("zil1wl38cwww2u3g8wzgutxlxtxwwc0rf7jf27zace");
    expect(mockTxns[0].scilla?.receipt?.success).toBe(false);
    expect(mockTxns[0].scilla?.receipt?.accepted).toBe(false);
    expect(mockTxns[0].scilla?.receipt?.exceptions).toBeDefined();
    expect(mockTxns[0].scilla?.receipt?.exceptions?.length).toBeGreaterThan(0);
    expect(mockTxns[0].scilla?.chainId).toBe(1);

    expect(mockTxns[1].status).toBe(TransactionStatus.Success);
    expect(mockTxns[1].evm).toBeUndefined();
    expect(mockTxns[1].scilla?.hash).toBe("0xd4ffc62b9e7dd7764bc772959f5901e7d8149f1956fd9288116c073362373da4");
    expect(mockTxns[1].scilla?.version).toBe("65537");
    expect(mockTxns[1].scilla?.nonce).toBe("1276");
    expect(mockTxns[1].scilla?.toAddr).toBe("fbd07e692543d3064b9cf570b27faabfd7948da4");
    expect(mockTxns[1].scilla?.amount).toBe("0");
    expect(mockTxns[1].scilla?.gasPrice).toBe("2000000016");
    expect(mockTxns[1].scilla?.gasLimit).toBe("2000");
    expect(mockTxns[1].scilla?.data).toContain("Transfer");
    expect(mockTxns[1].scilla?.senderPubKey).toBe("0x02f006b10b35ed60ac7cb79866b228a048b7d820561ec917b1ad3d2e5a851cedb9");
    expect(mockTxns[1].scilla?.priority).toBe(false);
    expect(mockTxns[1].scilla?.senderAddr).toBe("zil1wl38cwww2u3g8wzgutxlxtxwwc0rf7jf27zace");
    expect(mockTxns[1].scilla?.receipt?.success).toBe(true);
    expect(mockTxns[1].scilla?.receipt?.accepted).toBe(false);
    expect(mockTxns[1].scilla?.receipt?.event_logs).toBeDefined();
    expect(mockTxns[1].scilla?.receipt?.event_logs?.length).toBeGreaterThan(0);
    expect(mockTxns[1].scilla?.chainId).toBe(1);
  }, 20000);

  it("should update balances for multiple scilla tokens and accounts", async () => {
    const provider = new NetworkProvider(zilConfig);
    const tokens = [
      ...zilConfig.ftokens,
      new FToken({
        native: false,
        addr: "zil1sxx29cshups269ahh5qjffyr58mxjv9ft78jqy",
        name: "Zilliqa-bridged USDT token",
        symbol: "zUSDT",
        decimals: 6,
        addrType: AddressType.Bech32,
        balances: {},
        chainHash: zilConfig.hash(),
        default_: false,
        logo: null,
        rate: 0,
      }),
      ZLP,
    ];

    const accounts = await Promise.all(pubKeys.map(queryAccountFromPubKey));
    await provider.updateBalances(tokens, accounts);

    const addr0 = accounts[0].addrHash;
    const addr1 = accounts[1].addrHash;
    const addr2 = accounts[2].addrHash;

    expect(BigInt(tokens[0].balances[addr0])).toBeDefined();
    expect(BigInt(tokens[0].balances[addr1])).toBeDefined();
    expect(BigInt(tokens[0].balances[addr2])).toBeDefined();

    expect(BigInt(tokens[1].balances[addr0])).toBeDefined();
    expect(BigInt(tokens[1].balances[addr1])).toBeDefined();
    expect(BigInt(tokens[1].balances[addr2])).toBeDefined();

    expect(BigInt(tokens[2].balances[addr0])).toBeDefined();
    expect(BigInt(tokens[2].balances[addr1])).toBeDefined();
    expect(BigInt(tokens[2].balances[addr2])).toBeDefined();
  }, 20000);

  it("should update balances for multiple EVM tokens and accounts", async () => {
    const provider = new NetworkProvider(ethConfig);
    const tokens = [
      new FToken({
        native: true,
        addr: "0x0000000000000000000000000000000000000000",
        name: "Ethereum",
        symbol: "ETH",
        decimals: 18,
        addrType: AddressType.EthCheckSum,
        balances: {},
        chainHash: ethConfig.hash(),
        default_: true,
        logo: null,
        rate: 0,
      }),
      new FToken({
        native: false,
        addr: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
        name: "Wrapped BTC",
        symbol: "WBTC",
        decimals: 8,
        addrType: AddressType.EthCheckSum,
        balances: {},
        chainHash: ethConfig.hash(),
        default_: false,
        logo: null,
        rate: 0,
      }),
    ];

    const accounts = await Promise.all(pubKeys.map(queryAccountFromPubKey));
    await provider.updateBalances(tokens, accounts);

    const hash0 = accounts[0].addrHash;
    const hash1 = accounts[1].addrHash;

    expect(BigInt(tokens[0].balances[hash0])).toBeDefined();
    expect(BigInt(tokens[0].balances[hash1])).toBeDefined();

    expect(BigInt(tokens[1].balances[hash0])).toBeDefined();
    expect(BigInt(tokens[1].balances[hash1])).toBeDefined();
  }, 20000);

  it("should broadcast a signed Scilla transaction", async () => {
    const provider = new NetworkProvider(zilConfig);
    const keypair = await KeyPair.generate(zilConfig.slip44);
    const recipient = Address.fromStr(
      "zil1xjj35ymsvf9ajqhprwh6pkvejm2lm2e9y4q4ev",
    );

    const zilTx = new ZILTransactionRequest(
      zilConfig.chainId,
      0n,
      2000000000n,
      50n,
      recipient.bytes,
      1000000n,
    );
    const txRequest = new TransactionRequest(
      {
        chainHash: zilConfig.hash(),
        token: {
          ...zilConfig.ftokens[0],
          balances: undefined,
        }
      },
      zilTx,
    );
    const signedTx = await txRequest.sign(keypair);

    await expect(
      provider.broadcastSignedTransactions([signedTx]),
    ).rejects.toThrow("Invalid params");
  }, 20000);
});

