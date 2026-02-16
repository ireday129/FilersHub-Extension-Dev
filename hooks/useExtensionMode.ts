import { useState, useEffect } from 'react';

export const useExtensionMode = () => {
    const [isExtension] = useState(() => window.location.pathname.startsWith('/extension'));

    useEffect(() => {
        if (isExtension) {
            document.body.classList.add('extension-mode');
        }
    }, [isExtension]);

    return { isExtension };
};
