<script lang="ts">
    import { _ } from 'popup/i18n';
    import { get } from 'svelte/store';
    import globalStore from 'popup/store/global';
    import { setGlobalState } from 'popup/background/wallet';
    import { processTokenLogo } from 'lib/popup/url';
    import { generateCryptoUrl } from '../mixins/qrcode';
    import { getAccountChain } from 'popup/mixins/chains';
    import { truncate } from 'popup/mixins/address';
    import type { IFTokenState } from 'background/storage';

    import NavBar from '../components/NavBar.svelte';
    import SmartInput from '../components/SmartInput.svelte';
    import FastImg from '../components/FastImg.svelte';
    import InfoIcon from '../components/icons/Info.svelte';
    import DownIcon from '../components/icons/Down.svelte';
    import EditIcon from '../components/icons/Edit.svelte';
    import Modal from '../components/Modal.svelte';
    import TokenSelector from '../modals/TokenSelectorModal.svelte';
    import CopyButton from '../components/CopyButton.svelte';
    import QrCode from '../components/QrCode.svelte';

    let accountName = $state('');
    let selectedToken = $state<IFTokenState | undefined>(undefined);
    let showTokenModal = $state(false);

    const currentWallet = $derived($globalStore.wallets[$globalStore.selectedWallet]);
    const currentAccount = $derived(currentWallet?.accounts[currentWallet.selectedAccount]);
    const currentChain = $derived(getAccountChain($globalStore.selectedWallet));

    $effect(() => {
        if (currentWallet && !selectedToken) {
            selectedToken = currentWallet.tokens.find(t => t.native) ?? currentWallet.tokens[0];
        }
    });

    const currentAddress = $derived(currentAccount?.addr ?? '');
    const addresses = $derived(currentAddress.includes(':') ? currentAddress.split(':') : [currentAddress]);
    const isMultiAddress = $derived(addresses.length > 1);
    
    const logo = $derived(selectedToken ? processTokenLogo({
        token: selectedToken,
        theme: $globalStore.appearances,
    }) : '');

    const qrData = $derived(generateCryptoUrl({
        address: addresses[0],
        chain: currentChain?.chain.toLowerCase() ?? '',
        token: selectedToken?.addr,
    }));

    function handleTokenSelect(token: IFTokenState) {
        selectedToken = token;
        showTokenModal = false;
    }

    async function handleAccountNameChange() {
        if (!currentAccount || !currentWallet) return;
        const newName = accountName.trim();
        if (!newName || newName === currentAccount.name) {
            accountName = currentAccount.name;
            return;
        }

        const walletIndex = get(globalStore).selectedWallet;
        globalStore.update(store => {
            const newWallets = [...store.wallets];
            const accountIndex = newWallets[walletIndex].selectedAccount;
            newWallets[walletIndex].accounts[accountIndex].name = newName;
            return { ...store, wallets: newWallets };
        });

        await setGlobalState();
    }

    $effect(() => {
        if (currentAccount) {
            accountName = currentAccount.name;
        }
    });
</script>

<div class="page-container">
    <NavBar title={$_('receive.title')} />

    <div class="content">
        <div class="info-banner">
            <InfoIcon />
            <p>{$_('receive.warning', { values: { chain: currentChain?.name, token: selectedToken?.symbol } })}</p>
        </div>

        <div class="qr-card">
            <button class="token-selector" onclick={() => showTokenModal = true}>
                {#if selectedToken}
                    <div class="token-icon">
                        <FastImg src={logo} alt={selectedToken.symbol} />
                    </div>
                    <span>{selectedToken.name} ({selectedToken.symbol})</span>
                {/if}
                <DownIcon />
            </button>
            <QrCode data={qrData} />
            <div class="addresses-container" class:multi={isMultiAddress}>
                {#each addresses as addr}
                    <CopyButton value={addr} label={truncate(addr, 10, 10)} />
                {/each}
            </div>
        </div>

        <div class="account-name-wrapper">
            <SmartInput bind:value={accountName} hide={false} showToggle={false} onblur={handleAccountNameChange}>
                {#snippet rightAction()}
                    <div class="edit-icon">
                        <EditIcon />
                    </div>
                {/snippet}
            </SmartInput>
        </div>
    </div>
</div>

<Modal bind:show={showTokenModal} title={$_('receive.selectTokenTitle')}>
    {#if currentWallet && currentAccount}
        <TokenSelector
            tokens={currentWallet.tokens}
            account={currentAccount}
            selectedToken={selectedToken}
            onSelect={handleTokenSelect}
        />
    {/if}
</Modal>

<style lang="scss">
    .page-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: var(--color-neutral-background-base);
        box-sizing: border-box;
        padding: 0;
    }

    .content {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 16px var(--padding-side, 20px);
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }

    .info-banner {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 12px;
        background: var(--color-notification-neutral-background, white);
        border-radius: 16px;
        outline: 1px solid var(--color-notification-neutral-border);
        outline-offset: -1px;

        :global(svg) {
            width: 24px;
            height: 24px;
            flex-shrink: 0;
            color: var(--color-notification-neutral-content);
        }
        p {
            margin: 0;
            flex: 1 1 0;
            color: var(--color-content-text-inverted);
            font-size: 12px;
            line-height: 16px;
        }
    }

    .qr-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 16px;
        background: var(--color-neutral-background-container);
        border-radius: 12px;
    }

    .token-selector {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-content-text-inverted);
        font-size: 16px;
        font-weight: 500;
        line-height: 22px;
        padding: 4px 8px;
        border-radius: 8px;
        transition: background-color 0.2s ease;
        &:hover {
            background-color: var(--color-button-regular-quaternary-hover);
        }
    }

    .token-icon {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        overflow: hidden;
    }

    .addresses-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        width: 100%;
        
        &.multi {
            gap: 4px;
        }
    }

    .account-name-wrapper {
        width: 100%;
    }

    .edit-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        :global(svg) { color: var(--color-content-icon-secondary); }
    }
</style>
