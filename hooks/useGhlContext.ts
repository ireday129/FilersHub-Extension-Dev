import { useState, useEffect } from 'react';

export interface GhlContext {
    locationId: string;
    url: string;
    timestamp: number;
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export const useGhlContext = (isExtension: boolean) => {
    const [ghlContext, setGhlContext] = useState<GhlContext | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isExtension) {
            setLoading(false);
            return;
        }

        if (typeof chrome === 'undefined' || !chrome.storage?.local) {
            setLoading(false);
            return;
        }

        // Read initial value
        chrome.storage.local.get('ghlContext', (result) => {
            const ctx = result.ghlContext as GhlContext | undefined;
            if (ctx && (Date.now() - ctx.timestamp) < STALE_THRESHOLD_MS) {
                setGhlContext(ctx);
            }
            setLoading(false);
        });

        // Listen for changes while popup is open
        const listener = (
            changes: { [key: string]: chrome.storage.StorageChange },
            areaName: string
        ) => {
            if (areaName === 'local' && changes.ghlContext) {
                const newValue = changes.ghlContext.newValue as GhlContext | undefined;
                if (newValue) {
                    setGhlContext(newValue);
                } else {
                    setGhlContext(null);
                }
            }
        };

        chrome.storage.onChanged.addListener(listener);
        return () => {
            chrome.storage.onChanged.removeListener(listener);
        };
    }, [isExtension]);

    return { ghlContext, loading };
};
