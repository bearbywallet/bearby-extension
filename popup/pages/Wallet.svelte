<script lang="ts">
    import { _ } from 'popup/i18n';
    import globalStore from 'popup/store/global';
    import { getWalletChain } from 'popup/mixins/chains';
    import { viewChain } from 'lib/popup/url';
    import { setGlobalState } from 'popup/background/wallet';

    import NavBar from '../components/NavBar.svelte';
    import FastImg from '../components/FastImg.svelte';
    import SmartInput from '../components/SmartInput.svelte';
    import SettingsLinkItem from '../components/SettingsLinkItem.svelte';
    import Button from '../components/Button.svelte';
    import Modal from '../components/Modal.svelte';
    
    import EditIcon from '../components/icons/Edit.svelte';
    import ConnectionIcon from '../components/icons/Connection.svelte';
    import RepeatIcon from '../components/icons/Repeat.svelte';
    import DeleteIcon from '../components/icons/Delete.svelte';
    import DestroyWallet from '../modals/DestroyWallet.svelte';
    import RevealModal from '../modals/RevealModal.svelte';
    import { linksExpand } from 'popup/mixins/links';
    import { push } from 'popup/router/navigation';
    import { WalletTypes } from 'config/wallet';

    let showDeleteModal = $state(false);
    let showBackupModal = $state(false);
    let walletName = $state('');

    const wallet = $derived($globalStore.wallets[$globalStore.selectedWallet]);
    const walletChain = $derived(getWalletChain($globalStore.selectedWallet));
    
    $effect(() => {
        if (wallet) {
            walletName = wallet.walletName;
        }
    });

    async function handleWalletNameChange() {
        if (!wallet) return;

        const newName = walletName.trim();
        if (!newName || newName === wallet.walletName) {
            walletName = wallet.walletName;
            return;
        }

        try {
            let state = $globalStore;
            let wallet = state.wallets[state.selectedWallet]; 

            wallet.walletName = newName;
            globalStore.set(state);

            await setGlobalState();
        } catch (error) {
            console.error('Failed to update wallet name:', error);
            walletName = wallet.walletName;
        }
    }

    function handleBackup() {
        showBackupModal = true;
    }

    function handleManageConnections() {
        push('/connections');
    }

    function handleRevealPhrase() {
        linksExpand('/reveal?mode=phrase');
    }

    function handleExportKeys() {
        linksExpand('/reveal?mode=key');
    }
</script>

<Modal
    bind:show={showDeleteModal}
    title={$_('deleteWallet.title')}
>
    <DestroyWallet onClose={() => showDeleteModal = false} />
</Modal>

{#if wallet}
    <Modal
        bind:show={showBackupModal}
        title={$_('walletSettings.backup')}
    >
        <RevealModal
            walletType={wallet.walletType}
            onRevealPhrase={handleRevealPhrase}
            onExportKeys={handleExportKeys}
        />
    </Modal>
{/if}

<div class="page-container">
    <NavBar title={$_('walletSettings.title')} />

    <main class="content">
        <div class="wallet-icon-container">
            {#if walletChain}
                <FastImg 
                    src={viewChain({ network: walletChain, theme: $globalStore.appearances })}
                    alt={walletChain.name}
                />
            {/if}
        </div>

        <div class="wallet-name-wrapper">
            <SmartInput 
                bind:value={walletName}
                hide={false}
                showToggle={false}
                onblur={handleWalletNameChange}
            >
                {#snippet rightAction()}
                    <div class="edit-icon">
                        <EditIcon />
                    </div>
                {/snippet}
            </SmartInput>
        </div>

        <div class="preferences-section">
            <span class="section-title">{$_('walletSettings.preferences')}</span>
            <div class="settings-group">
                <div class="item-wrapper">
                    <SettingsLinkItem 
                        label={$_('walletSettings.manageConnections')}
                        Icon={ConnectionIcon}
                        value={$globalStore.connections.list.length}
                        onclick={handleManageConnections}
                    />
                </div>
                {#if wallet && (wallet.walletType == WalletTypes.SecretKey || wallet.walletType == WalletTypes.SecretPhrase)}
                    <div class="item-wrapper no-divider">
                        <SettingsLinkItem
                            label={$_('walletSettings.backup')}
                            Icon={RepeatIcon}
                            onclick={handleBackup}
                        />
                    </div>
                {/if}
            </div>
        </div>
    </main>

    <footer class="footer">
        <Button variant="outline" onclick={() => showDeleteModal = true}>
            {$_('walletSettings.destroy')}
            <DeleteIcon />
        </Button>
    </footer>
</div>

<style lang="scss">
    .page-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background-color: var(--color-neutral-background-base);
        padding: 0;
    }

    .content {
        flex: 1;
        overflow-y: auto;
        padding: 24px var(--padding-side, 20px);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
    }

    .wallet-icon-container {
        width: 40px;
        height: 40px;
        overflow: hidden;
        background-color: var(--color-neutral-background-base);
    }

    .wallet-name-wrapper {
        width: 100%;
    }

    .edit-icon {
        display: flex;
        align-items: center;
        justify-content: center;

        :global(svg) {
            width: 24px;
            height: 24px;
            color: var(--color-content-icon-secondary);
        }
    }

    .preferences-section {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .section-title {
        color: var(--color-content-text-secondary);
        font-size: var(--font-size-medium);
        font-family: Geist;
        font-weight: 400;
        line-height: 16px;
        padding: 0 4px;
    }

    .settings-group {
        padding: 4px 12px;
        background: var(--color-neutral-background-container);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
    }

    .item-wrapper {
        border-bottom: 1px solid var(--color-cards-regular-border-default);
    }

    .item-wrapper.no-divider {
        border-bottom: none;
    }

    .footer {
        padding: 24px var(--padding-side, 20px);
        margin-top: auto;
    }
</style>
