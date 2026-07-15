<script lang="ts">
    import { _ } from 'popup/i18n';
    import { from as dnFrom } from 'dnum';
    import type { FTState } from 'types/tx';
    import {
        isUnlimitedApproveAmount,
        maxApproveAmount,
    } from 'lib/utils/erc20';
    import { truncate } from 'popup/mixins/address';
    import Modal from '../components/Modal.svelte';
    import SmartInput from '../components/SmartInput.svelte';
    import Button from '../components/Button.svelte';

    let {
        show = $bindable(false),
        token,
        spender,
        currentAmount,
        slip44,
        onSave = (_amount: bigint) => {}
    }: {
        show?: boolean;
        token: FTState;
        spender: string;
        currentAmount: string; // raw base units
        /** Account slip44 — Zilliqa uses uint128 max unlimited, else uint256 */
        slip44: number;
        onSave?: (amount: bigint) => void;
    } = $props();

    let value = $state('');
    let isUnlimited = $state(false);

    const unlimitedCap = $derived(maxApproveAmount(slip44));

    function rawToHuman(raw: string, decimals: number): string {
        try {
            const v = BigInt(raw || '0');
            const base = 10n ** BigInt(decimals);
            const whole = v / base;
            const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '');
            return frac ? `${whole.toString()}.${frac}` : whole.toString();
        } catch {
            return '0';
        }
    }

    $effect(() => {
        if (show) {
            let unlimited = false;
            try {
                unlimited = isUnlimitedApproveAmount(BigInt(currentAmount || '0'), slip44);
            } catch {
                unlimited = false;
            }
            isUnlimited = unlimited;
            value = unlimited ? '' : rawToHuman(currentAmount || '0', token.decimals);
        }
    });

    const parsedAmount = $derived.by((): bigint | null => {
        if (isUnlimited) return unlimitedCap;
        const trimmed = value.trim();
        if (!trimmed) return null;
        try {
            const [raw] = dnFrom(trimmed, token.decimals);
            return raw >= 0n && raw <= unlimitedCap ? raw : null;
        } catch {
            return null;
        }
    });

    function handleClose() {
        show = false;
    }

    function handleSave() {
        if (parsedAmount === null) return;
        onSave(parsedAmount);
        show = false;
    }

    function toggleUnlimited() {
        isUnlimited = !isUnlimited;
    }
</script>

<Modal bind:show title={$_('spendLimitEditor.title')} onClose={handleClose}>
    <div class="spend-limit-editor">
        <SmartInput
            id="spend-limit"
            label={`${$_('spendLimitEditor.amount')} (${token.symbol})`}
            bind:value
            placeholder={isUnlimited ? $_('spendLimitEditor.unlimited') : '0'}
            disabled={isUnlimited}
            showToggle={false}
            hasError={!isUnlimited && parsedAmount === null && value.trim() !== ''}
            errorMessage={$_('spendLimitEditor.invalid')}
        />

        <Button variant="outline" onclick={toggleUnlimited}>
            {isUnlimited ? $_('spendLimitEditor.custom') : $_('spendLimitEditor.max')}
        </Button>

        <div class="spender-row">
            <span class="label">{$_('spendLimitEditor.spender')}</span>
            <span class="address">{truncate(spender, 10, 6)}</span>
        </div>

        <div class="actions">
            <Button variant="outline" onclick={handleClose}>
                {$_('spendLimitEditor.cancel')}
            </Button>
            <Button onclick={handleSave} disabled={parsedAmount === null}>
                {$_('spendLimitEditor.save')}
            </Button>
        </div>
    </div>
</Modal>

<style lang="scss">
    .spend-limit-editor {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px;
    }

    .spender-row {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .label {
            color: var(--color-content-text-secondary);
            font-size: 14px;
        }

        .address {
            color: var(--color-content-text-inverted);
            font-size: 14px;
        }
    }

    .actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }
</style>
