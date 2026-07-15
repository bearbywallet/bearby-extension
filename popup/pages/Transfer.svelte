<script lang="ts">
    import { onMount } from 'svelte';
    import type { IAccountState, IFTokenState } from 'background/storage';
    import type { BuildTokenTransferParams } from 'types/tx';
    import type { WalletAddressInfo } from 'types/wallet';
    import * as dn from 'dnum';
    
    import NavBar from '../components/NavBar.svelte';
    import SmartInput from '../components/SmartInput.svelte';
    import Button from '../components/Button.svelte';
    import ContactsIcon from '../components/icons/Contacts.svelte';
    import AmountInput from '../components/AmountInput.svelte';
    import Modal from '../components/Modal.svelte';
    import TokenSelector from '../modals/TokenSelectorModal.svelte';
    import AddressSelector from '../modals/AddressSelector.svelte';
    import WarningIcon from '../components/icons/Warning.svelte';
    import CloseIcon from '../components/icons/Close.svelte';

    import { _ } from 'popup/i18n';
    import globalStore from 'popup/store/global';
    import { currentParams } from 'popup/store/route';
    import { hashAddress } from 'lib/utils/hashing';
    import { buildTokenTransfer } from 'popup/background/transactions';
    import { getAllAddressesByChain } from 'popup/background/wallet';
    import { push } from 'popup/router/navigation';

    let showAddressModal = $state(false);
    let recipientAddress = $state('');
    let amount = $state('');
    let selectedToken = $state<IFTokenState | undefined>(undefined);
    let showTokenModal = $state(false);
    let isLoading = $state(false);
    let potentialAddresses = $state<WalletAddressInfo[]>([]);
    let addressesLoading = $state(false);
    let errorMessage = $state<string | null>(null);

    const currentWallet = $derived($globalStore.wallets[$globalStore.selectedWallet]);
    const currentAccount = $derived(currentWallet?.accounts[currentWallet.selectedAccount] as IAccountState | undefined);
    const tokens = $derived<IFTokenState[]>(currentWallet?.tokens ?? []);

    const balanceKey = $derived(currentAccount ? hashAddress(currentAccount.addr) : 0);

    const balance = $derived(() => {
        if (!selectedToken || !currentAccount) return dn.from(0, 18);
        const rawBalance = selectedToken.balances[balanceKey] ?? 0;
        return [BigInt(rawBalance), selectedToken.decimals] as dn.Dnum;
    });

    const inputAmount = $derived(() => {
        if (!amount.trim() || !selectedToken) {
            return dn.from(0, selectedToken?.decimals ?? 18);
        }
        try {
            return dn.from(amount.trim(), selectedToken.decimals);
        } catch {
            return dn.from(0, selectedToken.decimals);
        }
    });

    const isOverBalance = $derived(() => {
        if (!amount.trim() || !selectedToken) return false;
        return dn.greaterThan(inputAmount(), balance());
    });

    const isContinueDisabled = $derived(() => {
        if (!selectedToken || !currentAccount) return true;
        if (!amount.trim() || !recipientAddress.trim()) return true;
        if (isOverBalance()) return true;

        try {
            dn.from(amount.trim(), selectedToken.decimals);
            return false;
        } catch {
            return true;
        }
    });

    onMount(() => {
        if (currentAccount) {
            fetchPotentialAddresses();
        }
    });

    $effect(() => {
        if ($currentParams.addr) {
            recipientAddress = $currentParams.addr as string;
        }
    });

    $effect(() => {
        if (!tokens.length) {
            selectedToken = undefined;
            return;
        }

        if ($currentParams.token) {
            const tokenAddr = ($currentParams.token as string).toLowerCase();
            const foundToken = tokens.find(t => t.addr.toLowerCase() === tokenAddr);
            if (foundToken) {
                selectedToken = foundToken;
                return;
            }
        }

        if (!selectedToken || !tokens.find((token) => token.addr === selectedToken?.addr)) {
            selectedToken = tokens.find((token) => token.native) ?? tokens[0];
        }
    });

    function dismissError() {
        errorMessage = null;
    }

    async function fetchPotentialAddresses() {
        if (addressesLoading || !currentAccount) return;
        
        addressesLoading = true;
        try {
            potentialAddresses = await getAllAddressesByChain($globalStore.selectedWallet, currentWallet.selectedAccount);
        } catch (e) {
            errorMessage = String(e);
            potentialAddresses = [];
        } finally {
            addressesLoading = false;
        }
    }

    function handleTokenSelect(token: IFTokenState) {
        selectedToken = token;
        showTokenModal = false;
    }

    function handleTokenSwitch() {
        if (tokens.length > 1) {
            showTokenModal = true;
        }
    }

    function handleMaxAmount() {
        if (!selectedToken || !currentAccount) return;
        const rawBalance = selectedToken.balances[balanceKey] ?? '0';
        const maxDnum: dn.Dnum = [BigInt(rawBalance), selectedToken.decimals];
        amount = dn.toString(maxDnum);
    }

    function handleContactsClick() {
        if (!addressesLoading && potentialAddresses.length > 0) {
            showAddressModal = true;
        }
    }

    function handleAddressSelect(address: string) {
        recipientAddress = address;
        showAddressModal = false;
    }

    async function handleContinue() {
        if (isContinueDisabled() || isLoading || !selectedToken || !currentAccount) return;

        isLoading = true;
        errorMessage = null;

        try {
            const params: BuildTokenTransferParams = {
                walletIndex: $globalStore.selectedWallet,
                accountIndex: currentWallet.selectedAccount,
                tokenAddr: selectedToken.addr,
                to: recipientAddress,
                amount: inputAmount()[0].toString(),
            };

            await buildTokenTransfer(params);
            push('/confirm');
        } catch (e) {
            console.error(e);
            errorMessage = String(e);
        } finally {
            isLoading = false;
        }
    }
</script>

<Modal
    bind:show={showAddressModal}
    title={$_('addressSelector.title')}
    onClose={() => (showAddressModal = false)}
>
    <AddressSelector
        addresses={potentialAddresses}
        currentAddress={currentAccount?.addr ?? ''}
        onSelect={handleAddressSelect}
    />
</Modal>

<div class="page-container">
    <NavBar title={$_('tokenTransfer.title')} />
    <main class="content">
        {#if errorMessage}
            <div class="error-banner" role="alert">
                <div class="error-left">
                    <div class="error-icon">
                        <WarningIcon />
                    </div>
                    <div class="error-text">{errorMessage}</div>
                </div>
                <button class="error-close" onclick={dismissError} aria-label="Dismiss error">
                    <CloseIcon />
                </button>
            </div>
        {/if}

        {#if selectedToken && currentAccount}
            <AmountInput
                bind:value={amount}
                token={selectedToken}
                account={currentAccount}
                onTokenSelect={tokens.length > 1 ? handleTokenSwitch : undefined}
                onMax={handleMaxAmount}
            />
        {/if}
        
        <div class="recipient-section">
            <span class="section-label">{$_('tokenTransfer.sendTo')}</span>
            <SmartInput
                bind:value={recipientAddress}
                placeholder={$_('tokenTransfer.enterAddress')}
                hide={false}
                showToggle={false}
            >
                {#snippet rightAction()}
                    <button 
                        type="button" 
                        class="contacts-button" 
                        aria-label="Contacts"
                        onclick={handleContactsClick}
                        disabled={addressesLoading}
                    >
                        <ContactsIcon />
                    </button>
                {/snippet}
            </SmartInput>
        </div>
    </main>
    <div class="footer">
        <Button 
            width="100%" 
            height={48} 
            disabled={isContinueDisabled()}
            loading={isLoading}
            onclick={handleContinue}
        >
            {$_('tokenTransfer.continue')}
        </Button>
    </div>
</div>

{#if tokens.length > 1}
    <Modal
        bind:show={showTokenModal}
        title={$_('receive.selectTokenTitle')}
        onClose={() => (showTokenModal = false)}
    >
        {#if currentAccount}
            <TokenSelector
                tokens={tokens}
                account={currentAccount}
                selectedToken={selectedToken}
                onSelect={handleTokenSelect}
            />
        {/if}
    </Modal>
{/if}

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
        padding: 24px var(--padding-side);
        overflow-y: auto;
        min-height: 0;
    }

    .error-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px;
        background: var(--color-error-background);
        border: 1px solid var(--color-negative-border-primary);
        border-radius: 12px;
    }

    .error-left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1;
    }

    .error-icon {
        width: 20px;
        height: 20px;
        flex-shrink: 0;

        :global(svg) {
            width: 20px;
            height: 20px;
            color: var(--color-negative-border-primary);
        }
    }

    .error-text {
        color: var(--color-error-text);
        font-size: 14px;
        line-height: 20px;
        word-break: break-word;
    }

    .error-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background: none;
        border: none;
        border-radius: 6px;
        color: var(--color-error-text);
        cursor: pointer;
        transition: background-color 0.2s ease;

        :global(svg) {
            width: 18px;
            height: 18px;
        }

        &:hover {
            background: color-mix(in srgb, var(--color-negative-border-primary) 20%, transparent);
        }
    }

    .recipient-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .section-label {
        font-size: var(--font-size-small);
        font-weight: 500;
        color: var(--color-content-text-secondary);
    }

    .contacts-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: none;
        color: var(--color-content-icon-secondary);
        cursor: pointer;

        &:active {
            transform: scale(0.95);
        }

        :global(svg) {
            width: 20px;
            height: 20px;
        }
    }

    .footer {
        padding: 24px var(--padding-side) calc(16px + env(safe-area-inset-bottom));
        background: var(--color-neutral-background-base);
    }
</style>
