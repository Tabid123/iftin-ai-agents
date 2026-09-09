# USSD Flows UI: *870*, *866*, *101#, *212*

Scope: only the screens for these four flows — admin side and customer side. No redesign of the rest of the app, no new sidebar menus, no branding copied from anywhere. Everything is built in the shared codebase, so every tenant gets it (Najax Data is just the example).

## What exists today

- Customer: provider → category → package → payment already works. A small *212* search dialog exists that asks for a number, waits, and lists live packages.
- The payment screen already saves the *212* choice with the pending payment (it saves the chosen label, but not the chosen menu position).
- The Android delivery app already runs all four flows (menu paths, PIN, *212* hold/resume, *101#). Nothing changes there.
- Admin has only a free-text USSD field on a package. No flow builder, no *212* price list, no unmatched list, no sessions view.
- The discovery/price/unmatched tables exist in the database but are currently closed to the app, so the admin screens need secure endpoints added.

## Part A — Admin (inside the existing "USSD Codes" page)

The existing USSD Codes page gains internal tabs. No new sidebar entries.

1. **Flow Config** — provider, category, package, flow type (*870*, *866*, *101#*, *212*), Menu 1, Menu 2, Menu 3, SIM PIN, notes, active toggle. Choosing a flow type pre-fills the correct prefix/template, and the saved code is written in the exact format the delivery app expects (with validation).
2. **Dalabyada USSD** — list of USSD orders as cards: provider, package, receiver, price, sender/origin, date-time, status badge (Socda / Dalab dhammaystiran / La joojiyay / Cilad), plus a refresh button. No raw data shown.
3. **Xirmooyinka USSD** — add / edit / delete / activate USSD-only packages: name, data info, selling price, cost price, validity, provider, USSD code. Shows the note "Xirmooyinkan waxaa loogu talagalay USSD flow."
4. **212** section with three sub-tabs:
   - **Xirmooyinka Baarista (*212*)** — create discovery root packages (provider, category — creating the category if missing, root name, label, active) marked as discovery roots, e.g. Maamuus → Data, Kuhadal, Data iyo Kuhadal.
   - **Qiimaha *212*** — pick a root, then manage the live-menu labels: label, cost price, selling price, info line 1, info line 2, active; add / edit / save / delete.
   - **Aan la helin** — labels the carrier returned that have no price yet: raw label, times seen, last seen, with "Qiimo u samee" (opens the price form pre-filled with the label) and dismiss.
   - **Sessions** — top counters (Socda, Safka, Aalado) and cards with phone, status (Safka ku jira / Waa la baarayaa / Menu diyaar / Fashilmay), device, session state, selected package, error, queued and claimed times, auto-refreshing.

## Part B — Customer

### 870 / 866 / 101
No new screens and nothing technical shown. The existing flow stays: package → payment method → sender → receiver → confirm → pay → processing. The Android device handles the menus behind the scenes.

### 212 — Maamuus
1. Tapping the "Maamuus" category opens a dedicated page: header "XIRMO ADIGA KUU GAAR AH", provider name, the line "… ka iibso Internet adigoona qof wicin, waqti kasta!" (tenant name inserted automatically), and vertical white rounded cards with a phone icon and chevron: Data, Kuhadal, Data iyo Kuhadal.
2. Tapping a card asks for payment provider, sender number and receiver number. Continue does NOT dial anything yet — it starts the live search.
3. Search screen with three states:
   - **Queue**: spinner, "Waxaad ku jirtaa safka", position line when known, "Lacag weli lama bixin — waad joojin kartaa markasta.", Jooji button.
   - **Searching**: "Waa la baarayaa…", the receiver number, elapsed seconds, spinner.
   - **Results**: top notice "Xiriirka shirkadda waa furan yahay — bixi lacagta gudaha …s" with a live countdown, then a card per package (label, price, info line 1, info line 2, IIBSO). Packages with no price show "—" and a disabled button.
4. **Expired**: at zero, "Waqtigii xiriirku wuu dhamaaday. Fadlan dib u baar xirmooyinka." with a "Dib u baar" button; buying is blocked.
5. **IIBSO** keeps root, label, menu position, receiver, sender, payment provider and price, then shows the confirmation card (package, price, sender, receiver, payment provider) with MAYA / HAA IIBSO.
6. Payment only happens after selection, and only once the pending-payment record is safely saved (retried up to 3 times). If it cannot be saved, no payment is opened and the user sees "Cilad farsamo ayaa dhacday. Lacag lama dirin."
7. Processing screen afterwards: "Dalabkaaga waa la diyaarinayaa", package, receiver, amount, status/loading — never any raw USSD text.

## Technical notes

- Small migration: store the chosen menu position alongside the label on the pending payment, and add tenant-scoped secure functions so the admin screens can read/write the price catalog, unmatched labels and discovery sessions (those tables are currently closed).
- The Maamuus page reuses the existing discovery polling logic (`get_package_discovery`, `get_discovery_queue_status`, `release_discovery_session`); the old dialog is retired once the page ships.
- Countdown driven by the session expiry already stored with the discovery.
- All work lives in the shared codebase and is tenant-scoped, so every current and future tenant gets it.
- Admin USSD tabs stay visible only to tenants running SIM/Android delivery, matching existing gating.
- Reuse existing components, payment logic, order-status UI and tenant colors; mobile-first; back navigation keeps entered numbers.

## Out of scope

Normal package buying stays unchanged, no Android app changes, no other pages touched.
