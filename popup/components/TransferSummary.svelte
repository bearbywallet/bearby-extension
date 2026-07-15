<script lang="ts">
    import EditIcon from './icons/Edit.svelte';

    let {
        amount,
        symbol,
        fiatValue,
        onEdit = undefined,
        editAriaLabel = undefined
    }: {
        amount: string;
        symbol: string;
        fiatValue: string;
        onEdit?: () => void;
        editAriaLabel?: string;
    } = $props();
</script>

<div class="transfer-summary">
    <div class="amount-line">
        <span class="amount">{amount}</span>
        <span class="symbol">{symbol}</span>
        {#if onEdit}
            <button class="edit-amount" onclick={onEdit} aria-label={editAriaLabel ?? ''}>
                <EditIcon />
            </button>
        {/if}
    </div>
    <div class="fiat">{fiatValue}</div>
</div>

<style lang="scss">
    .transfer-summary {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
    }

    .amount-line {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .amount {
        color: var(--color-content-text-inverted);
        font-size: 28px;
        font-weight: 700;
        line-height: 32px;
    }

    .symbol {
        color: var(--color-content-text-secondary);
        font-size: 28px;
        font-weight: 700;
        line-height: 32px;
    }

    .edit-amount {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        border-radius: 8px;
        padding: 4px;
        color: var(--color-content-text-purple);
        cursor: pointer;
        transition: background-color 0.2s ease;

        &:hover {
            background: var(--color-neutral-background-tertiary);
        }

        :global(svg) {
            width: 18px;
            height: 18px;
        }
    }

    .fiat {
        color: var(--color-content-text-secondary);
        font-size: 12px;
        line-height: 16px;
    }
</style>
