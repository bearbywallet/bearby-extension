<script lang="ts">
    import type { IKeyPair } from 'types/wallet';
    import { _ } from 'popup/i18n';
    import { currentParams } from 'popup/store/route';
    import globalStore from 'popup/store/global';
    import { exportKeyPair, exportbip39Words, unlockWallet } from 'popup/background/wallet';
    import { WalletTypes } from 'config/wallet';

    import SmartInput from '../components/SmartInput.svelte';
    import Button from '../components/Button.svelte';
    import WarningIcon from '../components/icons/Warning.svelte';
    import MnemonicWord from '../components/MnemonicWord.svelte';
    import HexKey from '../components/HexKey.svelte';
    import CopyButton from '../components/CopyButton.svelte';
    import AccountCard from '../components/AccountCard.svelte';

    const REVEAL_STAGE = {
        PASSWORD: 0,
        COUNTDOWN: 1,
        REVEALED: 2
    } as const;

    const mode = $derived(($currentParams.mode as string) || 'phrase');
    const isPhrase = $derived(mode === 'phrase');

    let password = $state('');
    let stage: number = $state(REVEAL_STAGE.PASSWORD);
    const COUNTDOWN_SECONDS = 3600;
    let countdown = $state(COUNTDOWN_SECONDS);
    let error = $state<string | null>(null);
    let isLoading = $state(false);
    let revealedData = $state<string[]>([]);
    let keyPair = $state<IKeyPair | null>(null);
    let intervalId: number | null = null;

    // Per-account reveal state
    let selectedAccountIndex = $state(0);
    let keyPairCache = $state<Record<number, IKeyPair>>({});
    let isKeyLoading = $state(false);

    const wallet = $derived($globalStore.wallets[$globalStore.selectedWallet]);
    const currentAccount = $derived(wallet?.accounts[wallet.selectedAccount]);
    const warningText = $derived(
        isPhrase
            ? $_('reveal.phraseWarning')
            : $_('reveal.keyWarning')
    );

    async function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (!password.trim() || isLoading) return;

        isLoading = true;
        error = null;

        try {
            if (isPhrase) {
                // Seed phrase only exists for mnemonic wallets — not SecretKey imports.
                if (wallet.walletType !== WalletTypes.SecretPhrase) {
                    throw new Error('Invalid wallet type for phrase reveal');
                }
                const mnemonic = await exportbip39Words(password, $globalStore.selectedWallet);
                revealedData = mnemonic.split(" ");
            } else {
                // Validate password only — key material is fetched after the countdown.
                // Works for both SecretPhrase (derived) and SecretKey (stored) wallets.
                await unlockWallet(password, $globalStore.selectedWallet);
            }

            stage = REVEAL_STAGE.COUNTDOWN;
            startCountdown();
        } catch (err) {
            error = $_('reveal.invalidPassword');
        } finally {
            isLoading = false;
        }
    }

    function startCountdown() {
        intervalId = window.setInterval(() => {
            countdown--;
            if (countdown <= 0) {
                if (intervalId !== null) {
                    clearInterval(intervalId);
                }
                stage = REVEAL_STAGE.REVEALED;
                if (!isPhrase) {
                    selectAccount(wallet.selectedAccount);
                }
            }
        }, 1000);
    }

    async function selectAccount(index: number) {
        selectedAccountIndex = index;

        const cached = keyPairCache[index];
        if (cached) {
            error = null;
            isKeyLoading = false; // in-flight fetch for another account may have left this true
            keyPair = cached;
            return;
        }

        isKeyLoading = true;
        error = null;
        keyPair = null;

        try {
            const pair = await exportKeyPair(password, $globalStore.selectedWallet, index);
            keyPairCache = { ...keyPairCache, [index]: pair };

            // Only apply if the user hasn't clicked another account meanwhile.
            if (selectedAccountIndex === index) {
                keyPair = pair;
            }
        } catch (err) {
            console.error(err);
            if (selectedAccountIndex === index) {
                error = $_('reveal.keyError');
            }
        } finally {
            if (selectedAccountIndex === index) {
                isKeyLoading = false;
            }
        }
    }

    function formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    $effect(() => {
        return () => {
            if (intervalId !== null) {
                clearInterval(intervalId);
            }
            // Wipe secrets from component state on unmount.
            password = '';
            keyPair = null;
            keyPairCache = {};
            revealedData = [];
        };
    });
</script>

<div class="page-container">
    <main class="content">
        {#if stage === REVEAL_STAGE.PASSWORD}
            <div class="warning-banner">
                <div class="warning-icon">
                    <WarningIcon />
                </div>
                <div class="warning-content">
                    <div class="warning-title">{$_('reveal.scamAlert')}</div>
                    <div class="warning-text">{warningText}</div>
                </div>
            </div>

            <form class="password-form" onsubmit={handleSubmit}>
                <SmartInput
                    bind:value={password}
                    placeholder={$_('reveal.passwordPlaceholder')}
                    hide={true}
                    disabled={isLoading}
                    hasError={!!error}
                    errorMessage={error || ''}
                    autofocus={true}
                />

                <div class="submit-button">
                    <Button
                  type="submit"
                        disabled={!password.trim()}
                        loading={isLoading}
                    >
                        {$_('reveal.submit')}
                    </Button>
                </div>
            </form>
        {:else if stage === REVEAL_STAGE.COUNTDOWN}
            <div class="warning-banner">
                <div class="warning-icon">
                    <WarningIcon />
                </div>
                <div class="warning-content">
                    <div class="warning-title">{$_('reveal.scamAlert')}</div>
                    <div class="warning-text">{warningText}</div>
                </div>
            </div>

            <div class="countdown-container">
                <div class="countdown-circle">
                    <svg class="countdown-svg" viewBox="0 0 200 200">
                        <circle
                            class="countdown-bg"
                            cx="100"
                            cy="100"
                            r="90"
                        />
                        <circle
                            class="countdown-progress"
                            cx="100"
                            cy="100"
                            r="90"
                            style="stroke-dashoffset: {565 * (countdown / COUNTDOWN_SECONDS)}"
                        />
                    </svg>
                    <div class="countdown-time">{formatTime(countdown)}</div>
                </div>

                <div class="countdown-text">
                    <h3>{$_('reveal.securityCheck')}</h3>
                    <p>{$_('reveal.waitMessage', { values: { time: formatTime(countdown), type: isPhrase ? $_('reveal.phrase') : $_('reveal.key') } })}</p>
                </div>
            </div>
        {:else if stage === REVEAL_STAGE.REVEALED}
            {#if isPhrase}
                {#if currentAccount}
                    <AccountCard
                        name={currentAccount.name}
                        address={currentAccount.addr}
                        selected={false}
                        onclick={() => {}}
                    />
                {/if}

                <div class="phrase-section">
                    <div class="phrase-header">
                        <span class="phrase-label">{$_('reveal.secretPhrase')}</span>
                        <CopyButton label={$_('reveal.copy')} value={revealedData.join(' ')} />
                    </div>
                    <div class="phrase-container">
                        <div class="phrase-grid">
                            {#each revealedData as word, i (i)}
                                <MnemonicWord index={i + 1} {word} />
                            {/each}
                        </div>
                    </div>
                </div>
            {:else}
                <div class="accounts-section">
                    <span class="accounts-label">{$_('reveal.accounts')}</span>
                    <div class="accounts-list">
                        {#each wallet.accounts as account, i (account.addr)}
                            <AccountCard
                                name={account.name}
                                address={account.addr}
                                selected={i === selectedAccountIndex}
                                onclick={() => selectAccount(i)}
                            />
                        {/each}
                    </div>
                </div>

                {#if error}
                    <div class="key-error">{error}</div>
                {:else if isKeyLoading}
                    <div class="key-loading">{$_('reveal.loadingKey')}</div>
                {:else if keyPair}
                    <div class="key-container">
                        <div class="key-section">
                            <div class="key-header">
                                <span class="key-label">{$_('reveal.privateKey')}</span>
                                <CopyButton label={$_('reveal.copy')} value={keyPair.privateKey} />
                            </div>
                            <HexKey hexKey={keyPair.privateKey} title="" />
                        </div>

                        <div class="key-section">
                            <div class="key-header">
                                <span class="key-label">{$_('reveal.publicKey')}</span>
                                <CopyButton label={$_('reveal.copy')} value={keyPair.publicKey} />
                            </div>
                            <div class="public-key-value">{keyPair.publicKey}</div>
                        </div>
                    </div>
                {/if}
            {/if}
        {/if}
    </main>
</div>

<style lang="scss">
    .page-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: var(--color-neutral-background-base);
        padding: 0;
        box-sizing: border-box;
    }

    .content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 24px;
        padding: 24px var(--padding-side);
        overflow-y: auto;
    }

    .warning-banner {
        display: flex;
        gap: 12px;
        padding: 16px;
        background: color-mix(in srgb, var(--color-content-text-pink) 5%, var(--color-neutral-background-base));
        border: 2px solid var(--color-content-text-pink);
        border-radius: 16px;
        animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.01); }
    }

    .warning-icon {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-content-text-pink);

        :global(svg) {
            width: 32px;
            height: 32px;
        }
    }

    .warning-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .warning-title {
        color: var(--color-content-text-pink);
        font-size: 16px;
        font-weight: 700;
        line-height: 22px;
    }

    .warning-text {
        color: var(--color-content-text-inverted);
        font-size: 14px;
        line-height: 20px;
    }

    .password-form {
        display: flex;
        flex-direction: column;
        gap: 24px;
        margin-top: auto;
    }

    .submit-button {
        margin-top: auto;
    }

    .countdown-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 32px;
        margin: auto 0;
    }

    .countdown-circle {
        position: relative;
        width: 200px;
        height: 200px;
    }

    .countdown-svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
    }

    .countdown-bg {
        fill: none;
        stroke: var(--color-neutral-background-container);
        stroke-width: 8;
    }

    .countdown-progress {
        fill: none;
        stroke: var(--color-content-text-pink);
        stroke-width: 8;
        stroke-linecap: round;
        stroke-dasharray: 565;
        transition: stroke-dashoffset 1s linear;
    }

    .countdown-time {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 48px;
        font-weight: 700;
        color: var(--color-content-text-inverted);
    }

    .countdown-text {
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 8px;

        h3 {
            font-size: 24px;
            font-weight: 700;
            color: var(--color-content-text-inverted);
            margin: 0;
        }

        p {
            font-size: 14px;
            color: var(--color-content-text-secondary);
            margin: 0;
            max-width: 280px;
        }
    }

    .phrase-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .phrase-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 0 4px;
    }

    .phrase-label {
        color: var(--color-content-text-inverted);
        font-size: 14px;
        font-weight: 600;
        line-height: 20px;
    }

    .phrase-container {
        background: var(--color-cards-regular-base-default);
        border: 1px solid var(--color-cards-regular-border-default);
        border-radius: 16px;
        padding: 0 16px;
    }

    .phrase-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0 24px;

        @media (min-width: 420px) {
            grid-template-columns: 1fr 1fr;
        }
    }

    .key-container {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .key-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: var(--color-cards-regular-base-default);
        border: 1px solid var(--color-cards-regular-border-default);
        border-radius: 16px;
        padding: 16px;
    }

    .key-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
    }

    .key-label {
        color: var(--color-content-text-inverted);
        font-size: 14px;
        font-weight: 600;
        line-height: 20px;
    }

    .public-key-value {
        color: var(--color-content-text-inverted);
        font-size: 12px;
        font-family: 'Courier New', monospace;
        line-height: 18px;
        word-break: break-all;
        padding: 12px;
        background: var(--color-neutral-background-container);
        border-radius: 8px;
    }

    .accounts-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .accounts-label {
        color: var(--color-content-text-inverted);
        font-size: 14px;
        font-weight: 600;
        line-height: 20px;
        padding: 0 4px;
    }

    .accounts-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 240px;
        overflow-y: auto;
    }

    .key-loading,
    .key-error {
        text-align: center;
        font-size: 14px;
        padding: 24px 0;
        color: var(--color-content-text-secondary);
    }

    .key-error {
        color: var(--color-content-text-pink);
    }
</style>
