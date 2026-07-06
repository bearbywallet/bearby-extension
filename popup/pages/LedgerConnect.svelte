<script lang="ts">
    import { fade, fly } from 'svelte/transition';
    import { _ } from 'popup/i18n';
    import { cacheStore } from 'popup/store/cache';
    import { push } from 'popup/router/navigation';
    import { ledgerController, type LedgerDevice } from 'ledger/controller';
    import type { LedgerPublicAddress } from 'types/ledger';

    import NavBar from '../components/NavBar.svelte';
    import Button from '../components/Button.svelte';
    import LedgerIcon from '../components/icons/Ledger.svelte';
    import RefreshIcon from '../components/icons/Refresh.svelte';
    import OptionCard from '../components/OptionCard.svelte';
    import SmartInput from '../components/SmartInput.svelte';
    import Counter from '../components/Counter.svelte';
    import AccountCard from '../components/AccountCard.svelte';
    import { walletFromLedger } from 'popup/background/wallet';
    import { GasSpeed } from 'config/gas';
    import { RatesApiOptions } from 'config/api';
    import { ShaAlgorithms } from 'config/pbkdf2';
    import { HashTypes } from 'config/argon2';
    import type { IWalletSettingsState } from 'background/storage';

    const STEP_DEVICES_FOUND = 0;
    const STEP_CONFIGURING = 1;

    let walletSettings = $state<IWalletSettingsState>({
        cipherOrders: [],
        hashFnParams: {
            memory: 6553,
            threads: 4,
            secret: "",
            iterations: 3,
            hashType: HashTypes.Argon2,
            hashSize: ShaAlgorithms.Sha512,
        },
        currencyConvert: "BTC",
        ensEnabled: true,
        tokensListFetcher: true,
        ratesApiOptions: RatesApiOptions.CoinGecko,
        sessionTime: 0,
        gasOption: GasSpeed.Market,
    });
    let step = $state(STEP_DEVICES_FOUND);
    let usbDevices = $state<LedgerDevice[]>([]);
    let bleDevices = $state<LedgerDevice[]>([]);
    let selectedDevice = $state<LedgerDevice | null>(null);
    let error = $state<string | null>(null);
    let isLoadingUsb = $state(false);
    let isLoadingBle = $state(false);
    let isConnecting = $state(false);
    let bleSupported = $state(false);
    let usbSupported = $state(false);

    let walletName = $state('');
    let accountCount = $state(1);
    let connectedAccounts = $state<LedgerPublicAddress[]>([]);

    const selectedChain = $derived($cacheStore.chain);
    const isConnectDisabled = $derived(!walletName.trim() || isConnecting);
    const hasAccounts = $derived(connectedAccounts.length > 0);
    const allDevices = $derived([...usbDevices, ...bleDevices]);
    const isLoading = $derived(isLoadingUsb || isLoadingBle);

    async function checkSupport() {
        try {
            const support = await ledgerController.checkSupport();
            bleSupported = support.ble;
            usbSupported = support.usb;
        } catch(err) {
            error = String(err);
        }
    }

    async function findUSBDevices() {
        if (!usbSupported) return;
        isLoadingUsb = true;
        error = null;

        try {
            usbDevices = await ledgerController.findUSBDevices();
        } catch (err: unknown) {
            error = String(err);
        } finally {
            isLoadingUsb = false;
        }
    }

    async function findBLEDevices() {
        if (!bleSupported) return;
        isLoadingBle = true;
        error = null;

        try {
            bleDevices = await ledgerController.findBLEDevices();
        } catch (err: unknown) {
            error = String(err);
        } finally {
            isLoadingBle = false;
        }
    }

    async function handleDeviceSelect(device: LedgerDevice) {
        if (!selectedChain) return;
        
        selectedDevice = device;
        walletName = `${device.name} ${selectedChain.name || ''}`;
        error = null;
        isConnecting = true;

        try {
            await ledgerController.connect(device, selectedChain);
            step = STEP_CONFIGURING;
        } catch (err: unknown) {
            error = String(err);
            selectedDevice = null;
        } finally {
            isConnecting = false;
        }
    }

    async function handleConnectAccounts() {
        if (isConnectDisabled || !ledgerController.isConnected) return;
        isConnecting = true;
        error = null;

        try {
            const accounts = await ledgerController.generateAccounts(accountCount, 0);
            
            connectedAccounts = accounts.map((acc, i) => ({
                ...acc,
                name: `${selectedDevice?.name} ${i + 1}`
            }));

        } catch (err: unknown) {
            console.error('[LEDGER-CONNECT:handleConnectAccounts] Error connecting accounts', { count: accountCount, error: err });
            if (err instanceof Error) {
                if (err.message.includes('0x6985')) {
                    error = $_('ledger.errors.user_rejected');
                } else if (err.message.includes('0x6e00') || err.message.includes('0x6d00')) {
                    error = $_('ledger.errors.app_not_open');
                } else if (err.message.includes('0x5515')) {
                    error = $_('ledger.errors.device_locked');
                } else {
                    error = err.message;
                }
            } else {
                error = String(err);
            }
        } finally {
            isConnecting = false;
        }
    }
    
    async function resetToDeviceSelection() {
        try {
            await ledgerController.disconnect();
        } catch (err) {
            console.error('[LEDGER-CONNECT:resetToDeviceSelection] Error disconnecting', err);
        }
        
        selectedDevice = null;
        step = STEP_DEVICES_FOUND;
        error = null;
        accountCount = 1;
        walletName = '';
        connectedAccounts = [];
    }

    async function handleDone() {
        try {
            await ledgerController.disconnect();
            await walletFromLedger({
                walletName,
                accounts: connectedAccounts,
                chain: selectedChain!,
                settings: walletSettings,
            });
            push('/');
        } catch (err) {
            console.error('[LEDGER-CONNECT:handleDone] Error finalizing wallet creation', err);
            error = String(err);
        }
    }

    $effect(() => {
        if (!$cacheStore.chain) {
            console.warn('[LEDGER-CONNECT:init] No chain in cacheStore, redirecting to /start');
            return push("/start");
        }

        checkSupport().then(async () => {
            if (usbSupported) {
                try {
                    const devices = await ledgerController.getPermittedUSBDevices();
                    if (devices.length > 0) {
                        usbDevices = devices;
                    }
                } catch (err) {
                    console.error('[LEDGER-CONNECT:init] Error getting permitted HID devices', err);
                }
            }
        });

        return () => {
            if (ledgerController.isConnected) {
                ledgerController.disconnect().catch((err) => {
                    console.error('[LEDGER-CONNECT:cleanup] Error disconnecting on component destroy', err);
                });
            }
        };
    });

    function hanldeCounterChange(_: number) {
        if (connectedAccounts.length > 0) {
            connectedAccounts = [];
        }
    }
</script>

<div class="page-container">
    {#if step === STEP_CONFIGURING}
        <NavBar title={$_('ledger.configure.title')} onback={resetToDeviceSelection} />
    {:else}
        <NavBar title={$_('ledger.connect.title')} />
    {/if}

    <main class="content" in:fade>
        {#if error}
            <div class="error-banner" transition:fly={{ y: -20, duration: 300 }}>
                {error}
            </div>
        {/if}

        {#if step === STEP_DEVICES_FOUND}
            <div class="step-container" in:fly={{ y: 20 }}>
                {#if allDevices.length === 0 && !isLoading}
                    <div class="centered-content">
                        <div class="icon-wrapper">
                            <LedgerIcon />
                        </div>
                        <h2 class="step-title">{$_('ledger.noDevices.title')}</h2>
                        <p class="step-description">{$_('ledger.noDevices.description')}</p>
                    </div>
                {/if}

                <div class="device-list">
                    {#if usbSupported}
                        <div class="device-category">
                            <div class="category-header">
                                <h3 class="category-title">USB</h3>
                                <button 
                                    class="icon-button" 
                                    onclick={findUSBDevices} 
                                    disabled={isLoadingUsb}
                                >
                                    <RefreshIcon />
                                </button>
                            </div>
                            {#if usbDevices.length > 0}
                                {#each usbDevices as device (device.id)}
                                    <OptionCard
                                        title={device.name}
                                        description={device.raw instanceof Object && 'vendorId' in device.raw ? 
                                            $_('ledger.vendorId') + `: 0x${device.raw.vendorId.toString(16)}` : 
                                            'USB Device'}
                                        icon={LedgerIcon as any}
                                        showArrow={true}
                                        onclick={() => handleDeviceSelect(device)}
                                    />
                                {/each}
                            {:else if !isLoadingUsb}
                                <p class="empty-message">{$_('ledger.noUsbDevices')}</p>
                            {/if}
                        </div>
                    {/if}

                    {#if bleSupported}
                        <div class="device-category">
                            <div class="category-header">
                                <h3 class="category-title">Bluetooth</h3>
                                <button 
                                    class="icon-button" 
                                    onclick={findBLEDevices} 
                                    disabled={isLoadingBle}
                                >
                                    <RefreshIcon />
                                </button>
                            </div>
                            {#if bleDevices.length > 0}
                                {#each bleDevices as device (device.id)}
                                    <OptionCard
                                        title={device.name}
                                        description="Bluetooth"
                                        icon={LedgerIcon as any}
                                        showArrow={true}
                                        onclick={() => handleDeviceSelect(device)}
                                    />
                                {/each}
                            {:else if !isLoadingBle}
                                <p class="empty-message">{$_('ledger.noBleDevices')}</p>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>

        {:else if step === STEP_CONFIGURING && selectedDevice}
            <div class="step-container" in:fly={{ y: 20 }}>
                <div class="form-wrapper">
                    <div class="configuration-box">
                        <SmartInput
                            bind:value={walletName}
                            label={$_('ledger.accountName.label')}
                            placeholder={$_('ledger.accountName.placeholder')}
                            hide={false}
                            showToggle={false}
                        />
                        <div class="counter-row">
                            <span class="counter-label">{$_('ledger.accountCount.label')}</span>
                            <Counter
                                bind:value={accountCount}
                                title=""
                                min={1}
                                max={255}
                                onInput={hanldeCounterChange}
                            />
                        </div>
                    </div>

                    {#if hasAccounts}
                        <div class="accounts-section">
                            <h3 class="accounts-title">{$_('ledger.accounts.title')}</h3>
                            <div class="accounts-list">
                                {#each connectedAccounts as account (account.pubAddr)}
                                    <AccountCard 
                                        name={account.name} 
                                        address={account.pubAddr} 
                                        onclick={() => {}} 
                                    />
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>

                <Button 
                    onclick={hasAccounts ? handleDone : handleConnectAccounts} 
                    loading={isConnecting} 
                    disabled={isConnectDisabled}
                >
                    {hasAccounts ? $_('common.done') : $_('ledger.connect.button')}
                </Button>
            </div>
        {/if}
    </main>
</div>

<style lang="scss">
    .page-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background-color: var(--color-neutral-background-base);
        padding: 0 var(--padding-side);
        box-sizing: border-box;
    }

    .content {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 24px 0;
        min-height: 0;
    }

    .step-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 24px;
        min-height: 0;
    }

    .centered-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 16px;
        margin: auto 0;
    }

    .icon-wrapper {
        :global(svg) {
            width: 64px;
            height: 64px;
            fill: var(--color-content-text-secondary);
        }
    }

    .step-title {
        font-size: var(--font-size-xl);
        font-weight: 600;
        color: var(--color-content-text-inverted);
    }

    .step-description {
        font-size: var(--font-size-large);
        color: var(--color-content-text-secondary);
        max-width: 300px;
    }

    .error-banner {
        padding: 12px;
        background: var(--color-error-background);
        border-radius: 8px;
        color: var(--color-error-text);
        font-size: var(--font-size-medium);
        text-align: center;
        margin-bottom: 16px;
        flex-shrink: 0;
    }
    
    .device-list {
        display: flex;
        flex-direction: column;
        gap: 24px;
        overflow-y: auto;
        flex: 1;
    }

    .device-category {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .category-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .category-title {
        font-size: var(--font-size-medium);
        font-weight: 600;
        color: var(--color-content-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .icon-button {
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        border-radius: 50%;
        color: var(--color-content-icon-secondary);
        transition: background-color 0.2s;
        
        &:hover:not(:disabled) {
            background-color: var(--color-button-regular-quaternary-hover);
        }

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        :global(svg) {
            width: 24px;
            height: 24px;
        }
    }

    .empty-message {
        font-size: var(--font-size-medium);
        color: var(--color-content-text-secondary);
        padding: 12px;
        text-align: center;
    }

    .form-wrapper {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-height: 0;
        overflow: hidden;
    }

    .configuration-box {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 20px;
        background: var(--color-cards-regular-base-default);
        border: 1px solid var(--color-cards-regular-border-default);
        border-radius: 16px;
        flex-shrink: 0;
    }
    
    .counter-row {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .counter-label {
        font-size: var(--font-size-large);
        font-weight: 600;
        color: var(--color-content-text-inverted);
    }

    .accounts-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 0;
        overflow-y: auto;
    }

    .accounts-title {
        font-size: var(--font-size-large);
        font-weight: 600;
        color: var(--color-content-text-inverted);
        margin: 0;
        flex-shrink: 0;
        position: sticky;
        top: 0;
        background: var(--color-neutral-background-base);
        padding-bottom: 4px;
        z-index: 1;
    }

    .accounts-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
</style>
