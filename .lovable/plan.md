# Localize all app images for instant offline display

## Goal
Ship every static provider logo, category icon, payment logo, banner, flag, and default brand image inside the web/APK bundle so the UI never waits for remote image URLs and never shows a broken-image symbol.

## Implementation
1. **Create one local image registry**
   - Map provider names and aliases to bundled logos: Hormuud, Somnet, Somtel/Telesom, Amtel, Somlink, EVC, eDahab/Golis, Jeeb, and Premier.
   - Map category names and aliases to bundled category artwork, including Anfac, Anfac Plus, Unlimited variants, 5G/5G Plus, ADSL variants, Kaar Kuhadal, MiFi, Qanciye Plus, voice, and no-expiry packages.
   - Map the four existing banners, Somalia flags, Iftin/Najax defaults, and other static artwork already used by the app.

2. **Normalize API image values to local assets**
   - During catalog mapping, replace provider/category/payment image URLs with the matching bundled local asset before data reaches the UI or offline cache.
   - Preserve remote URLs only for genuinely tenant-uploaded/custom images; these use persistent cache and a neutral local fallback.
   - Version the catalog/offline caches so stale remote image paths cannot keep reappearing.

3. **Prevent broken-image rendering everywhere**
   - Upgrade the shared image component to render a local neutral placeholder while resolving images and after failure, without ever mounting an invalid `src`.
   - Replace direct dynamic `<img>` usages in customer-facing provider, category, popular-package, banner, order-history, tenant-brand, payment, and admin preview surfaces with the shared safe component.
   - Keep static imported images as direct bundled imports where they are already reliable.

4. **Make first paint immediate**
   - Use local assets as the first source, not as an after-error fallback.
   - Remove network-dependent preloading for known static provider/category/banner/payment images; retain background caching only for custom tenant uploads.

5. **Verify online and offline**
   - Check the main provider grid and each provider’s category page in the running app.
   - Intercept/block image network requests and reload to simulate airplane mode, confirming all known provider/category images still render and no broken image elements exist.
   - Verify the relevant app tests/build checks and provide the final localized-image inventory.

## Local asset inventory to cover
- **Providers:** Hormuud, Somnet, Somtel, Amtel, Somlink.
- **Payments:** EVC Plus, eDahab/Golis, Jeeb, Premier.
- **Categories:** 5G, 5G Plus, ADSL Arday, ADSL Plus, Anfac, Anfac Plus, Kaar Kuhadal, MiFi Internet, Qanciye Plus, Unlimited Calls (Hormuud/Somtel), Unlimited Data (Hormuud), Unlimited Data & Voice (Hormuud/Somtel/Somlink variants), Unlimited Voice, Voice Somtel, No Expire (Somtel/Somlink).
- **Other static media:** four rotating banners, Somalia flags, Iftin logo, default tenant/Najax logo, app icons, data/connectivity/payment-status artwork, and WhatsApp icon.
