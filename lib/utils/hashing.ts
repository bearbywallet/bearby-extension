export function hashNumber(hash: number, value: number): number {
  hash = (hash << 5) - hash + value;
  return hash >>> 0; 
}

export function hashString(hash: number, str: string): number {
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash >>> 0; 
  }
  return hash;
}

export function hashChainConfig(chainIds: number[], slip44: number, chain: string): number {
  let hash = 0;
  const chainIdsSum = chainIds[0] + chainIds[1];
  hash = hashNumber(hash, chainIdsSum);
  hash = hashNumber(hash, slip44);
  hash = hashString(hash, chain);
  return hash >>> 0;
}

export function hashXOR(arr: Uint8Array): number {
  let h = 5381;
  for (let byte of arr) {
    h = ((h << 5) + h + byte) >>> 0;
  }
  return h;
}

export function hashXORHex(hex: string): number {
  let h = 5381;
  for (let i = 0; i < hex.length; i += 2) {
    h = ((h << 5) + h + parseInt(hex.slice(i, i + 2), 16)) >>> 0;
  }
  return h;
}

export function hashAddress(addr: string): number {
  return hashString(5381, addr);
}
