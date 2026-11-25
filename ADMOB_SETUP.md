# AURA IPTV — AdMob Configuration (PRODUCTION)

## ✅ Active AdMob Credentials

| Parameter | Value |
|---|---|
| **AdMob App ID** | `ca-app-pub-1872308537877958~7087590399` |
| **Publisher ID** | `ca-pub-1872308537877958` |
| **Ad Unit ID (all formats)** | `ca-app-pub-1872308537877958/6393666225` |
| **AdSense Slot** | `6393666225` |

---

## 📱 Android (Native AdMob SDK)

**File:** `android/app/src/main/java/com/auraiptv/app/MainActivity.java`

```java
private static final String BANNER_AD_UNIT_ID = "ca-app-pub-1872308537877958/6393666225";
private static final String INTERSTITIAL_AD_UNIT_ID = "ca-app-pub-1872308537877958/6393666225";
private static final String REWARDED_AD_UNIT_ID = "ca-app-pub-1872308537877958/6393666225";
```

**AndroidManifest.xml:**
```xml
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-1872308537877958~7087590399" />
```

---

## 🌐 Web / Desktop (AdSense)

**index.html:**
```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1872308537877958" crossorigin="anonymous"></script>
```

**Ad slots:**
```html
<ins class="adsbygoogle"
     data-ad-client="ca-pub-1872308537877958"
     data-ad-slot="6393666225"
     data-ad-format="auto"></ins>
```

---

## 📊 Ad Formats Active

| Format | Platform | Trigger |
|---|---|---|
| **Banner** | Android (native), Web, Desktop | Always visible at bottom |
| **Interstitial** | Android (native) | Every 5 channel changes |
| **Rewarded** | Android (native) | User opts in for 24h ad-free |
| **AdSense Banner** | Web, Desktop | Top + sticky bottom |

---

## 💰 Revenue Streams

1. **AdMob Banner** — passive income, always visible
2. **AdMob Interstitial** — every 5 channel switches
3. **AdMob Rewarded** — user chooses to watch for 24h premium
4. **AdSense** — web/desktop banner ads
5. **Premium Subscription** — $2.99/month, removes all ads
6. **Buy Me a Coffee** — donations link in app

---

## 🔥 Firebase Analytics Events

| Event | Trigger |
|---|---|
| `app_open` | App launched |
| `channel_play` | Channel started playing |
| `favorite_action` | Channel added/removed from favorites |
| `cast_action` | Chromecast attempted |
| `search` | User searches channels |
| `page_view` | Page navigation |
| `ad_impression` | Ad displayed |
| `ad_click` | Ad clicked |
| `premium_action` | Premium modal viewed / purchase / ad reward |

**Firebase Project:** `aura-iptv-af0a3`
**Measurement ID:** `G-CGQ96JF7HZ`

---

## 📦 Current Builds

| File | Size | URL |
|---|---|---|
| Android APK v6 | 10.5 MB | `https://tv.ai-studio.se/aura-iptv-v6.apk` |
| Windows | 90.2 MB | `https://tv.ai-studio.se/AURA-IPTV-windows.exe` |
| Linux AppImage | 120.2 MB | `https://tv.ai-studio.se/AURA-IPTV-linux.AppImage` |
| Linux .deb | 82.2 MB | `https://tv.ai-studio.se/AURA-IPTV-linux.deb` |

---

## ⚠️ Important Notes

1. **AdMob App ID is live** — ads will serve real advertiser content
2. **Ad Unit ID `6393666225`** — used for all three formats (banner/interstitial/rewarded).
   In AdMob dashboard, create separate ad units for each format for better reporting.
3. **AdSense** — the slot `6393666225` must be created in AdSense dashboard for web ads to serve
4. **Premium subscription** — currently simulated; needs Google Play Billing integration for production
5. **iOS** — project ready, requires Mac + Xcode to build

## 🔗 Links

- AdMob: https://admob.google.com
- AdSense: https://adsense.google.com
- Firebase: https://console.firebase.google.com/project/aura-iptv-af0a3
- Google Play Console: https://play.google.com/console
