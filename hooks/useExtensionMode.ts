import { useState, useEffect } from 'react';

export const useExtensionMode = () => {
    const [isExtension] = useState(() => {
        const isChromeExtension = window.location.protocol === 'chrome-extension:';
        const isExtensionPath = window.location.pathname.startsWith('/extension');
        return isChromeExtension || isExtensionPath;
    });

    useEffect(() => {
        if (isExtension) {
            document.body.classList.add('extension-mode');
        }
    }, [isExtension]);

    return { isExtension };
};
