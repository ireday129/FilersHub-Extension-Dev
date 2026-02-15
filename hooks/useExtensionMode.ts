import { useState, useEffect } from 'react';

export const useExtensionMode = () => {
    const [isExtension, setIsExtension] = useState(false);

    useEffect(() => {
        try {
            const inIframe = window.self !== window.top;
            if (!inIframe) return;

            // GHL iframes are not Chrome extension context — skip extension mode
            const isGhlContext = sessionStorage.getItem('ghl_context') === 'true';
            if (isGhlContext) return;

            setIsExtension(true);
            document.body.classList.add('extension-mode');
        } catch (e) {
            // Cross-origin frame access blocked — check if it's GHL before assuming extension
            const isGhlContext = sessionStorage.getItem('ghl_context') === 'true';
            if (isGhlContext) return;

            setIsExtension(true);
            document.body.classList.add('extension-mode');
        }
    }, []);

    return { isExtension };
};
