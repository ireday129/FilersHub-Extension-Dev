import { useState, useEffect } from 'react';

const COMPACT_BREAKPOINT = 768;

function checkIsCompact(): boolean {
    const isChromeExtension = window.location.protocol === 'chrome-extension:';
    const isExtensionPath = window.location.pathname.startsWith('/extension');
    const isNarrowViewport = window.innerWidth < COMPACT_BREAKPOINT;
    return isChromeExtension || isExtensionPath || isNarrowViewport;
}

export const useExtensionMode = () => {
    const [isExtension, setIsExtension] = useState(checkIsCompact);

    useEffect(() => {
        const onResize = () => setIsExtension(checkIsCompact());
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        if (isExtension) {
            document.body.classList.add('extension-mode');
        } else {
            document.body.classList.remove('extension-mode');
        }
    }, [isExtension]);

    return { isExtension };
};
