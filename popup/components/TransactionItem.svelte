<script lang="ts">
    import { formatDate, _ } from 'popup/i18n';
    import { abbreviateNumber } from 'popup/mixins/numbers';
    import { processTokenLogo } from 'lib/popup/url';
    import globalStore from 'popup/store/global';
    import FastImg from './FastImg.svelte';
    import type { IHistoricalTransactionState } from 'background/rpc/history_tx';
    import { TransactionStatus } from 'config/tx';

    let {
        transaction,
    }: {
        transaction: IHistoricalTransactionState;
    } = $props();

    const isSignedMessage = $derived(Boolean(transaction.signedMessage));

    const amount = $derived(() => {
        const value = transaction.metadata.token.value ?? 
                     transaction.evm?.value ?? 
                     transaction.scilla?.amount ?? '0';
        return abbreviateNumber(value, transaction.metadata.token.decimals, $globalStore.abbreviatedNumber);
    });

    const formattedDate = $derived(
        formatDate(transaction.timestamp, { 
            day: 'numeric',
            month: 'short',
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
        })
    );

    const subtitle = $derived(() => {
        if (transaction.signedMessage) {
            return transaction.metadata.domain ?? '';
        }
        if (transaction.metadata.token.recipient) {
            return transaction.metadata.token.recipient;
        }
        return transaction.evm?.to ?? transaction.scilla?.toAddr ?? '';
    });

    const iconSrc = $derived(() => {
        if (transaction.metadata.icon) {
            return transaction.metadata.icon;
        }
        return processTokenLogo({
            token: transaction.metadata.token,
            theme: $globalStore.appearances
        });
    });
</script>

<div class="transaction-card" class:loading={transaction.status == TransactionStatus.Pending}>
    <div class="icon-wrapper">
        {#if transaction.metadata.icon || transaction.metadata.token}
            <FastImg src={iconSrc()} alt={transaction.metadata.title} />
        {/if}
    </div>

    <div class="info-section">
        <div class="title">{transaction.metadata.title}</div>
        <div class="subtitle">{subtitle()}</div>
    </div>

    <div class="amount-section">
        <div class="amount">
            {#if isSignedMessage}
                {$_('history.signedMessage')}
            {:else}
                -{amount()} {transaction.metadata.token.symbol}
            {/if}
        </div>
        <div class="date">{formattedDate}</div>
    </div>
</div>

<style lang="scss">
    .transaction-card {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        background: var(--color-cards-regular-base-default);
        border-radius: 12px;
        border: 1px solid var(--color-cards-regular-border-default);
        cursor: pointer;
        transition: all 0.2s ease;
        overflow: hidden;

        &:hover:not(.loading) {
            border-color: var(--color-cards-regular-border-hover);
        }

        &.loading {
            border-color: transparent;
            
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
                    var(--color-button-regular-primary-default) 50%,
                    var(--color-content-text-purple) 100%
                );
                transform: translate(-50%, -50%);
                animation: spin 2s linear infinite;
                z-index: 0;
            }

            &::after {
                content: '';
                position: absolute;
                top: 1px;
                left: 1px;
                right: 1px;
                bottom: 1px;
                background: var(--color-cards-regular-base-default);
                border-radius: 11px;
                z-index: 1;
            }

            > * {
                position: relative;
                z-index: 2;
            }
        }
    }

    @keyframes spin {
        0% {
            transform: translate(-50%, -50%) rotate(0deg);
        }
        100% {
            transform: translate(-50%, -50%) rotate(360deg);
        }
    }

    .icon-wrapper {
        padding: 5px;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-button-regular-quaternary-default);
        border-radius: 100%;
        flex-shrink: 0;
        overflow: hidden;

        :global(img) {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        :global(svg) {
            width: 24px;
            height: 24px;
            color: var(--color-content-icon-accent-secondary);
        }
    }

    .info-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .title {
        font-size: 16px;
        font-weight: 600;
        line-height: 22px;
        color: var(--color-content-text-inverted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .subtitle {
        font-size: 14px;
        font-weight: 400;
        line-height: 18px;
        color: var(--color-content-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .amount-section {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 2px;
    }

    .amount {
        font-size: 16px;
        font-weight: 700;
        line-height: 22px;
        color: var(--color-content-text-inverted);
        white-space: nowrap;
    }

    .date {
        font-size: 12px;
        font-weight: 400;
        line-height: 16px;
        color: var(--color-content-text-secondary);
        text-align: right;
        white-space: nowrap;
    }
</style>
