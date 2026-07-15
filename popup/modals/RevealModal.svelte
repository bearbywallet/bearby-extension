<script lang="ts">
    import { _ } from 'popup/i18n';
    import { WalletTypes } from 'config/wallet';
    import Button from '../components/Button.svelte';

    let {
        walletType,
        onRevealPhrase = () => {},
        onExportKeys = () => {}
    }: {
        walletType: WalletTypes;
        onRevealPhrase?: () => void;
        onExportKeys?: () => void;
    } = $props();

    const showRevealPhrase = $derived(walletType === WalletTypes.SecretPhrase);
    const showExportKeys = $derived(
        walletType === WalletTypes.SecretPhrase || walletType === WalletTypes.SecretKey
    );
</script>

<div class="backup-modal-content">
    {#if showRevealPhrase}
        <div class="section">
            <div class="section-text">
                <h3 class="section-title">{$_('backup.revealTitle')}</h3>
                <p class="section-description">{$_('backup.revealDescription')}</p>
            </div>
            <Button variant="outline" onclick={onRevealPhrase}>
                {$_('backup.reveal')}
            </Button>
        </div>
    {/if}

    {#if showExportKeys}
        <div class="section">
            <div class="section-text">
                <h3 class="section-title">{$_('backup.privateKeysTitle')}</h3>
                <p class="section-description">{$_('backup.privateKeysWarning')}</p>
            </div>
            <Button variant="outline" onclick={onExportKeys}>
                {$_('backup.export')}
            </Button>
        </div>
    {/if}
</div>

<style lang="scss">
    .backup-modal-content {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 16px;
    }

    .section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .section-text {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .section-title {
        color: var(--color-content-text-inverted);
        font-size: 14px;
        font-weight: 600;
        line-height: 20px;
        margin: 0;
    }

    .section-description {
        color: var(--color-content-icon-secondary);
        font-size: 12px;
        font-weight: 400;
        line-height: 16px;
        margin: 0;
    }
</style>
