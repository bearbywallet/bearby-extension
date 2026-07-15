<script lang="ts">
    import type { IAccountState, IFTokenState } from 'background/storage';
    import { _ } from 'popup/i18n';
    import { processTokenLogo } from 'lib/popup/url';
    import { hashAddress } from 'lib/utils/hashing';
    import globalStore from 'popup/store/global';
    import { abbreviateNumber } from 'popup/mixins/numbers';

    import SmartInput from '../components/SmartInput.svelte';
    import SearchIcon from '../components/icons/Search.svelte';
    import FastImg from '../components/FastImg.svelte';
    import { getCurrencySymbol } from 'config/currencies';

    let {
        tokens = [],
        account,
        selectedToken,
        onSelect
    }: {
        tokens: IFTokenState[];
        account: IAccountState;
        selectedToken: IFTokenState | undefined;
        onSelect: (token: IFTokenState) => void;
    } = $props();

    let searchTerm = $state('');

    const balanceKey = $derived(hashAddress(account.addr));

    const filteredTokens = $derived(() => {
        if (!searchTerm) {
            return tokens;
        }
        const lowercasedFilter = searchTerm.toLowerCase();
        return tokens.filter(
            (token) =>
                token.name.toLowerCase().includes(lowercasedFilter) ||
                token.symbol.toLowerCase().includes(lowercasedFilter)
        );
    });

    function getConvertedBalance(token: IFTokenState): string {
        const rate = token.rate ?? 0;
        if (rate <= 0) return '-';

        const rawBalance = token.balances[balanceKey] ?? 0;
        const numericBalance = Number(rawBalance) / (10 ** token.decimals);
        const convertedValue = numericBalance * rate;
        const currencySymbol = getCurrencySymbol($globalStore.wallets[$globalStore.selectedWallet]?.settings?.currencyConvert ?? 'USD');

        return `${currencySymbol}${abbreviateNumber(convertedValue.toString(), 0, $globalStore.abbreviatedNumber)}`;
    }
</script>

<div class="token-selector-content">
    <div class="search-container">
        <SmartInput
            bind:value={searchTerm}
            placeholder={$_('tokenManager.searchPlaceholder')}
            showToggle={false}
            autofocus={true}
        >
            {#snippet leftIcon()}
                <SearchIcon />
            {/snippet}
        </SmartInput>
    </div>

    <div class="token-list">
        {#each filteredTokens() as token (token.addr)}
            <button
                class="token-item"
                class:selected={selectedToken?.addr === token.addr}
                onclick={() => onSelect(token)}
            >
                <div class="token-info">
                    <div class="token-icon">
                        <FastImg
                            src={processTokenLogo({ token, theme: $globalStore.appearances })}
                            alt={token.symbol}
                        />
                    </div>
                    <span class="token-symbol">{token.name}</span>
                </div>
                <div class="token-balances">
                    <span class="balance">
                        {abbreviateNumber(token.balances[balanceKey] ?? 0, token.decimals, $globalStore.abbreviatedNumber)} {token.symbol}
                    </span>
                    <span class="fiat-balance">
                        {getConvertedBalance(token)}
                    </span>
                </div>
            </button>
        {/each}
    </div>
</div>

<style lang="scss">
    .token-selector-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 24px;
        padding-top: 16px;
    }

    .search-container {
        flex-shrink: 0;
    }

    .token-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 45vh;
        overflow-y: auto;
        padding-right: 4px;
        margin-right: -4px;
    }

    .token-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 12px;
        border-radius: 12px;
        background: var(--color-cards-regular-base-default);
        border: 1px solid var(--color-cards-regular-border-default);
        cursor: pointer;
        transition: border-color 0.2s ease;

        &:hover {
            border-color: var(--color-cards-regular-border-hover);
        }

        &.selected {
            border-color: var(--color-controls-selector-select);
        }
    }

    .token-info {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .token-icon {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        overflow: hidden;
    }

    .token-symbol {
        font-size: var(--font-size-large);
        font-weight: 500;
        color: var(--color-content-text-inverted);
    }

    .token-balances {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
    }

    .balance {
        font-size: var(--font-size-large);
        font-weight: 500;
        color: var(--color-content-text-inverted);
    }

    .fiat-balance {
        font-size: var(--font-size-small);
        color: var(--color-content-text-secondary);
    }
</style>
