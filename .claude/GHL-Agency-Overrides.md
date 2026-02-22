# Reorder & Customize Sidebar Menu Items in Go High Level

**Source:** [ghlguides.com/reorder-sidebar-menu-items-high-level](https://ghlguides.com/reorder-sidebar-menu-items-high-level/)
**Author:** Joe Johnston | **Last Updated:** 01 Jul 2024

---

This guide is a full tutorial on how to easily reorder or customize sidebar menu items in Go High Level. It works for both Agency and Subaccount sidebar menus using only a few lines of CSS code.

Guide includes a full walkthrough video and code snippets. No developers needed.

---

## Tutorial Video

Watch this video then use the code snippet templates below.

🎥 [How to Reorder & Customize High Level Sidebar Menus](https://www.youtube.com/watch?v=daMKtL0UrbY)

---

## Setup Steps

1. Install the Global Custom CSS Code in **Agency > Settings > Company > Custom CSS**
2. Create custom menu items in **Agency > Settings > Custom Menu Link**
3. Get the CSS ID of the menu item you want to customize
4. Use the below code snippet templates to reorder or customize each menu item

That's all there is to it!

---

## CSS Code

Add the below code snippets to **Agency > Settings > Company > Custom CSS.**

### Global Custom CSS Code

This code must be included before menu items can be reordered.

```css
/*
Global Custom CSS Code
Enables reordering of sidebar nav links for agency and subaccount menus
*/
.hl_nav-header > nav {
  display: flex;
  flex-flow: row wrap;
}
.hl_nav-header > nav > a {
  order: 1;
}
```

> This code enables reordering of sidebar menu items.

---

### Reorder or Customize Menu Items

Use this code snippet template to reorder or customize any **Custom Menu Link**.

```css
/* CUSTOM MENU REORDER TEMPLATE - REPLACE CUSTOM_MENU_ID */
#sidebar-v2 .hl_nav-header > nav > a[meta="CUSTOM_MENU_ID"] {
  order: -1;
}
```

Use this template to reorder or customize the **default High Level menu links:**

```css
/*
  DEFAULT MENU ITEM REORDER - REPLACE MENU_ITEM_ID
  Make sure the ID starts with "#"
*/
#sidebar-v2 .hl_nav-header > nav #MENU_ITEM_ID {
  order: -1;
}
```

See table below for the IDs of default menu items.

---

## Example Full Custom Code CSS

This is how your Custom CSS code will look when putting it all together. The Global Custom CSS Code followed by code for each menu item you want to customize.

```css
/* Global Custom CSS Code to reorder menu items */
.hl_nav-header > nav {
  display: flex;
  flex-flow: row wrap;
}
.hl_nav-header > nav > a {
  order: 1;
}

/* Example: move a Custom Menu Link to the top */
/* IMPORTANT: IDs of your custom menu links will be different */
#sidebar-v2 .hl_nav-header > nav > a[meta="13c481b0-6a9a-4c08-b0ee-ef886b46812c"] {
  order: -100;
}

/* Move Opportunities menu item to the top, but after the Custom Menu Link */
#sidebar-v2 .hl_nav-header > nav #sb_opportunities {
  order: -99;
}

/* Move University menu item in agency sidebar to the top */
#sidebar-v2 .hl_nav-header > nav #sb_agency-university {
  order: -1;
}

/* Move Automations link to the bottom of the nav menu */
#sidebar-v2 .hl_nav-header > nav #sb_automation {
  order: 100;
}
```

See [MDN Ordering Flex Items documentation](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Ordering_flex_items) to learn more about how CSS flex-box `order` works.

CSS `order` supports positive and negative numbers. A larger negative number will move the menu item up towards the top. A larger positive number will move the menu item down.

You will **need the CSS ID of each menu item**. Use the browser's Developer Tools to find the ID. See the training video or bottom of this guide on how to open Developer Tools.

Custom menu items have long random strings for CSS IDs that are generated when the menu item is created.

High Level's built-in "default" menu items like `Calendars`, `Mobile App`, `Launchpad` etc. have consistent and human readable CSS IDs.

---

## CSS IDs for Default Menu Items

These are the built-in "default" menu items and CSS IDs for subaccounts.

| Menu Name | CSS ID |
|---|---|
| Launchpad | `#sb_launchpad` |
| Dashboard | `#sb_dashboard` |
| Conversations | `#sb_conversations` |
| Calendars | `#sb_calendars` |
| Contacts | `#sb_contacts` |
| Opportunities | `#sb_opportunities` |
| Payments | `#sb_payments` |
| Marketing | `#sb_email-marketing` |
| Automation | `#sb_automation` |
| Sites | `#sb_sites` |
| Memberships | `#sb_memberships` |
| Media Storage | `#sb_app-media` |
| Reputation | `#sb_reputation` |
| Reporting | `#sb_reporting` |
| App Marketplace | `#sb_app-marketplace` |
| Mobile App | `#sb_location-mobile-app` |
| Settings | `#sb_settings` |

---

## Customizing Active Menu Link

To customize the style of the active menu link, add the `.active` CSS class to the menu link CSS code. Make sure there's no space before ".active".

```css
/* Example: change the Opportunities link to red when active */
#sidebar-v2 nav #sb_opportunities.active {
  background-color: red;
}
```

The above code only changes the Opportunities link when it's active. To customize the active style for all menu links, use the below code.

```css
/* Change any active menu link background to red */
.sidebar-v2-location #sidebar-v2 .hl_nav-header nav a.active {
  background-color: red;
}
```

Be sure to add any customizations for specific menu links below the CSS code for all menu links. CSS will use the last matching rule in the code. If multiple CSS rules match the same item, the CSS code that comes last will be used.

---

## How to Open the Browser Developer Console

Every major browser has a built-in developer tools console. Each browser has a keyboard shortcut as well as a way to open developer tools through the browser's menus. Keyboard shortcuts are different on Mac and Windows.

### Chrome

- **Windows**: Press **Cmd-Shift-J**
- **Mac**: Press **Cmd-Option-J**

Or open the Developer Tools in the **View > Developer** menu in Chrome.

### Edge

- Press **F12** to open Developer Tools.
- Go to the **Console** tab.

### Firefox

- **Windows**: Press **Cmd-Shift-K**
- **Mac**: Press **Cmd-Option-K**

### Safari

1. Enable the Develop menu:
   - Open **Safari**
   - Go to **Preferences**
   - Select the **Advanced** tab
   - Check "Show Develop menu in the menu bar"
2. Open the console:
   - Go to the **Develop** menu
   - Select "Show JavaScript Console"