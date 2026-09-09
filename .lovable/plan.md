# Xalka Joogtada ah ee Offline Tenant

- Aqoonsiga tenant-ka ku dhex jira APK-ga ka dhig isha koowaad, xitaa haddii Android uusan si sax ah u sheegin inuu native yahay.
- Marka internetku maqan yahay ama jawaabta server-ku madhan tahay, sii wad tenant-ka ku dhex jira APK-ga ama kaydkii ugu dambeeyay; ha muujin 404.
- Ka ilaali tenant-ka iyo xogta offline-ka in la tirtiro marka user-ku account-ka ka baxo ama tirtiro.
- Hubi build-ka iyo xaaladda offline-ka ee Marwaan.

## Farsamo

- Adkee `resolveSlug` iyo fallback-ka tenant-ka si build identity-gu u shaqeeyo bilaa localStorage.
- Kala saar “tenant dhab ahaan ma jiro” iyo “xiriir ma jiro” ka hor inta aan la gelin xaaladda 404.
- Beddel account cleanup-ka si uusan `localStorage.clear()` u isticmaalin.
