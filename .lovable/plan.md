# USSD Flow UI: *870*, *866*, *101#, *212* (Maamuus)

Goal: build the customer-facing screens for the four USSD flows and the admin screens that configure them, reusing the existing provider/category/package/payment screens. The normal package buying flow stays exactly as it is.

## What exists today

- Customer side: provider → category → package → payment already works. A small *212* search dialog exists (`UssdDiscoveryDialog`) that asks for a number, waits, and lists live packages.
- Payment screen already carries the *212* selection into `pending_online_payments` (it stores the chosen label, but not the chosen menu position).
- Android delivery app already handles all four flows end to end (menu paths, PIN, *212* hold/resume, *101#).
- Admin: packages have a free-text USSD field only. There is no flow builder, no *212* price list, no unmatched-label screen, no session view.

Verified in the database: the discovery/price/unmatched tables exist but currently allow no access at all, so the admin screens need dedicated secure read/write endpoints.

## Phase 1 — Maamuus (*212*) customer flow

1. New Maamuus page opened from the "Maamuus" category:
   - Header "XIRMO ADIGA KUU GAAR AH" with the provider name and the intro line.
   - Three cards: Data, Kuhadal, Data iyo Kuhadal (each mapped to its discovery root).
2. Number page: payment method, sender number, receiver number. Continue does NOT dial anything.
3. Live search screen with three states:
   - In queue ("Waxaad ku jirtaa safka", position when known, "Lacag wali lama bixin").
   - Searching ("Waa la baarayaa…", spinner, receiver number).
   - Results: package cards with name, price, two info lines and an IIBSO button, plus a live countdown "Xiriirka *212* waa furan yahay — dooro gudaha 180s". On expiry the buttons disable and a "Dib u baar" button appears.
4. Confirmation sheet (XAQIIJI MAAMUUS): package, amount, sender, receiver, payment provider, seconds left, MAYA / HAA IIBSO.
5. Payment safety: the pending payment record is written first (3 retries, storing chosen label and menu position). Only on success is the payment dialer opened; otherwise show "Cilad farsamo ayaa dhacday. Lacag lama dirin."

## Phase 2 — Delivery progress screen (all four flows)

A shared post-payment screen showing package, receiver, amount, provider and a clear status (Sugaya / La dirayo / Dhameystiran / Guul darro) with a loading indicator, ending in "Xirmada waa lagu guuleystay" or "Xirmada lama dirin" with a retry/support option. No raw USSD text, no IDs.

*870*, *866* and *101#* need no new buying UI — they stay config-driven packages and simply route into this progress screen after payment.

## Phase 3 — Admin

1. USSD Codes editor with a flow type picker (*870*, *866*, *101#, *212*) and fields: provider, category, package, Menu 1, Menu 2, Menu 3, SIM PIN, notes. The editor writes the correct code format for the delivery app and validates it.
2. *212* section with three tabs:
   - Qiimaha: labels grouped into Data / Kuhadal / Data iyo Kuhadal, editable cost price, selling price, info line 1, info line 2, active toggle.
   - Aan la helin: live labels with no price yet, each with a "Qiimo saar" button that opens the price editor.
   - Sessions: phone, status, root, created time, session state, item count.

## Technical notes

- Small migration: add the chosen menu position to `pending_online_payments`, and add security-definer functions (tenant-scoped) for reading/writing `ussd_price_catalog`, `discovery_unmatched_labels` and `ussd_package_discoveries` from the admin screens, since those tables are currently closed.
- Reuse `UssdDiscoveryDialog` logic (polling `get_package_discovery`, `get_discovery_queue_status`, `release_discovery_session`) inside the new Maamuus page rather than duplicating it; the dialog is retired once the page ships.
- Countdown driven by the session expiry already stored with the discovery.
- The delivery progress screen polls the order's delivery status; the Android side is unchanged.
- Admin *212* screens are gated to tenants that run SIM/Android delivery, matching existing capability gating.
- Mobile-first, provider brand colors, back navigation preserves entered numbers.

## Out of scope

No change to the normal package purchase flow, no new components where an existing one fits, and nothing added to the Android app.
