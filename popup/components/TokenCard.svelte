<script lang="ts">
    import globalStore from 'popup/store/global';
    import type { IAccountState, IFTokenState } from 'background/storage';
    import FastImg from './FastImg.svelte';
    import { processTokenLogo } from 'lib/popup/url';
    import { abbreviateNumber } from 'popup/mixins/numbers';
    import { hashAddress } from 'lib/utils/hashing';
    import { getCurrencySymbol } from 'config/currencies';

    let {
        token,
        account,
        hide = false,
        loading = false,
        disabled = false,
        tokensRow = true,
        onSelect = () => {}
    }: {
        token: IFTokenState;
        account: IAccountState;
        hide?: boolean;
        loading?: boolean;
        disabled?: boolean;
        tokensRow?: boolean;
        onSelect?: () => void;
    } = $props();

    const balanceKey = $derived(hashAddress(account.addr));

    const balance = $derived(() => {
        if (hide) return '******';
        const rawBalance = token.balances[balanceKey] ?? 0;
        const humanBalance = abbreviateNumber(rawBalance, token.decimals, $globalStore.abbreviatedNumber);
        return `${humanBalance} ${getCurrencySymbol(token.symbol)}`;
    });

    const convertedBalance = $derived(() => {
        if (hide) return '******';

        const rate = token.rate ?? 0;
        if (rate <= 0) return '-';

        const rawBalance = token.balances[balanceKey] ?? 0;
        const numericBalance = Number(rawBalance) / (10 ** token.decimals);
        const convertedValue = numericBalance * rate;
        const wallet = $globalStore.wallets[$globalStore.selectedWallet];
        const currencySymbol = getCurrencySymbol(wallet?.settings?.currencyConvert ?? 'USD');
        
        return `${currencySymbol}${abbreviateNumber(convertedValue.toString(), 0, $globalStore.abbreviatedNumber)}`;
    });
    
    const logo = $derived(processTokenLogo({
        token,
        theme: $globalStore.appearances,
    }));

    function handleClick() {
        if (!disabled && !loading) {
            onSelect();
        }
    }
</script>

<button
    class="token-card"
    class:row={tokensRow}
    class:disabled={disabled}
    class:loading={loading}
    onclick={handleClick}
    type="button"
>
    {#if tokensRow}
        <div class="info-group">
            <div class="token-icon">
                <FastImg src={logo} alt={token.name} />
            </div>
            <span class="token-name">{token.name}</span>
        </div>
        <div class="balance-group">
            <div class="balance">{balance()}</div>
            <div class="converted">{convertedBalance()}</div>
        </div>
    {:else}
        <div class="grid-header">
            <span class="symbol">{token.name}</span>
            <div class="token-icon">
                <FastImg src={logo} alt={token.name} />
            </div>
        </div>
        <div class="balance-group">
            <div class="balance">{balance()}</div>
            <div class="converted">{convertedBalance()}</div>
        </div>
    {/if}
</button>

<style lang="scss">
    .token-card {
        display: flex;
        position: relative;
        overflow: hidden;
        padding: 12px;
        background: var(--color-cards-tokens-base-default);
        border: 2px solid var(--color-cards-regular-border-default);
        border-radius: 12px;
        cursor: pointer;
        text-align: left;
        transition: border-color 0.2s ease, opacity 0.2s ease;
        box-sizing: border-box;
        flex-direction: column;
        justify-content: flex-start;
        align-items: flex-start;
        gap: 16px;
        width: 148px;

        &:hover:not(:disabled):not(.loading) {
            border-color: var(--color-button-regular-primary-default);
        }

        &.disabled {
            cursor: not-allowed;
            opacity: 0.6;
        }

        &.loading {
            cursor: progress;

            &::before {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                width: 200%;
                height: 200%;
                background: conic-gradient(
                    from 180deg at 50% 50%,
                    var(--color-content-text-purple) 0%,
                    transparent 50%,
                    var(--color-content-text-purple) 100%
                );
                transform: translate(-50%, -50%);
                animation: spin 2s linear infinite;
                z-index: 0;
            }

            &::after {
                content: '';
                position: absolute;
                top: 2px;
                left: 2px;
                right: 2px;
                bottom: 2px;
                background: var(--color-cards-tokens-base-default);
                border-radius: 10px;
                z-index: 1;
            }

            > * {
                position: relative;
                z-index: 2;
            }
        }

        &.row {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            width: 100%;

            .token-icon {
                width: 32px;
                height: 32px;
            }

            .info-group {
                flex: 1;
                flex-direction: row;
                align-items: center;
                gap: 8px;
                min-width: 0;
            }

            .token-name {
                font-weight: 400;
            }

            .balance-group {
                flex: 1;
                align-items: flex-end;
                text-align: right;
            }
        }
    }

    .token-icon {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        overflow: hidden;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-neutral-background-container);

        :global(img) {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
    }
    
    .grid-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    }

    .info-group,
    .balance-group {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        width: 100%;
        min-width: 0;
    }

    .symbol,
    .token-name {
        color: var(--color-content-text-inverted);
        font-size: 16px;
        font-family: Geist;
        font-weight: 700;
        line-height: 22px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .balance {
        color: var(--color-content-text-inverted);
        font-size: 16px;
        font-family: Geist;
        font-weight: 700;
        line-height: 22px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .converted {
        color: var(--color-content-text-secondary);
        font-size: 12px;
        font-family: Geist;
        font-weight: 400;
        line-height: 16px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    @keyframes spin {
        0% {
            transform: translate(-50%, -50%) rotate(0deg);
        }
        100% {
            transform: translate(-50%, -50%) rotate(360deg);
        }
    }
</style>
