<script lang="ts">
    import { _ } from 'popup/i18n';
    import { currentParams } from 'popup/store/route';
    import globalStore from 'popup/store/global';
    import { push } from 'popup/router/navigation';
    import type { SignMesageReqScilla, SignMessageEVM, SignPersonalMessageEVM, SignTypedDataEVM } from 'types/tx';
    import { responseToSignMessageScilla, responseToEthSign, responseToSignPersonalMessageEVM, responseToSignTypedDataEVM } from 'popup/background/sign-message';
    import { ledgerController } from 'ledger/controller';

    import AccountCard from '../components/AccountCard.svelte';
    import Button from '../components/Button.svelte';
    import DAppInfo from '../components/DAppInfo.svelte';
    import CopyButton from '../components/CopyButton.svelte';
    import EIP712View from '../components/EIP712View.svelte';
    import WarningIcon from '../components/icons/Warning.svelte';
    import CloseIcon from '../components/icons/Close.svelte';
    import LedgerSignModal from '../modals/LedgerSignModal.svelte';
    import { WalletTypes } from 'config/wallet';
    import { getAccountChain } from 'popup/mixins/chains';

    const currentWallet = $derived($globalStore.wallets[$globalStore.selectedWallet]);
    const selectedAccount = $derived(currentWallet?.accounts[currentWallet.selectedAccount]);
    const isLedgerWallet = $derived(currentWallet?.walletType === WalletTypes.Ledger);

    const confirmRequests = $derived(currentWallet?.confirm ?? []);
    const signMessageRequest = $derived(
        confirmRequests.find(c =>
            c.signMessageScilla !== undefined ||
            c.signMessageEVM !== undefined ||
            c.signPersonalMessageEVM !== undefined ||
            c.signTypedDataJsonEVM !== undefined
        )
    );
    const signMessageScillaData = $derived(signMessageRequest?.signMessageScilla as SignMesageReqScilla | undefined);
    const signMessageEVMData = $derived(signMessageRequest?.signMessageEVM as SignMessageEVM | undefined);
    const signPersonalMessageEVMData = $derived(signMessageRequest?.signPersonalMessageEVM as SignPersonalMessageEVM | undefined);
    const signTypedDataEVMData = $derived(signMessageRequest?.signTypedDataJsonEVM as SignTypedDataEVM | undefined);

    const isScilla = $derived(!!signMessageScillaData);
    const isEthSign = $derived(!!signMessageEVMData);
    const isPersonalSign = $derived(!!signPersonalMessageEVMData);
    const isTypedData = $derived(!!signTypedDataEVMData);

    const messageData = $derived({
        icon: isScilla ? signMessageScillaData?.icon :
              isEthSign ? signMessageEVMData?.icon :
              isPersonalSign ? signPersonalMessageEVMData?.icon :
              signTypedDataEVMData?.icon,
        title: isScilla ? signMessageScillaData?.title :
               isEthSign ? signMessageEVMData?.title :
               isPersonalSign ? signPersonalMessageEVMData?.title :
               signTypedDataEVMData?.title,
        domain: isScilla ? signMessageScillaData?.domain :
                isEthSign ? signMessageEVMData?.domain :
                isPersonalSign ? signPersonalMessageEVMData?.domain :
                signTypedDataEVMData?.domain,
        content: isScilla ? signMessageScillaData?.content :
                 isEthSign ? signMessageEVMData?.messageHash :
                 isPersonalSign ? signPersonalMessageEVMData?.message :
                 signTypedDataEVMData?.typedData,
    });

    const formattedContent = $derived(() => {
        if (!messageData.content) return '';
        if (isTypedData) {
            try {
                return JSON.stringify(JSON.parse(messageData.content), null, 2);
            } catch {
                return messageData.content;
            }
        }
        return messageData.content;
    });

    let errorMessage = $state('');
    let showLedgerModal = $state(false);

    const currentChain = $derived(getAccountChain($globalStore.selectedWallet));

    function dismissError() {
        errorMessage = '';
    }

    async function handleLedgerSign(accountIndex: number): Promise<string> {
        if (isScilla && signMessageScillaData) {
            return await ledgerController.signMessage(signMessageScillaData.hash, accountIndex);
        } else if (isEthSign && signMessageEVMData) {
            const sig = await ledgerController.signEthMessage(signMessageEVMData.messageHash, accountIndex);
            return sig;
        } else if (isPersonalSign && signPersonalMessageEVMData) {
            const sig = await ledgerController.signPersonalMessage(signPersonalMessageEVMData.message, accountIndex);
            return sig.toHex();
        } else if (isTypedData && signTypedDataEVMData) {
            const sig = await ledgerController.signEIP712Message(signTypedDataEVMData.domainSeparator, signTypedDataEVMData.hashStructMessage, accountIndex);
            return sig.toHex();
        }
        throw new Error('Unknown message type');
    }

    async function handleLedgerSuccess(signature: string) {
        if (!signMessageRequest) return;

        try {
            if (isScilla) {
                await responseToSignMessageScilla(signMessageRequest.uuid, $globalStore.selectedWallet, currentWallet.selectedAccount, true, signature);
            } else if (isEthSign) {
                await responseToEthSign(signMessageRequest.uuid, $globalStore.selectedWallet, currentWallet.selectedAccount, true, signature);
            } else if (isPersonalSign) {
                await responseToSignPersonalMessageEVM(signMessageRequest.uuid, $globalStore.selectedWallet, currentWallet.selectedAccount, true, signature);
            } else if (isTypedData) {
                await responseToSignTypedDataEVM(signMessageRequest.uuid, $globalStore.selectedWallet, currentWallet.selectedAccount, true, signature);
            }
        } catch (e) {
            errorMessage = String(e);
        }
    }

    function handleLedgerError(error: string) {
        errorMessage = error;
    }

    async function handleConfirm() {
        if (isLedgerWallet) {
            showLedgerModal = true;
            return;
        }

        try {
            if (signMessageRequest) {
                if (isScilla) {
                    await responseToSignMessageScilla(signMessageRequest.uuid, $globalStore.selectedWallet, currentWallet.selectedAccount, true);
                } else if (isEthSign) {
                    await responseToEthSign(signMessageRequest.uuid, $globalStore.selectedWallet, currentWallet.selectedAccount, true);
                } else if (isPersonalSign) {
                    await responseToSignPersonalMessageEVM(signMessageRequest.uuid, $globalStore.selectedWallet, currentWallet.selectedAccount, true);
                } else if (isTypedData) {
                    await responseToSignTypedDataEVM(signMessageRequest.uuid, $globalStore.selectedWallet, currentWallet.selectedAccount, true);
                }
            }
        } catch(e) {
            if (String(e).includes("Session")) {
                if ($currentParams?.type === 'popup') {
                    window.close();
                } else {
                    push('/lock');
                }
            } else {
                errorMessage = String(e);
            }
        }
    }

    async function handleCancel() {
        try {
            if (signMessageRequest) {
                if (isScilla) {
                    await responseToSignMessageScilla(signMessageRequest.uuid, $globalStore.selectedWallet, currentWallet.selectedAccount, false);
                } else if (isEthSign) {
                    await responseToEthSign(signMessageRequest.uuid, $globalStore.selectedWallet, currentWallet.selectedAccount, false);
                } else if (isPersonalSign) {
                    await responseToSignPersonalMessageEVM(signMessageRequest.uuid, $globalStore.selectedWallet, currentWallet.selectedAccount, false);
                } else if (isTypedData) {
                    await responseToSignTypedDataEVM(signMessageRequest.uuid, $globalStore.selectedWallet, currentWallet.selectedAccount, false);
                }
            }
        } catch (e) {
            if (String(e).includes("Session")) {
                if ($currentParams?.type === 'popup') {
                    window.close();
                } else {
                    push('/lock');
                }
            } else {
                errorMessage = String(e);
            }
        }
    }

    $effect(() => {
        if (!signMessageRequest) {
            if ($currentParams?.type === 'popup') {
                window.close();
            } else {
                push('/');
            }
        }
    });
</script>

{#if messageData && selectedAccount}
<div class="page-container">
    <main class="content">
        <AccountCard
            name={selectedAccount.name}
            address={selectedAccount.addr}
            selected={false}
        />

        <div class="title-section">
            <h1 class="title">{$_('sign_message.title')}</h1>
            <p class="subtitle">{$_('sign_message.subtitle')}</p>
        </div>

        <DAppInfo
            icon={messageData.icon}
            title={messageData.title ?? ""}
            domain={messageData.domain ?? ""}
        />

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

        {#if isTypedData && messageData.content}
            <EIP712View typedDataJson={messageData.content} />
        {:else}
            <div class="message-card">
                <div class="message-header">
                    <span class="message-title">{$_('sign_message.message')}</span>
                    <CopyButton value={messageData.content ?? ""} />
                </div>
                <div class="message-content">{formattedContent()}</div>
            </div>
        {/if}
    </main>

    <footer class="footer">
        <div class="action-buttons">
            <Button variant="outline" onclick={handleCancel}>
                {$_('common.cancel')}
            </Button>
            <Button variant="primary" onclick={handleConfirm}>
                {$_('common.confirm')}
            </Button>
        </div>
    </footer>
</div>
{/if}

{#if currentChain}
    <LedgerSignModal
        bind:show={showLedgerModal}
        chain={currentChain}
        accountIndex={selectedAccount.index}
        signFunction={handleLedgerSign}
        onSuccess={handleLedgerSuccess}
        onError={handleLedgerError}
    />
{/if}

<style lang="scss">
    .page-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: var(--color-neutral-background-base);
        box-sizing: border-box;
    }

    .content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px var(--padding-side);
        overflow-y: auto;
        min-height: 0;
    }

    .title-section {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 0 4px;
    }

    .title {
        font-size: 20px;
        font-weight: 700;
        line-height: 30px;
        color: var(--color-content-text-inverted);
        margin: 0;
    }

    .subtitle {
        font-size: 14px;
        font-weight: 400;
        line-height: 20px;
        color: var(--color-content-text-secondary);
        margin: 0;
    }

    .error-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px;
        background: var(--color-error-background);
        border: 1px solid var(--color-negative-border-primary);
        border-radius: 12px;
        gap: 12px;
    }

    .error-left {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
        min-width: 0;
    }

    .error-icon {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        color: var(--color-error-text);
    }

    .error-text {
        font-size: 14px;
        line-height: 20px;
        color: var(--color-error-text);
        word-break: break-word;
    }

    .error-close {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        padding: 0;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-error-text);
        opacity: 0.7;
        transition: opacity 0.2s;

        &:hover {
            opacity: 1;
        }
    }

    .message-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        background: var(--color-cards-regular-base-default);
        border: 1px solid var(--color-cards-regular-border-default);
        border-radius: 12px;
    }

    .message-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .message-title {
        font-size: 14px;
        font-weight: 700;
        line-height: 20px;
        color: var(--color-content-text-inverted);
    }

    .message-content {
        font-size: 14px;
        line-height: 20px;
        color: var(--color-content-text-inverted);
        white-space: pre-wrap;
        word-break: break-word;
        background: var(--color-neutral-background-container);
        border-radius: 8px;
        padding: 12px;
        max-height: 240px;
        overflow-y: auto;
        font-family: Geist, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }

    .footer {
        padding: 16px var(--padding-side) calc(16px + env(safe-area-inset-bottom));
        background: var(--color-neutral-background-base);
        border-top: 1px solid var(--color-cards-regular-border-default);
    }

    .action-buttons {
        display: flex;
        gap: 8px;

        :global(button) {
            flex: 1;
            max-height: 48px;
        }
    }
</style>
