# Status bar fit + bottom bar flash

## Waxa muuqda video-ga

- Bogagga qaar (tusaale "Marwaan Data - Hormuud", "Notifications") madaxa (header) wuxuu ku dhegan yahay status bar-ka — meel neefsasho ah ma jirto, qoraalkuna wuu cidhiidhi yahay.
- Marka bogga la beddelo, badhanka firfircoon ee hoose wuxuu noqdaa **kabsho cad oo madhan** — astaanta (icon) iyo qoraalka way libdhaan muddo kooban, kadibna way soo laabtaan. Sawirada video-ga (0:18-0:21) way muujinayaan si cad.

## Sababta

1. **Status bar:** hadda web-ka waxaa loo dejiyay inset `0px` (Android-ku isagaa qaadanaya status bar-ka), laakiin header-ka lagama tagin wax padding ah oo gudaha ah — sidaas darteed magaca bogga wuxuu ku dhegayaa xariiqda kore.
2. **Kabshada madhan:** shirifka hoose wuxuu leeyahay `contain: layout paint` + `transform-gpu`, halka fayl kale (`mobile-stability.css`) ay ku qasbayso `transform: none !important`. Labadan is-burinaya waxay Android WebView-ka ka dhigayaan mid haysta sawir duug ah (stale layer): kabshadii hore way sii jirtaa laakiin astaanta lama dhigin mar kale.

## Waxa la beddelayo

### Status bar / header
- Hal il oo keliya oo inset ah: `--effective-safe-area-top` (Android 0, iOS/web env inset).
- Header-yada guud (provider, category, packages, notifications, profile, history) waxay heli doonaan dherer joogto ah (56px) iyo padding sare/hoose oo siman, si qoraalku uusan status bar-ka ku dhegin.
- `mobile-stability.css` dhexdiisa waxaa laga saarayaa `padding-top: 0 !important` ee ku qasbay header-yada inay cidhiidhi noqdaan; meeshiisa waxaa la dhigayaa qiyaas isku mid ah.

### Bottom navigation (flash / booditaan)
- Ka saar `contain: layout paint` iyo `transform-gpu` shiriftka hoose, si aan Android WebView-ku u samayn layer duug ah.
- Ka saar `transition-colors` kabshada firfircoon — beddelka tab-ka isla markiiba ha dhaco, animation la'aan.
- Astaanta firfircoon midabkeeda ha noqoto mid go'an (midabka tenant-ka), oo aan ku xidhnayn xaalad soo daahda marka tenant-ku dib u soo dhacayo — si aysan mar walba cad-on-cad u noqon.
- Xaaladda tab-ka firfircoon waxaa laga qaadanayaa hal jidh keliya (root-ka), iyadoo la aqoonsanayo bogagga hoose ee `/categories/...` si `Hoyga` uu si sax ah u muuqdo (ama uusan muuqan) intii la beddelayo bogga.
- Padding-ka hoose (18px + gesture inset) waxaa loo dhimayaa mid ku habboon si shiriftku uusan u sarrayn.

### Ku hubinta
- Playwright ku qaad shaashado tab-ka kasta oo la taabtay, si loo xaqiijiyo astaanta iyo qoraalka aysan libdhin, iyo in header-ku heerkiisa sare uu siman yahay.

## Xusuusin
APK-ga hore isma beddelo — kadib waxaad u baahan tahay build cusub GitHub Actions ("Build tenant Android app", `version_code` cusub).
