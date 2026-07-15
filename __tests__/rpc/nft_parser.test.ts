import { describe, it, expect } from "vitest";
import {
  ERC721Helper,
  buildNFTRequests,
  processEthNFTMetadataResponse,
  processZilNFTMetadataResponse,
  processEthNFTBalanceResponse,
  processZilNFTBalanceResponse,
  processZilBaseUriResponse,
  NFTMetadataField,
  type ZRC6Init,
} from "../../background/rpc/nft_parser";
import { Address } from "../../crypto/address";
import { KeyPair } from "../../crypto/keypair";
import { EvmMethods, ZilMethods } from "../../config/jsonrpc";
import { ETHEREUM, ZILLIQA } from "../../config/slip44";
import { hexToUint8Array } from "../../lib/utils/hex";
import type { JsonRPCResponse } from "../../background/rpc/provider";
import { queryAccountFromPubKey } from "../data";
import { NFTStandard } from "config/token";

const pubKeyBytes = hexToUint8Array("03b0194095e799a6a5f2e81a79fde0a927906c130520f050db263f0d9acbece1ba");
const createEthAddress = () => Address.fromPubKey(pubKeyBytes, ETHEREUM);
const createZilAddress = () => Address.fromPubKey(pubKeyBytes, ZILLIQA);

describe("nft_parser", () => {
  describe("ERC721Helper", () => {
    const helper = new ERC721Helper();
    const ownerAddress = "0x1234567890123456789012345678901234567890";

    it('should correctly encode "name" function call', () => {
      const encoded = helper.encodeFunctionCall("name", []);
      expect(encoded).toBe("0x06fdde03");
    });

    it('should correctly encode "balanceOf" function call', () => {
      const encoded = helper.encodeFunctionCall("balanceOf", [ownerAddress]);
      expect(encoded).toContain("0x70a08231");
    });

    it('should correctly encode "symbol" function call', () => {
      const encoded = helper.encodeFunctionCall("symbol", []);
      expect(encoded).toBe("0x95d89b41");
    });

    it('should correctly encode "totalSupply" function call', () => {
      const encoded = helper.encodeFunctionCall("totalSupply", []);
      expect(encoded).toBe("0x18160ddd");
    });

    it('should correctly encode "ownerOf" function call', () => {
      const encoded = helper.encodeFunctionCall("ownerOf", [1n]);
      expect(encoded).toContain("0x6352211e");
    });

    it('should correctly encode "tokenURI" function call', () => {
      const encoded = helper.encodeFunctionCall("tokenURI", [1n]);
      expect(encoded).toContain("0xc87b56dd");
    });
  });

  describe("buildNFTRequests", () => {
    it("should build requests for an ERC721 NFT", async () => {
      const contract = await createEthAddress();
      const accounts = [await queryAccountFromPubKey(pubKeyBytes)];

      const requests = await buildNFTRequests(contract, accounts);

      expect(requests.length).toBe(4);
      expect(requests[0].payload.method).toBe(EvmMethods.Call);
      expect(requests[0].requestType.type).toBe("Metadata");
      expect(requests[0].requestType.standard).toBe(NFTStandard.ERC721);
      expect(requests[1].requestType.type).toBe("Metadata");
      expect(requests[2].requestType.type).toBe("Metadata");
      expect(requests[3].requestType.type).toBe("Balance");
    });

    it("should build requests for a ZRC6 NFT", async () => {
      const contract = await createZilAddress();
      const accounts = [await queryAccountFromPubKey(pubKeyBytes)];

      const requests = await buildNFTRequests(contract, accounts);

      expect(requests.length).toBe(4);
      expect(requests[0].payload.method).toBe(ZilMethods.GetSmartContractInit);
      expect(requests[1].payload.method).toBe(ZilMethods.GetSmartContractSubState);
      expect(requests[2].payload.method).toBe(ZilMethods.GetSmartContractSubState);
      expect(requests[3].payload.method).toBe(ZilMethods.GetSmartContractSubState);
    });

    it("should build balance requests for multiple accounts", async () => {
      const contract = await createEthAddress();
      const pubKey1 = hexToUint8Array("03b0194095e799a6a5f2e81a79fde0a927906c130520f050db263f0d9acbece1ba");
      const pubKey2 = hexToUint8Array("02b0194095e799a6a5f2e81a79fde0a927906c130520f050db263f0d9acbece1bb");
      const accounts = [
        await queryAccountFromPubKey(pubKey1),
        await queryAccountFromPubKey(pubKey2),
      ];

      const requests = await buildNFTRequests(contract, accounts);

      expect(requests.length).toBe(5);
      const balanceRequests = requests.filter(r => r.requestType.type === "Balance");
      expect(balanceRequests.length).toBe(2);
    });
  });

  describe("processEthNFTMetadataResponse", () => {
    it("should process name", () => {
      const mockResponse: JsonRPCResponse<string> = {
        id: 1,
        jsonrpc: "2.0",
        result: "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000b43525950544f50554e4b53000000000000000000000000000000000000000000",
      };
      const name = processEthNFTMetadataResponse(
        mockResponse,
        NFTMetadataField.Name,
      );
      expect(name).toBe("CRYPTOPUNKS");
    });

    it("should process symbol", () => {
      const mockResponse: JsonRPCResponse<string> = {
        id: 1,
        jsonrpc: "2.0",
        result: "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000358595a0000000000000000000000000000000000000000000000000000000000",
      };
      const symbol = processEthNFTMetadataResponse(
        mockResponse,
        NFTMetadataField.Symbol,
      );
      expect(symbol).toBe("XYZ");
    });

    it("should handle empty response", () => {
      const mockResponse: JsonRPCResponse<string> = {
        id: 1,
        jsonrpc: "2.0",
        result: "0x",
      };
      const name = processEthNFTMetadataResponse(
        mockResponse,
        NFTMetadataField.Name,
      );
      expect(name).toBe("");
    });

    it("should handle missing result", () => {
      const mockResponse: JsonRPCResponse<string> = {
        id: 1,
        jsonrpc: "2.0",
        result: "",
      };
      const name = processEthNFTMetadataResponse(
        mockResponse,
        NFTMetadataField.Name,
      );
      expect(name).toBe("");
    });
  });

  describe("processZilNFTMetadataResponse", () => {
    it("should process ZRC6 metadata", () => {
      const mockInitData: ZRC6Init[] = [
        { vname: "name", type: "String", value: "Test NFT" },
        { vname: "symbol", type: "String", value: "TNFT" },
        { vname: "initial_contract_owner", type: "ByStr20", value: "0x1234567890123456789012345678901234567890" },
      ];
      const mockResponse: JsonRPCResponse<ZRC6Init[]> = {
        id: 1,
        jsonrpc: "2.0",
        result: mockInitData,
      };

      const { name, symbol } = processZilNFTMetadataResponse(mockResponse);

      expect(name).toBe("Test NFT");
      expect(symbol).toBe("TNFT");
    });

    it("should handle missing fields", () => {
      const mockInitData: ZRC6Init[] = [
        { vname: "initial_contract_owner", type: "ByStr20", value: "0x1234567890123456789012345678901234567890" },
      ];
      const mockResponse: JsonRPCResponse<ZRC6Init[]> = {
        id: 1,
        jsonrpc: "2.0",
        result: mockInitData,
      };

      const { name, symbol } = processZilNFTMetadataResponse(mockResponse);

      expect(name).toBe("");
      expect(symbol).toBe("");
    });
  });

  describe("processZilBaseUriResponse", () => {
    it("should process base_uri", () => {
      const mockResponse: JsonRPCResponse<{ base_uri?: string }> = {
        id: 1,
        jsonrpc: "2.0",
        result: {
          base_uri: "https://test.com/"
        },
      };

      const baseUri = processZilBaseUriResponse(mockResponse);
      expect(baseUri).toBe("https://test.com/");
    });

    it("should return undefined if base_uri not present", () => {
      const mockResponse: JsonRPCResponse<{ base_uri?: string }> = {
        id: 1,
        jsonrpc: "2.0",
        result: {},
      };

      const baseUri = processZilBaseUriResponse(mockResponse);
      expect(baseUri).toBeUndefined();
    });

    it("should handle base_uri with trailing slash", () => {
      const mockResponse: JsonRPCResponse<{ base_uri?: string }> = {
        id: 1,
        jsonrpc: "2.0",
        result: {
          base_uri: "ipfs://QmTest/"
        },
      };

      const baseUri = processZilBaseUriResponse(mockResponse);
      expect(baseUri).toBe("ipfs://QmTest/");
    });
  });

  describe("processEthNFTBalanceResponse", () => {
    it("should process balance", () => {
      const mockResponse: JsonRPCResponse<string> = {
        id: 1,
        jsonrpc: "2.0",
        result: "0x0000000000000000000000000000000000000000000000000000000000000003",
      };
      const balance = processEthNFTBalanceResponse(mockResponse);
      expect(balance).toBe(3n);
    });

    it("should return 0 for empty response", () => {
      const mockResponse: JsonRPCResponse<string> = {
        id: 1,
        jsonrpc: "2.0",
        result: "0x",
      };
      const balance = processEthNFTBalanceResponse(mockResponse);
      expect(balance).toBe(0n);
    });

    it("should handle zero balance", () => {
      const mockResponse: JsonRPCResponse<string> = {
        id: 1,
        jsonrpc: "2.0",
        result: "0x0000000000000000000000000000000000000000000000000000000000000000",
      };
      const balance = processEthNFTBalanceResponse(mockResponse);
      expect(balance).toBe(0n);
    });

    it("should handle large balance", () => {
      const mockResponse: JsonRPCResponse<string> = {
        id: 1,
        jsonrpc: "2.0",
        result: "0x00000000000000000000000000000000000000000000000000000000000003e8",
      };
      const balance = processEthNFTBalanceResponse(mockResponse);
      expect(balance).toBe(1000n);
    });
  });

  describe("processZilNFTBalanceResponse", () => {
    it("should process ZRC6 balance with token owners and uris", async () => {
      const keypair = await KeyPair.generate(ZILLIQA);
      const mockAccount = await keypair.address();
      const checksumAddress = (await mockAccount.toZilChecksum()).toLowerCase();

      const tokenOwnersResponse: JsonRPCResponse<{ token_owners?: Record<string, string> }> = {
        id: 1,
        jsonrpc: "2.0",
        result: {
          token_owners: {
            "1": checksumAddress,
            "2": checksumAddress,
            "3": "0x0000000000000000000000000000000000000000",
          }
        },
      };

      const tokenUrisResponse: JsonRPCResponse<{ token_uris?: Record<string, string> }> = {
        id: 2,
        jsonrpc: "2.0",
        result: {
          token_uris: {
            "1": "https://example.com/1.json",
            "2": "https://example.com/2.json",
          }
        },
      };

      const baseUri = "https://base.com/";
      const accounts = [await queryAccountFromPubKey(keypair.pubKey)];

      const result = await processZilNFTBalanceResponse(
        tokenOwnersResponse,
        tokenUrisResponse,
        baseUri,
        accounts
      );

      const userTokens = result.balances[accounts[0].addrHash];

      expect(Object.keys(userTokens).length).toBe(2);
      expect(userTokens["1"].id).toBe("1");
      expect(userTokens["1"].url).toBe("https://example.com/1.json");
      expect(userTokens["2"].id).toBe("2");
      expect(userTokens["2"].url).toBe("https://example.com/2.json");
    });

    it("should use baseUri when token_uri is missing", async () => {
      const keypair = await KeyPair.generate(ZILLIQA);
      const mockAccount = await keypair.address();
      const checksumAddress = (await mockAccount.toZilChecksum()).toLowerCase();

      const tokenOwnersResponse: JsonRPCResponse<{ token_owners?: Record<string, string> }> = {
        id: 1,
        jsonrpc: "2.0",
        result: {
          token_owners: {
            "10": checksumAddress,
          }
        },
      };

      const tokenUrisResponse: JsonRPCResponse<{ token_uris?: Record<string, string> }> = {
        id: 2,
        jsonrpc: "2.0",
        result: {
          token_uris: {}
        },
      };

      const baseUri = "https://base.com/nft/";
      const accounts = [await queryAccountFromPubKey(keypair.pubKey)];

      const result = await processZilNFTBalanceResponse(
        tokenOwnersResponse,
        tokenUrisResponse,
        baseUri,
        accounts
      );

      const userTokens = result.balances[accounts[0].addrHash];

      expect(userTokens["10"].url).toBe("https://base.com/nft/10");
    });

    it("should return empty balances for account with no tokens", async () => {
      const keypair = await KeyPair.generate(ZILLIQA);

      const tokenOwnersResponse: JsonRPCResponse<{ token_owners?: Record<string, string> }> = {
        id: 1,
        jsonrpc: "2.0",
        result: {
          token_owners: {
            "1": "0x0000000000000000000000000000000000000000",
          }
        },
      };

      const tokenUrisResponse: JsonRPCResponse<{ token_uris?: Record<string, string> }> = {
        id: 2,
        jsonrpc: "2.0",
        result: {
          token_uris: {}
        },
      };

      const accounts = [await queryAccountFromPubKey(keypair.pubKey)];

      const result = await processZilNFTBalanceResponse(
        tokenOwnersResponse,
        tokenUrisResponse,
        undefined,
        accounts
      );

      const userTokens = result.balances[accounts[0].addrHash];

      expect(Object.keys(userTokens).length).toBe(0);
    });

    it("should handle multiple accounts correctly", async () => {
      const keypair1 = await KeyPair.generate(ZILLIQA);
      const keypair2 = await KeyPair.generate(ZILLIQA);
      const address1 = (await (await keypair1.address()).toZilChecksum()).toLowerCase();
      const address2 = (await (await keypair2.address()).toZilChecksum()).toLowerCase();

      const tokenOwnersResponse: JsonRPCResponse<{ token_owners?: Record<string, string> }> = {
        id: 1,
        jsonrpc: "2.0",
        result: {
          token_owners: {
            "1": address1,
            "2": address2,
            "3": address1,
          }
        },
      };

      const tokenUrisResponse: JsonRPCResponse<{ token_uris?: Record<string, string> }> = {
        id: 2,
        jsonrpc: "2.0",
        result: {
          token_uris: {
            "1": "https://example.com/1.json",
            "2": "https://example.com/2.json",
            "3": "https://example.com/3.json",
          }
        },
      };

      const accounts = [
        await queryAccountFromPubKey(keypair1.pubKey),
        await queryAccountFromPubKey(keypair2.pubKey),
      ];

      const result = await processZilNFTBalanceResponse(
        tokenOwnersResponse,
        tokenUrisResponse,
        undefined,
        accounts
      );

      const balanceKeys = Object.keys(result.balances);
      expect(balanceKeys.length).toBe(2);

      const tokens1 = result.balances[Number(balanceKeys[0])];
      const tokens2 = result.balances[Number(balanceKeys[1])];

      const totalTokens = Object.keys(tokens1).length + Object.keys(tokens2).length;
      expect(totalTokens).toBe(3);
    });
  });
});
