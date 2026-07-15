<script lang="ts">
    import type { IHistoricalTransactionState } from 'background/rpc/history_tx';
    import { TransactionStatus } from 'config/tx';
    import { formatDate } from 'popup/i18n';
    import { abbreviateNumber } from 'popup/mixins/numbers';
    import { processTokenLogo } from 'lib/popup/url';
    import globalStore from 'popup/store/global';
    import { _ } from 'popup/i18n';
    import { hashChainConfig } from 'lib/utils/hashing';
    import { openTxInExplorer } from 'popup/mixins/links';
    import type { SignedMessageKind } from 'types/tx';
    
    import FastImg from '../components/FastImg.svelte';
    import CopyButton from '../components/CopyButton.svelte';
    import EIP712View from '../components/EIP712View.svelte';
    import SuccessIcon from '../components/icons/Success.svelte';
    import HistoryIcon from '../components/icons/History.svelte';
    import WarningIcon from '../components/icons/Warning.svelte';
    import { truncate } from 'popup/mixins/address';

    const SIGN_KIND_I18N: Readonly<Record<SignedMessageKind, string>> = Object.freeze({
        eth_sign: 'txDetails.signKind.eth_sign',
        personal_sign: 'txDetails.signKind.personal_sign',
        eip712: 'txDetails.signKind.eip712',
        scilla: 'txDetails.signKind.scilla',
    });

    let {
        transaction
    }: {
        transaction: IHistoricalTransactionState;
    } = $props();

    const signedMessage = $derived(transaction.signedMessage);
    const isSignedMessage = $derived(Boolean(signedMessage));

    const chain = $derived(
        $globalStore.chains.find(
            c => hashChainConfig(c.chainIds, c.slip44, c.chain) === transaction.metadata.chainHash
        )
    );

    const iconSrc = $derived(() => {
        if (transaction.metadata.icon) {
            return transaction.metadata.icon;
        }
        return processTokenLogo({
            token: transaction.metadata.token,
            theme: $globalStore.appearances
        });
    });

    const amount = $derived(() => {
        const value = transaction.metadata.token.value ?? 
                     transaction.evm?.value ?? 
                     transaction.scilla?.amount ?? '0';
        return abbreviateNumber(value, transaction.metadata.token.decimals, $globalStore.abbreviatedNumber);
    });

    const formattedDate = $derived(
        formatDate(transaction.timestamp, { 
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
        })
    );

    const statusLabel = $derived(() => {
        switch (transaction.status) {
            case TransactionStatus.Success:
                return $_('txDetails.status.success');
            case TransactionStatus.Pending:
                return $_('txDetails.status.pending');
            case TransactionStatus.Failed:
                return $_('txDetails.status.failed');
            default:
                return $_('txDetails.status.unknown');
        }
    });

    const statusColor = $derived(() => {
        switch (transaction.status) {
            case TransactionStatus.Success:
                return 'success';
            case TransactionStatus.Pending:
                return 'pending';
            case TransactionStatus.Failed:
                return 'error';
            default:
                return 'secondary';
        }
    });

    const recipient = $derived(() => {
        return transaction.metadata.token.recipient ?? 
               transaction.evm?.to ?? 
               transaction.scilla?.toAddr ?? 
               '';
    });

    const txHash = $derived(() => {
        return transaction.evm?.transactionHash ?? transaction.scilla?.hash ?? '';
    });

    const sender = $derived(() => {
        if (signedMessage) {
            return signedMessage.address;
        }
        return transaction.evm?.from ?? transaction.scilla?.senderAddr ?? '';
    });

    const kindLabel = $derived(() => {
        if (!signedMessage) {
            return '';
        }
        return $_(SIGN_KIND_I18N[signedMessage.kind]);
    });

    const gasUsed = $derived(() => {
        if (transaction.evm?.gasUsed) {
            return abbreviateNumber(transaction.evm.gasUsed, 0);
        }
        if (transaction.scilla?.receipt?.gas_used) {
            return abbreviateNumber(transaction.scilla.receipt.gas_used, 0);
        }
        return '-';
    });

    const gasPrice = $derived(() => {
        // For confirmed EVM transactions (both legacy and EIP-1559), use effective gas price
        if (transaction.evm?.effectiveGasPrice) {
            return abbreviateNumber(transaction.evm.effectiveGasPrice, 9);
        }
        // For pending legacy transactions, use gas price
        if (transaction.evm?.gasPrice) {
            return abbreviateNumber(transaction.evm.gasPrice, 9);
        }
        // For pending EIP-1559 transactions, use max fee per gas
        if (transaction.evm?.maxFeePerGas) {
            return abbreviateNumber(transaction.evm.maxFeePerGas, 9);
        }
        if (transaction.scilla?.gasPrice) {
            return abbreviateNumber(transaction.scilla.gasPrice, 12);
        }
        return '-';
    });

    const transactionFee = $derived(() => {
        // For confirmed EVM transactions (both legacy and EIP-1559), use effectiveGasPrice
        if (transaction.evm?.gasUsed && transaction.evm?.effectiveGasPrice) {
            const fee = BigInt(transaction.evm.gasUsed) * BigInt(transaction.evm.effectiveGasPrice);
            return abbreviateNumber(fee.toString(), 18);
        }

        // For pending/confirmed legacy transactions, use gasPrice
        if (transaction.evm?.gasUsed && transaction.evm?.gasPrice) {
            const fee = BigInt(transaction.evm.gasUsed) * BigInt(transaction.evm.gasPrice);
            return abbreviateNumber(fee.toString(), 18);
        }

        // For pending EIP-1559 transactions, estimate using maxFeePerGas
        if (transaction.evm?.gasUsed && transaction.evm?.maxFeePerGas) {
            const fee = BigInt(transaction.evm.gasUsed) * BigInt(transaction.evm.maxFeePerGas);
            return abbreviateNumber(fee.toString(), 18);
        }

        // For Scilla transactions
        if (transaction.scilla?.receipt?.gas_used && transaction.scilla?.gasPrice) {
            const fee = BigInt(transaction.scilla.receipt.gas_used) * BigInt(transaction.scilla.gasPrice);
            return abbreviateNumber(fee.toString(), 12);
        }

        return '-';
    });

    const nativeSymbol = $derived(chain?.ftokens[0]?.symbol ?? '');

    const blockNumber = $derived(() => {
        return transaction.evm?.blockNumber ?? 
               transaction.scilla?.receipt?.epoch_num ?? 
               '-';
    });
</script>

<div class="tx-details-container">
    <div class="tx-header">
        <div class="icon-wrapper">
            <FastImg src={iconSrc()} alt={transaction.metadata.title} />
        </div>
        <div class="header-info">
            <h3 class="tx-title">{transaction.metadata.title}</h3>
            <div class="status-badge" class:success={statusColor() === 'success'} 
                                      class:pending={statusColor() === 'pending'} 
                                      class:error={statusColor() === 'error'}>
                {#if transaction.status === TransactionStatus.Success}
                    <SuccessIcon />
                {:else if transaction.status === TransactionStatus.Failed}
                    <WarningIcon />
                {:else}
                    <HistoryIcon />
                {/if}
                <span>{statusLabel()}</span>
            </div>
        </div>
    </div>

    <div class="amount-section">
        <div class="amount-value">
            {#if isSignedMessage}
                {$_('history.signedMessage')}
            {:else}
                -{amount()} {transaction.metadata.token.symbol}
            {/if}
        </div>
        <div class="amount-date">{formattedDate}</div>
    </div>

    {#if !isSignedMessage && chain && chain.explorers && txHash()}
        <div class="explorers-container">
            {#each chain.explorers as explorer}
                <button
                    class="explorer-button"
                    onclick={() => openTxInExplorer(txHash(), explorer)}
                    title={`{$_('txDetails.viewOn')} ${explorer.name}`}
                >
                    {#if explorer.icon}
                        <FastImg src={explorer.icon} alt={explorer.name} />
                    {/if}
                </button>
            {/each}
        </div>
    {/if}

    <div class="details-section">
        {#if signedMessage}
            <div class="detail-row">
                <span class="detail-label">{$_('txDetails.signer')}</span>
                <CopyButton label={truncate(sender())} value={sender()} />
            </div>

            {#if transaction.metadata.domain}
                <div class="detail-row">
                    <span class="detail-label">{$_('txDetails.dapp')}</span>
                    <span class="detail-value">{transaction.metadata.domain}</span>
                </div>
            {/if}

            <div class="detail-row">
                <span class="detail-label">{$_('txDetails.kind')}</span>
                <span class="detail-value">{kindLabel()}</span>
            </div>

            <div class="detail-divider"></div>

            <div class="message-block">
                <span class="detail-label">
                    {signedMessage.kind === 'eth_sign'
                        ? $_('txDetails.messageHash')
                        : $_('txDetails.message')}
                </span>
                {#if signedMessage.kind === 'eip712' && signedMessage.typedDataJson}
                    <div class="typed-data-wrap">
                        <EIP712View typedDataJson={signedMessage.typedDataJson} />
                    </div>
                {:else}
                    <pre class="message-body">{signedMessage.message ?? ''}</pre>
                {/if}
            </div>

            <div class="detail-divider"></div>

            <div class="detail-row">
                <span class="detail-label">{$_('txDetails.signature')}</span>
                <CopyButton label={truncate(signedMessage.signature)} value={signedMessage.signature} />
            </div>
        {:else}
            <div class="detail-row">
                <span class="detail-label">{$_('txDetails.from')}</span>
                <CopyButton label={truncate(sender())} value={sender()} />
            </div>

            <div class="detail-row">
                <span class="detail-label">{$_('txDetails.to')}</span>
                <CopyButton label={truncate(recipient())} value={recipient()} />
            </div>

            {#if txHash()}
                <div class="detail-row">
                    <span class="detail-label">{$_('txDetails.hash')}</span>
                    <CopyButton label={truncate(txHash())} value={txHash()} />
                </div>
            {/if}

            <div class="detail-divider"></div>

            <div class="detail-row">
                <span class="detail-label">{$_('txDetails.gasUsed')}</span>
                <span class="detail-value">{gasUsed()}</span>
            </div>

            <div class="detail-row">
                <span class="detail-label">{$_('txDetails.gasPrice')}</span>
                <span class="detail-value">{gasPrice()} Gwei</span>
            </div>

            {#if transactionFee() !== '-'}
                <div class="detail-row">
                    <span class="detail-label">{$_('txDetails.transactionFee')}</span>
                    <span class="detail-value">{transactionFee()} {nativeSymbol}</span>
                </div>
            {/if}

            {#if blockNumber() !== '-'}
                <div class="detail-row">
                    <span class="detail-label">{$_('txDetails.block')}</span>
                    <span class="detail-value">{blockNumber()}</span>
                </div>
            {/if}
        {/if}
    </div>
</div>

<style lang="scss">
    .tx-details-container {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 24px;
    }

    .tx-header {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .icon-wrapper {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-neutral-background-container);
        flex-shrink: 0;

        :global(img) {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
    }

    .header-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }

    .tx-title {
        font-size: 18px;
        font-weight: 700;
        line-height: 24px;
        color: var(--color-content-text-inverted);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        line-height: 16px;
        width: fit-content;

        :global(svg) {
            width: 16px;
            height: 16px;
        }

        &.success {
            background: color-mix(in srgb, var(--color-positive-border-primary) 10%, transparent);
            color: var(--color-positive-border-primary);
            border: 1px solid var(--color-positive-border-primary);
        }

        &.pending {
            background: color-mix(in srgb, var(--color-content-text-purple) 10%, transparent);
            color: var(--color-content-text-purple);
            border: 1px solid var(--color-neutral-tag-purple-border);
        }

        &.error {
            background: color-mix(in srgb, var(--color-negative-border-primary) 10%, transparent);
            color: var(--color-negative-border-primary);
            border: 1px solid var(--color-negative-border-primary);
        }
    }

    .amount-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 20px;
        background: var(--color-neutral-background-container);
        border-radius: 16px;
    }

    .amount-value {
        font-size: 32px;
        font-weight: 700;
        line-height: 38px;
        color: var(--color-content-text-inverted);
    }

    .amount-date {
        font-size: 14px;
        line-height: 20px;
        color: var(--color-content-text-secondary);
    }

    .explorers-container {
        display: flex;
        justify-content: center;
        gap: 16px;
    }

    .explorer-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--color-neutral-background-container);
        border: 1px solid var(--color-neutral-border-default);
        cursor: pointer;
        transition: all 0.2s ease;
        padding: 8px;

        &:hover {
            border-color: var(--color-neutral-border-hover);
        }

        :global(img) {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
    }

    .details-section {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        min-height: 24px;
    }

    .detail-label {
        font-size: 14px;
        line-height: 20px;
        color: var(--color-content-text-secondary);
        flex-shrink: 0;
    }

    .detail-value {
        font-size: 14px;
        font-weight: 500;
        line-height: 20px;
        color: var(--color-content-text-inverted);
        text-align: right;
    }

    .detail-divider {
        height: 1px;
        background: var(--color-cards-regular-border-default);
        margin: 4px 0;
    }

    .message-block {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .message-body {
        margin: 0;
        padding: 12px;
        max-height: 200px;
        overflow: auto;
        border-radius: 12px;
        background: var(--color-neutral-background-container);
        color: var(--color-content-text-inverted);
        font-size: 12px;
        line-height: 16px;
        white-space: pre-wrap;
        word-break: break-word;
    }

    .typed-data-wrap {
        max-height: 280px;
        overflow: auto;
    }
</style>
