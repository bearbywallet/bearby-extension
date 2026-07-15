import { describe, it, expect } from 'vitest';
import { generateQRSecretData, parseQRSecretData } from 'popup/mixins/qrcode';

describe('generateQRSecretData (Bearby mobile QR contract)', () => {
  it('encodes a seed phrase with raw spaces, no URL-encoding', () => {
    const qr = generateQRSecretData({ chain: 'ethereum', seedPhrase: 'apple banana cherry' });
    expect(qr).toBe('ethereum:?seed=apple banana cherry');
  });

  it('encodes a private key', () => {
    const qr = generateQRSecretData({ chain: 'ethereum', privateKey: '8f3a01' });
    expect(qr).toBe('ethereum:?key=8f3a01');
  });

  it('round-trips through parseQRSecretData like the mobile parser', () => {
    const qr = generateQRSecretData({ chain: 'zilliqa', seedPhrase: 'a b c' });
    expect(parseQRSecretData(qr)).toEqual({ chain: 'zilliqa', seed: 'a b c' });
  });
});
