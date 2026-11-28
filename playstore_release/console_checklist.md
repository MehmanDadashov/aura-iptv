# Play Console checklist — AURA IPTV v1.4.1 (versionCode 17)

Account: mg.dadashov@gmail.com

## Upload
- [ ] AAB: playstore_release/aura-iptv-1.4.1-release.aab (signed, upload key = debug.keystore, Play App Signing manages the app signing key)
- [ ] App signing: enroll in Play App Signing on first upload (upload key only)

## Store listing
- [ ] App name: AURA IPTV
- [ ] Short description: 43,000+ free live TV channels from 230+ countries
- [ ] Full description: playstore_assets/listing_en.txt / listing_ru.txt
- [ ] Icon 512: playstore_assets/icons/icon_remote_512.png (matches the launcher icon in the APK)
- [ ] Feature graphic 1024x500: playstore_assets/feature_graphic_1024x500.png
- [ ] Phone screenshots (2 minimum, 4 included): playstore_release/screenshots/screenshot_*.png
- [ ] Privacy policy URL: https://ai-studio.se/privacy.html (verified 200)
- [ ] Category: Entertainment / Video Players & Editors
- [ ] Contact email + support URL: https://ai-studio.se/

## Declarations
- [ ] Ads: contains ads (AdMob banner/interstitial)
- [ ] Data safety: Device ID + App activity -> Advertising & Analytics, shared with Google, encrypted in transit, deletion requestable
- [ ] Content rating: Entertainment questionnaire template (streamed live TV)
- [ ] Target audience: 18+ (required with ads)
- [ ] Release notes: listing_en.txt / listing_ru.txt

## Verify before publish
- [ ] app-ads.txt live at https://ai-studio.se/app-ads.txt -> pub-1872308537877958 (matches strings.xml)
- [ ] UMP consent form shows in EEA (requestConsentInfoUpdate + loadAndShowConsentFormIfRequired before MobileAds.initialize)
- [ ] versionCode 17 > every previously used code on the track