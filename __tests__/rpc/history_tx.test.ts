import { describe, it, expect } from "vitest";
import {
  HistoricalTransaction,
} from "../../background/rpc/history_tx";
import { generateErc20TransferData } from "../../background/rpc";
import { TransactionRequest } from "../../crypto/tx";
import { Address } from "../../crypto/address";
import { KeyPair } from "../../crypto/keypair";
import { createBscConfig, createZilliqaConfig } from "../data";
import { weieth, weigwei } from "micro-eth-signer";
import type { TransactionMetadata, TransactionRequestEVM } from '../../types/tx';
import { TransactionStatus } from '../../config/tx';
import { ZILTransactionRequest } from "../../crypto/zilliqa_tx";
import { HEX_PREFIX } from "../../lib/utils/hex";

const ZIL_CONFIG = createZilliqaConfig();
const BSC_CONFIG = createBscConfig();

describe("HistoricalTransaction", () => {
  describe("Scilla Transactions Fail", () => {
    const mockResult = {
      ID: "1878b575d736e88827c926f0251a13d639f605edb75ef916ab278485d96f1125",
      version: "65537",
      nonce: "1274",
      toAddr: "6eaf9b37f9870994f5853eb28405919f87e8dec2",
      senderPubKey: "0x02f006b10b35ed60ac7cb79866b228a048b7d820561ec917b1ad3d2e5a851cedb9",
      amount: "0",
      signature: "0x9bc96ba0baba5a34cf6e4de6218ff7a7809763f6324912dff1c546ce0295e47b41bfb7eda6b6034eeeed69077088253e9d55eeb85dc77829c774fe45894d2eef",
      receipt: {
        accepted: false,
        gas_used: "1843",
        cumulative_gas_used: "1843",
        cumulative_gas: "1843",
        epoch_num: "10915779",
        transitions: [],
        event_logs: [],
        errors: { "0": [7] },
        exceptions: [
          {
            line: 175,
            message: "Exception thrown: (Message [(_exception : (String \"Error\")) ; (code : (Int32 -10))])"
          }
        ],
        success: false
      },
      gasPrice: "2000000016",
      gasLimit: "5000",
      code: null,
      data: "{\"_tag\":\"CallRewards\",\"params\":[{\"vname\":\"token_id\",\"type\":\"Uint256\",\"value\":\"1892\"}]}"
    };

    it("should create HistoricalTransaction from Scilla SignedTransaction", async () => {
      const keypair = await KeyPair.generate(ZIL_CONFIG.slip44);
      const recipient = Address.fromStr(
        "zil1d6hekdlesuyefav986eggpv3n7r73hkzcnpdjm",
      );
  
      const zilTx = new ZILTransactionRequest(
        ZIL_CONFIG.chainId,
        1274n,
        2000000016n,
        5000n,
        recipient.bytes,
        0n,
      );
  
      const metadata: TransactionMetadata = {
        chainHash: ZIL_CONFIG.hash(),
        token: {} as any,
      };
  
      const txReq = new TransactionRequest(metadata, zilTx);
      const signedTx = await txReq.sign(keypair);
  
      const mockHash = "0xd0b318e0f5f9b1f1d03010b582488e6c0e463c94c315ec0cbeca839d0f3184e7";
      const historicalTx = await HistoricalTransaction.fromSignedTransaction(
        signedTx,
        mockHash
      );

      expect(historicalTx.scilla).toBeDefined();
      expect(historicalTx.scilla!.hash).toBe(mockHash);
      expect(historicalTx.scilla!.nonce).toBe("1274");
      expect(historicalTx.scilla!.gasLimit).toBe("5000");
      expect(historicalTx.scilla!.gasPrice).toBe("2000000016");
      expect(historicalTx.scilla!.amount).toBe("0");
      expect(historicalTx.status).toBe(TransactionStatus.Pending);

      await historicalTx.updateFromJsonRPCResult(mockResult);

      expect(historicalTx.status).toBe(TransactionStatus.Failed);
      expect(historicalTx.scilla).toBeDefined();
      expect(historicalTx.scilla!.hash).toBe("0x1878b575d736e88827c926f0251a13d639f605edb75ef916ab278485d96f1125");
      expect(historicalTx.scilla!.version).toBe("65537");
      expect(historicalTx.scilla!.nonce).toBe("1274");
      expect(historicalTx.scilla!.toAddr).toBe("6eaf9b37f9870994f5853eb28405919f87e8dec2");
      expect(historicalTx.scilla!.senderPubKey).toBe("0x02f006b10b35ed60ac7cb79866b228a048b7d820561ec917b1ad3d2e5a851cedb9");
      expect(historicalTx.scilla!.amount).toBe("0");
      expect(historicalTx.scilla!.signature).toBe("0x9bc96ba0baba5a34cf6e4de6218ff7a7809763f6324912dff1c546ce0295e47b41bfb7eda6b6034eeeed69077088253e9d55eeb85dc77829c774fe45894d2eef");
      expect(historicalTx.scilla!.gasPrice).toBe("2000000016");
      expect(historicalTx.scilla!.gasLimit).toBe("5000");
      expect(historicalTx.scilla!.data).toBe("{\"_tag\":\"CallRewards\",\"params\":[{\"vname\":\"token_id\",\"type\":\"Uint256\",\"value\":\"1892\"}]}");
      expect(historicalTx.scilla!.code).toBe("");
      expect(historicalTx.scilla!.senderAddr).toBe("zil1wl38cwww2u3g8wzgutxlxtxwwc0rf7jf27zace");
      expect(historicalTx.scilla!.chainId).toBe(1);
      expect(historicalTx.scilla!.receipt).toBeDefined();
      expect(historicalTx.scilla!.receipt!.success).toBe(false);
      expect(historicalTx.scilla!.receipt!.accepted).toBe(false);
      expect(historicalTx.scilla!.receipt!.gas_used).toBe("1843");
      expect(historicalTx.scilla!.receipt!.epoch_num).toBe("10915779");
    });
  });

  describe("EVM Transactions", () => {
    it("should create HistoricalTransaction from EVM legacy tx", async () => {
      const keypair = await KeyPair.generate(BSC_CONFIG.slip44);
      const tokenAddress = Address.fromStr(
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      );
      const recipient = Address.fromStr(
        "0xe33a784044d62147e6fc3a149f3debabf9a890f8",
      );
      const amount = 500886870n;
      const transferData = generateErc20TransferData(
        await recipient.toEthChecksum(),
        amount,
      );
  
      const ethTx: TransactionRequestEVM = {
        to: await tokenAddress.toEthChecksum(),
        value: '0',
        gasLimit: 127062,
        gasPrice: '154087666',
        nonce: 1621949,
        chainId: 1,
        data: transferData,
      };
  
      const metadata: TransactionMetadata = {
        chainHash: BSC_CONFIG.hash(),
        token: {} as any,
      };
  
      const txReq = new TransactionRequest(metadata, undefined, ethTx);
      const signedTx = await txReq.sign(keypair);
  
      const mockHash = "0x1c38e47758ae1c69b8b339211261706fd16e93e1f84fecbd33b3b7cc9d1fefa1";
      const historicalTx = await HistoricalTransaction.fromSignedTransaction(
        signedTx,
        mockHash
      );

      expect(historicalTx.evm).toBeDefined();
      expect(historicalTx.evm!.transactionHash).toBe(mockHash);
      expect(historicalTx.evm!.value).toBe("0");
      expect(historicalTx.evm!.gasLimit).toBe("127062");
      expect(historicalTx.status).toBe(TransactionStatus.Pending);
    });

    it("should create HistoricalTransaction from EVM EIP-1559 tx", async () => {
      const keypair = await KeyPair.generate(BSC_CONFIG.slip44);
      const recipient = Address.fromStr(
        "0xe33a784044d62147e6fc3a149f3debabf9a890f8",
      );
  
      const ethTx: TransactionRequestEVM = {
        to: await recipient.toEthChecksum(),
        value: weieth.decode("1").toString(),
        gasLimit: 21000,
        maxFeePerGas: weigwei.decode("30").toString(),
        maxPriorityFeePerGas: weigwei.decode("2").toString(),
        nonce: 0,
        chainId: 1,
      };
  
      const metadata: TransactionMetadata = {
        chainHash: BSC_CONFIG.hash(),
        token: {} as any,
      };
  
      const txReq = new TransactionRequest(metadata, undefined, ethTx);
      const signedTx = await txReq.sign(keypair);
  
      const mockHash = "0xabcd...";
      const historicalTx = await HistoricalTransaction.fromSignedTransaction(
        signedTx,
        mockHash
      );

      expect(historicalTx.evm!.maxFeePerGas).toBeDefined();
      expect(historicalTx.evm!.maxPriorityFeePerGas).toBeDefined();
      expect(historicalTx.evm!.gasPrice).toBeUndefined();
    });

    it("should update HistoricalTransaction from EVM JSON RPC result", async () => {
      const mockResult = {
        blockHash: "0x70e7d1a5fd2c06e29a99b7ab4cffbee6c66e29decc8a71558223ede933980b42",
        blockNumber: "0x16746d2",
        contractAddress: null,
        cumulativeGasUsed: "0xb73a6a",
        effectiveGasPrice: "0x92fd8f2",
        from: "0x1c727a55ea3c11b0ab7d3a361fe0f3c47ce6de5d",
        gasUsed: "0xf6e9",
        logs: [
          {
            address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
            blockHash: "0x70e7d1a5fd2c06e29a99b7ab4cffbee6c66e29decc8a71558223ede933980b42",
            blockNumber: "0x16746d2",
            blockTimestamp: "0x68e8a7f3",
            data: "0x000000000000000000000000000000000000000000000000000000001dd19d56",
            logIndex: "0x12d",
            removed: false,
            topics: [
              "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
              "0x0000000000000000000000001c727a55ea3c11b0ab7d3a361fe0f3c47ce6de5d",
              "0x000000000000000000000000e33a784044d62147e6fc3a149f3debabf9a890f8"
            ],
            transactionHash: "0x1c38e47758ae1c69b8b339211261706fd16e93e1f84fecbd33b3b7cc9d1fefa1",
            transactionIndex: "0xc0"
          }
        ],
        logsBloom: "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000200000000000000008000000000000000000100000000020000000008000000080000000000000000000000000000000000000000004000002000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        status: "0x1",
        to: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        transactionHash: "0x1c38e47758ae1c69b8b339211261706fd16e93e1f84fecbd33b3b7cc9d1fefa1",
        transactionIndex: "0xc0",
        type: "0x2"
      };

      const metadata: TransactionMetadata = {
        chainHash: BSC_CONFIG.hash(),
        token: {} as any,
      };

      const historicalTx = new HistoricalTransaction({
        status: TransactionStatus.Pending,
        metadata,
        timestamp: Math.floor(Date.now() / 1000),
        evm: {
          transactionHash: "0x1c38e47758ae1c69b8b339211261706fd16e93e1f84fecbd33b3b7cc9d1fefa1",
          from: "",
          to: "",
          type: "0",
          value: "0",
          nonce: "0",
        }
      });

      await historicalTx.updateFromJsonRPCResult(mockResult);

      expect(historicalTx.status).toBe(TransactionStatus.Success);
      expect(historicalTx.evm).toBeDefined();
      expect(historicalTx.evm!.transactionHash).toBe("0x1c38e47758ae1c69b8b339211261706fd16e93e1f84fecbd33b3b7cc9d1fefa1");
      expect(historicalTx.evm!.blockHash).toBe("0x70e7d1a5fd2c06e29a99b7ab4cffbee6c66e29decc8a71558223ede933980b42");
      expect(historicalTx.evm!.blockNumber).toBe("23545554");
      expect(historicalTx.evm!.contractAddress).toBe(null);
      expect(historicalTx.evm!.cumulativeGasUsed).toBe("12008042");
      expect(historicalTx.evm!.effectiveGasPrice).toBe("154130674");
      expect(historicalTx.evm!.from).toBe("0x1c727a55ea3c11b0ab7d3a361fe0f3c47ce6de5d");
      expect(historicalTx.evm!.gasUsed).toBe("63209");
      expect(historicalTx.evm!.status).toBe("0x1");
      expect(historicalTx.evm!.to).toBe("0xdac17f958d2ee523a2206206994597c13d831ec7");
      expect(historicalTx.evm!.transactionIndex).toBe("0xc0");
      expect(historicalTx.evm!.type).toBe("eip1559");
      expect(historicalTx.evm!.logs).toHaveLength(1);
      expect(historicalTx.evm!.logs![0].address).toBe("0xdac17f958d2ee523a2206206994597c13d831ec7");
      expect(historicalTx.evm!.logs![0].blockHash).toBe("0x70e7d1a5fd2c06e29a99b7ab4cffbee6c66e29decc8a71558223ede933980b42");
      expect(historicalTx.evm!.logs![0].blockNumber).toBe("0x16746d2");
      expect(historicalTx.evm!.logs![0].blockTimestamp).toBe("0x68e8a7f3");
      expect(historicalTx.evm!.logs![0].data).toBe("0x000000000000000000000000000000000000000000000000000000001dd19d56");
      expect(historicalTx.evm!.logs![0].logIndex).toBe("0x12d");
      expect(historicalTx.evm!.logs![0].removed).toBe(false);
      expect(historicalTx.evm!.logs![0].topics).toHaveLength(3);
      expect(historicalTx.evm!.logs![0].transactionHash).toBe("0x1c38e47758ae1c69b8b339211261706fd16e93e1f84fecbd33b3b7cc9d1fefa1");
      expect(historicalTx.evm!.logs![0].transactionIndex).toBe("0xc0");
      expect(historicalTx.evm!.logsBloom).toBeDefined();
    });
  });

  describe("Signed messages", () => {
    const metadata: TransactionMetadata = {
      chainHash: BSC_CONFIG.hash(),
      domain: "dapp.example.com",
      title: "Example DApp",
      icon: "https://dapp.example.com/icon.png",
      token: {
        ...BSC_CONFIG.ftokens[0],
        balances: undefined,
      },
    };

    it("fromSignedMessage produces Success entry with signedMessage", () => {
      const signedMessage = {
        kind: "personal_sign" as const,
        address: "0x709678c07cfCAFB4bb49a6b1d57b1db378e27825",
        signature: "0xabc123",
        message: "hello world",
      };

      const historicalTx = HistoricalTransaction.fromSignedMessage(
        metadata,
        signedMessage,
      );

      expect(historicalTx.status).toBe(TransactionStatus.Success);
      expect(historicalTx.signedMessage).toEqual(signedMessage);
      expect(historicalTx.evm).toBeUndefined();
      expect(historicalTx.scilla).toBeUndefined();
      expect(historicalTx.metadata.domain).toBe("dapp.example.com");
      expect(historicalTx.timestamp).toBeGreaterThan(0);
    });

    it("constructor and toJSON round-trip signedMessage", () => {
      const signedMessage = {
        kind: "eip712" as const,
        address: "0x709678c07cfCAFB4bb49a6b1d57b1db378e27825",
        signature: "0xdef456",
        typedDataJson: JSON.stringify({
          types: { Mail: [{ name: "contents", type: "string" }] },
          primaryType: "Mail",
          domain: { name: "Ether Mail", version: "1", chainId: 1 },
          message: { contents: "hi" },
        }),
      };

      const original = HistoricalTransaction.fromSignedMessage(
        metadata,
        signedMessage,
      );
      const json = original.toJSON();
      const restored = new HistoricalTransaction(json);

      expect(restored.signedMessage).toEqual(signedMessage);
      expect(restored.status).toBe(TransactionStatus.Success);
      expect(restored.metadata.domain).toBe(metadata.domain);
      expect(restored.timestamp).toBe(original.timestamp);
      expect(json.signedMessage).toEqual(signedMessage);
    });

    it("createSignedMessageMetadata builds token without balances", () => {
      const meta = HistoricalTransaction.createSignedMessageMetadata(
        BSC_CONFIG.hash(),
        { domain: "a.com", title: "A", icon: "icon.png" },
        BSC_CONFIG.ftokens[0],
      );

      expect(meta.chainHash).toBe(BSC_CONFIG.hash());
      expect(meta.domain).toBe("a.com");
      expect(meta.title).toBe("A");
      expect(meta.icon).toBe("icon.png");
      expect(meta.token.balances).toBeUndefined();
      expect(meta.token.symbol).toBe(BSC_CONFIG.ftokens[0].symbol);
    });
  });
});

