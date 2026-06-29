<script lang="ts">
  import type { Bip32Account, WalletFromBip39Params, WalletFromPrivateKeyParams } from 'types/wallet';
  import { type IWalletSettingsState } from 'background/storage';
  import NavBar from '../components/NavBar.svelte';
  import Button from '../components/Button.svelte';
  import SmartInput from '../components/SmartInput.svelte';
  import LittleButton from '../components/LittleButton.svelte';
  import Modal from '../components/Modal.svelte';
  import InfoIcon from '../components/icons/Info.svelte';
  import DownIcon from '../components/icons/Down.svelte';
  import { _ } from '../i18n';
  import { push } from '../router/navigation';
  import { cacheStore } from '../store/cache';
  import globalStore from '../store/global';
  import { ShaAlgorithms } from 'config/pbkdf2';
  import { RatesApiOptions } from 'config/api';
  import CryptModal from '../modals/CryptSetup.svelte';
  import { walletFromBip39Mnemonic, walletFromPrivateKey } from 'popup/background/wallet';
  import { GasSpeed } from 'config/gas';
  import { detectCurrencyFromLocale } from 'config/currencies';
  import { HashTypes } from 'config/argon2';
  import { CipherOrders } from 'config/keychain';

  const MIN_PASSWORD_LEN = 8;

  let password = $state('');
  let confirmPassword = $state('');
  let walletName = $state('');
  let accountName = $state('');
  let isValid = $state(false);
  let showAdvancedModal = $state(false);
  let isLoading = $state(false);
  let creationError = $state<string | null>(null);
  let passwordLengthError = $state('');
  
  let walletSettings = $state<IWalletSettingsState>({
    cipherOrders: [CipherOrders.AESGCM256, CipherOrders.KUZNECHIK, CipherOrders.NTRUP761],
    hashFnParams: {
      memory: 6553,
      threads: 4,
      secret: "",
      iterations: 3,
      hashType: HashTypes.Argon2,
      hashSize: ShaAlgorithms.Sha512,
    },
    currencyConvert: detectCurrencyFromLocale(),
    ensEnabled: true,
    tokensListFetcher: true,
    ratesApiOptions: RatesApiOptions.Bearby,
    sessionTime: 10800,
    gasOption: GasSpeed.Market,
  });

  function generateDefaultWalletName(): string {
    return `${$_('passwordSetup.defaultWalletName')} ${$globalStore.wallets.length}`;
  }

  function updateValidation() {
    if (password.length > 0 && password.length < MIN_PASSWORD_LEN) {
      passwordLengthError = $_('passwordSetup.errors.len');
    } else {
      passwordLengthError = '';
    }

    const isPasswordValid = password.length >= MIN_PASSWORD_LEN && password === confirmPassword;
    isValid = isPasswordValid && walletName.trim().length > 0;
  }

  $effect(() => {
    updateValidation();
  });

  async function handleCreateWallet(e: SubmitEvent) {
    e.preventDefault();
    if (!isValid || isLoading) return;
    
    isLoading = true;
    creationError = null;
    
    try {
      if ($cacheStore.keyPair && $cacheStore.chain) {
        const payload: WalletFromPrivateKeyParams = {
          walletName, accountName, password,
          key: $cacheStore.keyPair,
          chain: $cacheStore.chain,
          settings: walletSettings,
        };
        await walletFromPrivateKey(payload);
      } else if ($cacheStore.verifyPhrase && $cacheStore.chain && $cacheStore.bip39WordList) {
        const accounts: Bip32Account[] = [{ index: 0, name: accountName }];
        const payload: WalletFromBip39Params = {
          walletName, accounts, password,
          bip39WordList: $cacheStore.bip39WordList,
          verifyCheckSum: Boolean($cacheStore.verifyCheckSum),
          mnemonic: $cacheStore.verifyPhrase.join(" "),
          chain: $cacheStore.chain,
          settings: walletSettings,
        };
        await walletFromBip39Mnemonic(payload);
      } else {
        throw new Error('Invalid data for wallet creation.');
      }
      push('/');
    } catch (err) {
      creationError = String(err);
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    if (!$cacheStore.chain || (!$cacheStore.keyPair && !$cacheStore.verifyPhrase)) {
      return push("/start");
    }
    
    if (!walletName) {
      walletName = generateDefaultWalletName();
    }
    if (!accountName) {
      accountName = $_('passwordSetup.defaultAccountName') + ` 1`;
    }
  });
</script>

<div class="page-container password-setup">
  <NavBar title={$_('passwordSetup.title')} disabled={isLoading} />

  <div class="content">
    <div class="intro-section">
      <h2 class="title">{$_('passwordSetup.subtitle')}</h2>
      <p class="description">{$_('passwordSetup.description')}</p>
    </div>

    <form class="form-section" onsubmit={handleCreateWallet}>
      <div class="form-card">
        <SmartInput
          id="wallet-name"
          label={$_('passwordSetup.walletNameLabel')}
          placeholder={$_('passwordSetup.walletNamePlaceholder')}
          bind:value={walletName}
          hide={false}
          showToggle={false}
          disabled={isLoading}
          required
        />
        <SmartInput
          id="password"
          label={$_('passwordSetup.passwordLabel')}
          placeholder={$_('passwordSetup.passwordPlaceholder')}
          bind:value={password}
          disabled={isLoading}
          hide
          required
          hasError={passwordLengthError.length > 0}
          errorMessage={passwordLengthError}
        />
        <SmartInput
          id="confirm-password"
          label={$_('passwordSetup.confirmLabel')}
          placeholder={$_('passwordSetup.confirmPlaceholder')}
          bind:value={confirmPassword}
          disabled={isLoading}
          hide
          required
          hasError={confirmPassword.length > 0 && password !== confirmPassword}
          errorMessage={confirmPassword.length > 0 && password !== confirmPassword ? $_('passwordSetup.errors.mismatch') : ''}
        />
      </div>

      <div class="advanced-section">
        <LittleButton onclick={() => showAdvancedModal = true}>
          {$_('passwordSetup.advanced')}
          {#snippet rightIcon()}
            <DownIcon />
          {/snippet}
        </LittleButton>
      </div>

      {#if creationError}
        <div class="error-notice">
          <InfoIcon />
          <p>{creationError}</p>
        </div>
      {/if}

      <div class="security-note">
        <InfoIcon />
        <p>{$_('passwordSetup.securityNote')}</p>
      </div>
      
      <div class="footer">
        <Button type="submit" disabled={!isValid || isLoading} loading={isLoading}>
          {$_('passwordSetup.createButton')}
        </Button>
      </div>
    </form>
  </div>
</div>

<Modal
  bind:show={showAdvancedModal}
  title={$_('passwordSetup.advancedTitle')}
  onClose={() => showAdvancedModal = false}
  width="600px"
  closeOnOverlay={!isLoading}
>
  <CryptModal
    walletSettings={walletSettings}
    onchange={(settings) => walletSettings = settings}
  />
</Modal>

<style lang="scss">
  .password-setup {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background-color: var(--color-neutral-background-base);
    padding: 0 16px;
    box-sizing: border-box;
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .intro-section {
    text-align: center;
    padding: 24px 0;
  }

  .title {
    font-size: var(--font-size-xl);
    font-weight: bold;
    color: var(--color-content-text-inverted);
    margin-bottom: 8px;
  }

  .description {
    font-size: var(--font-size-medium);
    color: var(--color-content-text-secondary);
    max-width: 320px;
    margin: 0 auto;
    line-height: 1.5;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
  }
  
  .form-card {
    background-color: var(--color-button-regular-quaternary-default);
    border-radius: 16px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .advanced-section {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 0;
  }

  .security-note, .error-notice {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-radius: 12px;
    font-size: var(--font-size-medium);
    line-height: 1.4;

    :global(svg) {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }
    p {
      margin: 0;
    }
  }

  .security-note {
    background-color: var(--color-button-regular-quaternary-default);
    color: var(--color-content-text-secondary);
    :global(svg) {
      color: var(--color-content-icon-secondary);
    }
  }
  
  .error-notice {
    background-color: color-mix(in srgb, var(--color-negative-border-primary) 10%, transparent);
    color: var(--color-negative-border-primary);
    font-weight: 500;
     :global(svg) {
      color: var(--color-negative-border-primary);
    }
  }

  .footer {
    margin-top: auto;
    padding: 24px 0;
  }
</style>
