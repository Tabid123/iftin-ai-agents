# USSD Flows UI: *870*, *866*, *101#, *212*

Only the screens for these four flows are touched — one admin page that already exists, one new admin tab, and the customer Maamuus flow. Everything is built in the shared codebase, so every tenant gets it (Najax Data is only the example).

## What exists today

- Customer: provider → category → package → payment already works and stays unchanged.
- A small *212* search dialog exists (number → wait → live package list); its logic is reused, the dialog itself is retired.
- The payment step already saves the *212* choice with the pending payment, but not the chosen menu position.
- The Android delivery app already runs all four flows (menu paths, PIN, *212* hold/resume). Nothing changes there.
- Admin: the "USSD Codes" page exists but only offers a free-text code field. No presets, no menu/PIN fields, no price catalog.
- The discovery / price-catalog / unmatched tables exist in the database but are currently closed to the app, so secure tenant-scoped endpoints must be added for the new admin tab.

## Part A — Admin: existing "USSD Codes" page

Keep the page and the sidebar entry as they are; extend the form.

- Preset buttons: 870, 866, 101, 212. Picking one fills the correct template:
  - 870 → `*870*{receiver_phone}#`
  - 866 → `*866*{receiver_phone}#`
  - 101 → `*101#`
  - 212 → `*212*{receiver_phone}#`
- Fields: Provider, Category, Package, Menu 1, Menu 2, Menu 3, SIM PIN, Notes, Active/inactive.
- The saved code is written in the exact format the delivery app expects (template + menu path + PIN), with validation.
- *212* is configurable here too (provider, category Maamuus, root package, menu path, PIN, notes) — but its live prices are NOT managed here.

## Part B — Admin: one new sidebar tab "Qiimaha Baarista"

Exactly one new entry, named "Qiimaha Baarista". No other new tabs.

Inside the page, three sections:

1. **Root packages** — the Maamuus roots (Data, Kuhadal, Data iyo Kuhadal): provider, category, root name, label, active/inactive; create, edit, activate, delete. Saved as discovery roots.
2. **Price catalog** — pick a root, then manage its live-menu rows: label, cost price, selling price, info line 1, info line 2, active/inactive, with add / edit / save / delete. Example: label "$0.5=1GB 24H", cost 0.50, selling 0.55, info 1 "1GB", info 2 "24 Saac".
3. **Aan la helin** — labels the carrier returned that are not in the catalog: raw label, seen count, last seen, with a "Qiimo u samee" button that opens the price form pre-filled with that label so the admin only enters cost, selling and the two info lines.
4. **Sessions** (section inside the same page) — cards with phone, status (Safka ku jira / Waa la baarayaa / Menu diyaar / Fashilmay), device, session state, selected label, error, created and claimed times; auto-refreshing.

## Part C — Customer

### 870 / 866 / 101
No new screens, nothing technical shown: package → payment method → sender → receiver → confirm → pay → processing → success/failure. The Android device handles the menus and PIN behind the scenes.

### 212 — Maamuus
1. Tapping the "Maamuus" category opens a dedicated page: header "XIRMO ADIGA KUU GAAR AH", the provider name, the line "<Tenant> ka iibso Internet adigoona qof wicin, waqti kasta!", and three white rounded cards with a mobile icon on the left, title, chevron on the right: Data, Kuhadal, Data iyo Kuhadal.
2. Tapping a card asks for payment provider, sender number, receiver number. Continue does NOT dial anything — it starts the live search.
3. Search screen, three states:
   - **Queue**: spinner, "Waxaad ku jirtaa safka", position line ("Waxaad tahay #2 safka — 1 qof ayaa kaa horreeya."), "Lacag weli lama bixin — waad joojin kartaa markasta.", Jooji button.
   - **Searching**: spinner, "Waa la baarayaa…", "Waxaan ka helaynaa shirkadda xirmooyinka lambarka 61XXXXXXX.", elapsed seconds.
   - **Results**: top notice "Xiriirka shirkadda waa furan yahay — bixi lacagta gudaha …s" with a live countdown, then a card per package (label, selling price, info line 1, info line 2, IIBSO).
4. **Price missing**: price shows "—" and IIBSO is disabled; the admin fixes it under Qiimaha Baarista → Aan la helin.
5. **Expired**: at zero, "Waqtigii xiriirku wuu dhamaaday. Fadlan dib u baar xirmooyinka." with a "Dib u baar" button; all IIBSO buttons disabled.
6. **IIBSO** keeps root, label, menu position, sender, receiver, payment provider and price, then shows the confirmation card (package name, price, sender, receiver, payment provider) with MAYA / HAA IIBSO.
7. Payment only opens after the pending-payment record is safely saved (retried); if it cannot be saved, no payment is opened and the user is told nothing was charged.
8. Processing screen: "Dalabkaaga waa la diyaarinayaa" with package, receiver, amount and status — never any raw USSD text. For *212* the order resumes the held session; if it expired the backend redials and matches the same package.

## Technical notes

- Small migration: store the chosen menu position next to the label on the pending payment, and add tenant-scoped secure functions so the new admin tab can read/write the price catalog, unmatched labels and discovery sessions.
- The Maamuus page reuses the existing discovery polling (`get_package_discovery`, `get_discovery_queue_status`, `release_discovery_session`) and existing payment logic.
- Countdown comes from the session expiry already stored with the discovery.
- Shared and tenant-scoped: every current and future tenant gets it; the new admin tab is visible only to tenants running SIM/Android delivery, matching existing gating.
- Reuse existing components, tenant colors and wording; mobile-first; back navigation keeps entered numbers.

## Out of scope

No "Dalabyada USSD" tab, no "Xirmooyinka USSD" tab, no tab named "*212 Discovery", no other new menu entries, no changes to normal package buying, the Android app, or unrelated backend logic.
