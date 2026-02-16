# Project Rules & Guidelines

## Terminology
- **Strict GHL Payload Types:** When handling data from GHL (users, contacts, locations), use the *exact* property names from the GHL payload as variable names and database column names where possible (e.g., `userId`, `locationId`, `contactId`). Do NOT convert to snake_case (e.g., avoid `ghl_user_id`) unless strictly necessary for an existing schema constraint. This ensures consistency and simplifies debugging.

## Code Style
- **React/TypeScript:** Use functional components and hooks.
- **Styling:** Use Tailwind CSS.
- **App Developement** Use these two Githubs for reference whenever we are adding any features or coding that is specific to GoHighLevel: https://github.com/GoHighLevel/ghl-marketplace-app-template and https://github.com/GoHighLevel/highlevel-api-docs

## Extension Consideration
- We have a Google Chrome extension that loads the app via `index.html` in the popup. Extension mode is detected by **protocol** (`chrome-extension://`) or **path** (starting with `/extension`). The `useExtensionMode` hook (`hooks/useExtensionMode.ts`) checks both to determine if the compact extension UI should be used.
- The extension uses a content script (`public/ghl-content-script.js`) to detect when the user is on a GHL location page. The detected `locationId` is stored in `chrome.storage.local` and read by the `useGhlContext` hook (`hooks/useGhlContext.ts`).
- The service worker (`public/service-worker.js`) manages the GHL context lifecycle, clearing it when the user navigates away from GHL pages.
- The app also runs inside GHL (GoHighLevel) iframes. GHL iframes load the app at `/` (not `/extension`), so they always get the full desktop UI. Never use iframe detection (`window.self !== window.top`) to determine extension mode.
- Make sure the entire application is accessible within the Chrome extension and within any iframe (GHL or otherwise).
