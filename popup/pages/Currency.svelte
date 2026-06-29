<script lang="ts">
    import { _ } from 'popup/i18n';
    import globalStore from 'popup/store/global';
    import { setGlobalState } from 'popup/background/wallet';
    import { RatesApiOptions } from 'config/api';
    import { CURRENCIES } from 'config/currencies';

    import NavBar from '../components/NavBar.svelte';
    import SmartInput from '../components/SmartInput.svelte';
    import ActionCard from '../components/ActionCard.svelte';
    import SelectableListItem from '../components/SelectableListItem.svelte';
    import Modal from '../components/Modal.svelte';
    import CurrencyEngineSelector from '../modals/CurrencyEngineSelector.svelte';
    import SearchIcon from '../components/icons/Search.svelte';
    import CurrencyIcon from '../components/icons/Currency.svelte';

    let searchTerm = $state('');
    let showEngineModal = $state(false);

    const currentWallet = $derived($globalStore.wallets[$globalStore.selectedWallet]);
    const selectedCurrency = $derived(currentWallet?.settings?.currencyConvert ?? 'BTC');
    const selectedEngine = $derived(currentWallet?.settings?.ratesApiOptions ?? RatesApiOptions.CoinGecko);

    const engineNames = $derived({
        [RatesApiOptions.Bearby]: 'Bearby',
        [RatesApiOptions.CoinGecko]: 'Coingecko',
        [RatesApiOptions.None]: $_('currency.engine.none')
    });
    const selectedEngineName = $derived(engineNames[selectedEngine]);

    const filteredCurrencies = $derived(() => {
        if (!searchTerm) return CURRENCIES;
        const term = searchTerm.toLowerCase();
        return CURRENCIES.filter(c => 
            c.code.toLowerCase().includes(term) || 
            c.name.toLowerCase().includes(term)
        );
    });

    async function selectCurrency(code: string) {
        const walletIndex = $globalStore.selectedWallet;
        if (walletIndex < 0) return;

        globalStore.update(state => {
            const newWallets = state.wallets.map((wallet, index) => 
                index === walletIndex && wallet.settings
                    ? {
                        ...wallet,
                        tokens: wallet.tokens.map((t) => ({
                        ...t, rate: 0,
                        })),
                        settings: {
                            ...wallet.settings,
                            currencyConvert: code
                        }
                    }
                    : wallet
            );
            return { ...state, wallets: newWallets };
        });
        await setGlobalState();
    }

    async function handleEngineSelect(engine: RatesApiOptions) {
        const walletIndex = $globalStore.selectedWallet;
        if (walletIndex < 0) return;

        globalStore.update(state => {
            const newWallets = state.wallets.map((wallet, index) => 
                index === walletIndex && wallet.settings
                    ? {
                        ...wallet,
                        tokens: wallet.tokens.map((t) => ({
                        ...t, rate: 0,
                        })),
                        settings: {
                            ...wallet.settings,
                            ratesApiOptions: engine
                        }
                    }
                    : wallet
            );
            return { ...state, wallets: newWallets };
        });
        await setGlobalState();
        showEngineModal = false;
    }
</script>

<div class="page-container">
    <NavBar title={$_('settings.currency')} />
    
    <div class="content">
        <ActionCard
            title={$_('currency.engineTitle')}
            subtitle={$_('currency.engineSubtitle')}
            tag={selectedEngineName}
            onaction={() => showEngineModal = true}
        >
            {#snippet left()}
                <CurrencyIcon />
            {/snippet}
        </ActionCard>
        
        <div class="currencies-section">
            <div class="search-container">
                <SmartInput
                    bind:value={searchTerm}
                    placeholder={$_('currency.searchPlaceholder')}
                    showToggle={false}
                >
                    {#snippet leftIcon()}
                        <SearchIcon />
                    {/snippet}
                </SmartInput>
            </div>
            
            <div class="currency-list">
                {#each filteredCurrencies() as currency (currency.code)}
                    <SelectableListItem
                        label={`${currency.name} ${currency.symbol}`}
                        sublabel={currency.code}
                        selected={selectedCurrency === currency.code}
                        onselect={() => selectCurrency(currency.code)}
                    />
                {/each}
            </div>
        </div>
    </div>
</div>

<Modal bind:show={showEngineModal} title={$_('currency.engine.title')}>
    <CurrencyEngineSelector 
        selectedEngine={selectedEngine}
        onselect={handleEngineSelect} 
    />
</Modal>

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
        padding: var(--padding-side) var(--padding-side);
        min-height: 0;
        overflow: hidden;
    }
    
    .currencies-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        background: var(--color-neutral-background-container);
        border-radius: 12px;
        min-height: 0;
        overflow: hidden;
    }
    
    .search-container {
        flex-shrink: 0;
    }
    
    .currency-list {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0;
        overflow-y: auto;
        min-height: 0;
    }
</style>
