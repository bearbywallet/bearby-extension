<script lang="ts">
    import type { NFTMetadata, NFTTokenInfo } from 'types/token';
    import { _ } from 'popup/i18n';
    import globalStore from 'popup/store/global';
    import { viewChain } from 'lib/popup/url';
    import { getAccountChain } from 'popup/mixins/chains';
    import { setGlobalState } from 'popup/background/wallet';

    import Header from '../components/Header.svelte';
    import BottomTabs from '../components/BottomTabs.svelte';
    import SmartInput from '../components/SmartInput.svelte';
    import SearchIcon from '../components/icons/Search.svelte';
    import NFTCard from '../components/NFTCard.svelte';
    import Switch from '../components/Switch.svelte';
    import { fetchNFTMeta } from 'popup/background/token';

    let searchTerm = $state('');
    let foundCollection = $state<NFTMetadata | null>(null);
    let searchError = $state<string | null>(null);
    let loading = $state(false);

    const currentChain = $derived(getAccountChain($globalStore.selectedWallet));
    const currentWallet = $derived($globalStore.wallets[$globalStore.selectedWallet]);
    const nftItems: NFTMetadata[] = $derived(currentWallet?.nft ?? []);

    const isCollectionAdded = $derived((contractAddress: string) => {
        return nftItems.some(c => c.contractAddress.toLowerCase() === contractAddress.toLowerCase());
    });

    const groupedNFTs = $derived(() => {
        const lowercasedFilter = searchTerm.trim().toLowerCase();
        
        if (lowercasedFilter && (lowercasedFilter.startsWith('0x') || lowercasedFilter.startsWith('zil1'))) {
            if (foundCollection) {
                const allTokens: NFTTokenInfo[] = [];
                Object.values(foundCollection.balances).forEach(chainBalances => {
                    Object.values(chainBalances).forEach(token => {
                        allTokens.push(token);
                    });
                });
                return [{
                    ...foundCollection,
                    tokens: allTokens,
                    isSearchResult: true
                }];
            }
            return [];
        }

        const filtered = lowercasedFilter
            ? nftItems.filter(collection =>
                collection.name.toLowerCase().includes(lowercasedFilter) ||
                collection.symbol.toLowerCase().includes(lowercasedFilter) ||
                collection.contractAddress.toLowerCase().includes(lowercasedFilter)
            )
            : nftItems;

        return filtered.map(collection => {
            const allTokens: NFTTokenInfo[] = [];
            
            Object.values(collection.balances).forEach(chainBalances => {
                Object.values(chainBalances).forEach(token => {
                    allTokens.push(token);
                });
            });

            return {
                ...collection,
                tokens: allTokens,
                isSearchResult: false
            };
        });
    });

    async function handleCollectionToggle(collection: NFTMetadata, enabled: boolean) {
        const walletIndex = $globalStore.selectedWallet;
        const originalWallet = $globalStore.wallets[walletIndex];

        if (!originalWallet) return;

        let newCollections: NFTMetadata[];

        if (enabled) {
            newCollections = [...originalWallet.nft, collection];
            foundCollection = null;
            searchTerm = '';
        } else {
            newCollections = originalWallet.nft.filter(
                c => c.contractAddress.toLowerCase() !== collection.contractAddress.toLowerCase()
            );
        }

        globalStore.update(state => {
            state.wallets[walletIndex] = {
                ...originalWallet,
                nft: newCollections
            };
            return {
                ...state,
            };
        });

        await setGlobalState();
    }

    function handleNFTClick(token: NFTTokenInfo, collection: NFTMetadata) {
    }

    async function handleRefresh() {
    }

    $effect(() => {
        const term = searchTerm.trim();
        foundCollection = null;
        searchError = null;
        loading = false;

        if (term.startsWith('0x') || term.startsWith('zil1')) {
            const performSearch = async () => {
                loading = true;
                try {
                    foundCollection = await fetchNFTMeta($globalStore.selectedWallet, term);
                } catch (e) {
                    searchError = $_('nft.errorFetching') || 'Error fetching NFT metadata';
                    console.error(e);
                } finally {
                    loading = false;
                }
            };
            const timeoutId = setTimeout(performSearch, 500);
            return () => clearTimeout(timeoutId);
        }
    });
</script>

<div class="page-container">
    <Header
        showNetworkButton={true}
        networkImageSrc={viewChain({
            network: currentChain,
            theme: $globalStore.appearances
        })}
        networkImageAlt={currentChain?.name ?? ''}
        onRefresh={handleRefresh}
    />

    <main class="content">
        <div class="search-section">
            <SmartInput
                bind:value={searchTerm}
                placeholder={$_('nft.searchPlaceholder') || 'Name, symbol or contract address'}
                showToggle={false}
                {loading}
            >
                {#snippet leftIcon()}
                    <SearchIcon />
                {/snippet}
            </SmartInput>
        </div>

        <div class="nft-collections">
            {#if searchError}
                <div class="empty-state error">
                    <p>{searchError}</p>
                </div>
            {:else}
                {#each groupedNFTs() as collection (collection.contractAddress)}
                    <div class="collection-group">
                        <div class="collection-header">
                            <div class="collection-info">
                                <div class="collection-title">
                                    <h3 class="collection-name">{collection.name}</h3>
                                    <span class="collection-symbol">{collection.symbol}</span>
                                    {#if collection.standard}
                                        <span class="collection-symbol">{collection.standard}</span>
                                    {/if}
                                </div>
                            </div>
                            
                            {#if collection.isSearchResult && !isCollectionAdded(collection.contractAddress)}
                                <Switch
                                    checked={false}
                                    variant="default"
                                    ariaLabel="Add collection"
                                    onChange={(enabled) => handleCollectionToggle(collection, enabled)}
                                />
                            {/if}
                        </div>

                        <div class="nft-grid">
                            {#each collection.tokens as token (token.id)}
                                <NFTCard
                                    id={token.id}
                                    collectionName={collection.name}
                                    imageUrl={token.meta?.image || token.url || ''}
                                    onclick={() => handleNFTClick(token, collection)}
                                />
                            {/each}
                        </div>
                    </div>
                {/each}

                {#if groupedNFTs().length === 0 && !loading}
                    <div class="empty-state">
                        <p>{$_('nft.noResults') || 'No NFTs found'}</p>
                    </div>
                {/if}
            {/if}
        </div>
    </main>

    <BottomTabs />
</div>

<style lang="scss">
    .page-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: var(--color-neutral-background-base);
        padding: 0;
    }

    .content {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow-y: auto;
    }

    .search-section {
        flex-shrink: 0;
        padding: 16px var(--padding-side);
    }

    .nft-collections {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 32px;
        padding: 8px var(--padding-side) 24px;
        min-height: 0;
    }

    .collection-group {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .collection-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 0 4px;
    }

    .collection-info {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex: 1;
        min-width: 0;
    }

    .collection-title {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .collection-name {
        color: var(--color-content-text-inverted);
        font-size: 18px;
        font-weight: 700;
        line-height: 24px;
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .collection-symbol {
        flex-shrink: 0;
        padding: 2px 8px;
        background: color-mix(in srgb, var(--color-neutral-tag-purple-fg) 12%, transparent);
        border: 1px solid var(--color-neutral-tag-purple-border);
        border-radius: 12px;
        color: var(--color-neutral-tag-purple-text);
        font-size: 12px;
        font-weight: 600;
        line-height: 16px;
    }

    .nft-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
    }

    .empty-state {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 48px 16px;

        p {
            color: var(--color-content-text-secondary);
            font-size: 16px;
            line-height: 22px;
            margin: 0;
        }

        &.error p {
            color: var(--color-inputs-border-error);
        }
    }
</style>
