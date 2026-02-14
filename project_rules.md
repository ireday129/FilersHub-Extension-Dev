# Project Rules & Guidelines

## Terminology
- **Strict GHL Payload Types:** When handling data from GHL (users, contacts, locations), use the *exact* property names from the GHL payload as variable names and database column names where possible (e.g., `userId`, `locationId`, `contactId`). Do NOT convert to snake_case (e.g., avoid `ghl_user_id`) unless strictly necessary for an existing schema constraint. This ensures consistency and simplifies debugging.

## Code Style
- **React/TypeScript:** Use functional components and hooks.
- **Styling:** Use Tailwind CSS.

## Extension Consideration
- We have a google chrome extension that will be used to access the application. Make sure the entire application is accessible within the extension and also within any iframe.
