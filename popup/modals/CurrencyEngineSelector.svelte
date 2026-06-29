<script lang="ts">
    import { _ } from 'popup/i18n';
    import { RatesApiOptions } from 'config/api';

    type Engine = {
        id: RatesApiOptions;
        name: string;
        description: string;
    };

    let {
        selectedEngine,
        onselect
    }: {
        selectedEngine: RatesApiOptions;
        onselect: (engine: RatesApiOptions) => void;
    } = $props();

    const engines: Engine[] = [
        {
            id: RatesApiOptions.Bearby,
            name: 'Bearby',
            description: $_('currency.engine.bearbyDescription')
        },
        {
            id: RatesApiOptions.CoinGecko,
            name: 'Coingecko',
            description: $_('currency.engine.coingeckoDescription')
        },
        {
            id: RatesApiOptions.None,
            name: $_('currency.engine.none'),
            description: $_('currency.engine.noneDescription')
        }
    ];
</script>

<div class="engine-selector">
    {#each engines as engine (engine.id)}
        <button 
            class="engine-card" 
            class:selected={selectedEngine === engine.id}
            onclick={() => onselect(engine.id)}
        >
            <div class="selector" class:active={selectedEngine === engine.id}>
                {#if selectedEngine === engine.id}
                    <div class="selector-dot"></div>
                {/if}
            </div>
            <div class="engine-info">
                <span class="engine-name">{engine.name}</span>
                <span class="engine-description">{engine.description}</span>
            </div>
        </button>
    {/each}
</div>

<style lang="scss">
    .engine-selector {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 20px 20px 20px;
    }

    .engine-card {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 16px;
        background: var(--color-cards-regular-base-default);
        border: 1px solid var(--color-cards-regular-border-default);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;

        &:hover {
            background: var(--color-cards-regular-base-hover);
            border-color: var(--color-cards-regular-border-hover);
        }

        &.selected {
            background: var(--color-cards-regular-base-selected);
            border-color: var(--color-neutral-tag-purple-border);
        }

        &:active {
            transform: scale(0.98);
        }
    }

    .selector {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 1px solid var(--color-controls-selector-border);
        background: var(--color-controls-selector-base);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        &.active {
            background: var(--color-controls-selector-select);
            border-color: var(--color-controls-selector-select);
        }
    }

    .selector-dot {
        width: 12px;
        height: 12px;
        background: var(--color-controls-selector-checker);
        border-radius: 50%;
    }

    .engine-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-width: 0;
    }

    .engine-name {
        font-family: Geist;
        font-size: 14px;
        font-weight: 600;
        line-height: 20px;
        color: var(--color-content-text-inverted);
    }

    .engine-description {
        font-family: Geist;
        font-size: 12px;
        font-weight: 400;
        line-height: 16px;
        color: var(--color-content-text-secondary);
    }
</style>
