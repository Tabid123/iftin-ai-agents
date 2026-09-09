# Delivery APK: ku wareejinta koodhka Riyokaab (tenant login)

## Waxa la rabo
Koodhka buuxa ee delivery app-ka aad soo dirtay (Riyokaab) halkan lagu keeno, laakiin:
- Magaca app-ka iyo package-ka: `com.iftin.resellers` (Iftin Agents).
- Gelitaanka: email + password ee tenant kasta — ma aha admin guud.
- Qalabku wuxuu ku xidhmaa tenant-ka gudaha `register-device`; dalab kasta wuxuu ahaanayaa mid tenant-kaas u gaar ah.

## Waxa koodhka cusub keenayo (oo hadda maqan)
- Splash + Login + Dashboard buuxa (620 sadar) halkii hal shaashad fudud.
- USSD engine ballaadhan: 870, 866, 101, 212 flows + accessibility service (guud ahaan ~5,000 sadar).
- SMS receiver dhamaystiran: lacag-bixin xaqiijin, balance update, sms_logs, kaalmo dedup.
- Auto-start boot ka dib, heartbeat alarm 5 daqiiqo kasta, watchdog worker, polling worker, Room database (queue offline ah).

## Qorshaha
1. **Soo rar oo magac-beddel** — dhammaan faylasha `com.riyokaab.delivery` → `com.iftin.resellers`, magaca app-ka "Iftin Agents", theme/strings/icons la habeeyo.
2. **Beddel auth-ka** — meesha laga saarayo `is_admin` RPC-ga Riyokaab. Halkiisa:
   - Login → Supabase Auth (email/password) ee mashruucan.
   - Kadib → `register-device` (email, password, deviceId) → wuxuu soo celiyaa `tenantId`.
   - `tenantId` + email si ammaan ah loogu keydiyo (EncryptedSharedPreferences).
   - Logout → session tirtir, adeegga jooji, device id sii hay.
3. **URL-ada la beddelo** — dhammaan `ruulpufuvxcdbslegcvc.supabase.co` → mashruucan Supabase, laguna dhex dhigo build config (sida hadda), si GitHub Actions loo beddeli karo.
4. **Xidhiidhka server-ka la hubiyo** — `activate-package` (pending, dispatch, status, ping, otp-pending, device-config), `process-payment-receipt`, `update-sim-balance`, `sms_logs`, iyo discovery RPC-yada (`claim_next_discovery`, `complete_discovery`, `claim_discovery_selection`, `complete_discovery_selection`, `discovery_session_lost`, `discovery_has_waiting_request`) — dhammaantood horeba way jiraan.
5. **Dabaqyada aan la hayn ee la saaro** — `increment_bulk_sms_counter` RPC ma jiro halkan; qaybtaas bulk SMS waa la damin doonaa ilaa aad rabto.
6. **Build** — Gradle/workflow-ga hadda jira la waafajiyo (Room kapt, OkHttp, WorkManager, security-crypto), kadib GitHub Actions APK cusub la dhiso.

## Faahfaahin farsamo
- Halka la beddelayo: `android-app/` oo dhan waa la bedelayaa koodhka cusub; hore wuxuu ahaa 4 fayl oo kooban, cusubna waa 17 fayl / ~8,600 sadar.
- `AuthRepository.kt`: `verifyIsAdmin()` waxaa lagu beddelayaa `registerDevice()` (functions/v1/register-device) oo soo celiya `tenantId`; haddii tenant la waayo login waa la diidayaa.
- `DeliveryApiClient` + `SmsReceiver` + `UssdDialerService`: base URL/anon key waxay ka imanayaan `BuildConfig` (sida faylka hadda), ma aha string adag.
- `register-device` marka hore wuxuu u baahan yahay `sim1Number`/`sim2Number` — waa la sii deyn doonaa haddii ay diyaar yihiin, si `sim_balances` rows loo abuuro.
- `applicationId`/`namespace`: `com.iftin.resellers`, `versionCode` waa la kordhinayaa si APK cusub loo rakibi karo.

## Kadib
Waxaa loo baahan yahay build cusub oo GitHub Actions ah (`iftin-delivery-agent`), kadibna telefoonka lagu rakibo — ogolaanshaha SMS iyo Accessibility waa la codsan doonaa marka la galo.
