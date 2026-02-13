import { useState, useEffect } from 'react';

export const useExtensionMode = () => {
    const [isExtension, setIsExtension] = useState(false);

    useEffect(() => {
        // Check if running in an iframe (which is how the extension sidepanel/popup renders)
        try {
            const inIframe = window.self !== window.top;
            setIsExtension(inIframe);

            if (inIframe) {
                document.body.classList.add('extension-mode');
            }
        } catch (e) {
            // Access to window.top might be blocked by cross-origin rules in some cases,
            // which usually implies we are in a distinct context like an iframe
            setIsExtension(true);
            document.body.classList.add('extension-mode');
        }
    }, []);

    return { isExtension };
};
