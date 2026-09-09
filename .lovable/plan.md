# Xalka Offline Tenant — SHARED, dhammaan tenant-yada

Cilada: marka app-ku offline furmo (diyaarad/qadka xiran), qaar ka mid ah
isticmaalayaasha waxaa u soo baxa bogga "404 — Workspace lama helin", halkii
uu ka sii shaqayn lahaa app-ka offline-ka ah.

Xalku wuxuu ku dhacayaa **hal meel oo la wadaago** (shared codebase), sidaas
darteed wuxuu si isku mid ah u shaqeeyaa Marwaan, Riyokaab, Iftin Internet iyo
tenant kasta oo cusub oo mustaqbalka la abuuro. Ma jiro fix gaar ah oo tenant
loo sameeyo.

## Waxa la beddelayo

1. **Aqoonsiga tenant-ka ee build-ka ayaa ah isha koowaad.** Slug-ka iyo
   magaca/logo-ga lagu duubay APK-ga waa la isticmaalayaa isla markiiba, xitaa
   haddii Android uusan si sax ah u sheegin inuu app native yahay, ama haddii
   kaydka device-ku faaruq yahay.

2. **Offline weligiis ma keenayo 404.** Haddii internet la'aan, timeout, ama
   server khalad (5xx) uu dhaco, app-ku wuxuu sii wadayaa tenant-ka ku duuban
   APK-ga ama kaydkii ugu dambeeyay. Boggii 404 wuxuu soo bixi karaa oo keliya
   marka server-ku si cad u sheego in tenant-ku aanu jirin.

3. **Kala saarid khaladaad oo cad.** Saddex xaaladood oo kala duwan:
   tenant dhab ahaan ma jiro / xiriir ma jiro / server khalad. Mid kastaa
   wuxuu leeyahay habdhaqan gaar ah, oo mid midka kale looma qaadanayo.

4. **Cusboonaysiin aamusan marka xiriirku soo laabto.** Xogta tenant-ka waxay
   isku cusboonaysiisaa background-ka, iyada oo aan UI-ga la joojin ama la
   dib-u-load garayn.

5. **Aqoonsiga tenant-ku wuu hadhayaa marka la logout gareeyo ama account la
   tirtiro.** Xogta user-ka (lambar, taariikh, session) waa la tirtirayaa,
   laakiin branding-ka/tenant-ka ma luminayo — sidaas app-ku wuxuu sii ahaanayaa
   app-kii Marwaan/Riyokaab, ma noqonayo mid faaruq.

6. **Tijaabo.** Ugu yaraan Marwaan iyo Riyokaab: bilow ugu horreeyay oo
   diyaarad ah, bilow leh cache, jawaab server 500/madhan, logout offline, iyo
   tirtirid account offline.

## Farsamada

- `src/lib/nativeTenant.ts`: `isNativeApp()` waxaa lagu adkaynayaa hubin
  dheeraad ah (Capacitor global, `capacitor://`/`localhost` origin, user agent),
  si aanay ku tiirsanayn hal calaamad oo laga yaabo inay ku guuldarraysato
  WebView-ka.
- `src/contexts/TenantContext.tsx`:
  - `resolveSlug()` iyo `buildFallbackTenant()` waa hal meel oo shared ah;
    fallback-ka build-ka lama xidhayo `isNativeApp()` kaliya — haddii
    `VITE_TENANT_SLUG` uu jiro, waa la isticmaalayaa.
  - `resolveTenantFromNetwork()` waxaa lagu darayaa timeout gaaban iyo kala
    saarid `error` (network/5xx) vs `data === null` (dhab ahaan ma jiro).
    Kaliya kiiska u dambeeya ayaa gelaya `not_found`; kuwa kale waxay ku
    hadhayaan cache/build identity.
  - Retry aamusan marka `online` dhaco iyo marka app-ka dib loo furo.
- `src/components/pages/Profile.tsx`: `localStorage.clear()` waa la beddelayaa
  tirtirid door ah oo ilaalinaysa `najax.tenant_slug`,
  `najax.tenant_cache.*`, `app_cache_version`, iyo kaydka sawirada.
- Tijaabo: browser preview offline/500 simulation iyo `?tenant=marwaan` /
  `?tenant=riyokaab` si loo hubiyo isla logic-ka shared-ka ah.

## Xusuusin

Isbeddelladan waxay gaaraan taleefannada marka la dhiso APK/AAB cusub oo
`version_code` sare leh; APK-yada hadda la rakibay way sii wadi doonaan
habdhaqankii hore ilaa update.
