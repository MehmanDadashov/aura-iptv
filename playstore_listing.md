# Google Play Store Listing - aura IPTV

## App Name
aura IPTV

## Short Description (80 chars max)
Free IPTV player - watch 1000+ live TV channels from around the world

## Full Description
aura IPTV is a free, open-source IPTV player that lets you watch thousands of live TV channels from around the world. Browse channels by country, category, or language. No registration required.

Features:
- 1000+ free live TV channels
- Browse by country, category, or language
- Favorites for quick access
- Built-in video player with HLS support
- Dark theme optimized for viewing
- No registration or subscription required
- Lightweight and fast

Note: aura IPTV does not host any content. All streams are provided by third-party sources.

## Category
Entertainment

## Content Rating
Everyone

## Required Assets
- App icon: 512x512 PNG (playstore_assets/icons/icon_512x512.png)
- Feature graphic: 1024x500 PNG (playstore_assets/feature_graphic_1024x500.png)
- Screenshots: at least 2 phone screenshots (16:9 or 9:16)
- Privacy policy URL required

## Build Instructions
1. Open android/ folder in Android Studio
2. Build → Generate Signed Bundle / APK
3. Create keystore for signing
4. Upload to Google Play Console

## APK Build Command
cd /home/amir/iptv_node
npx cap sync
cd android
./gradlew bundleRelease  # For Play Store (AAB)
./gradlew assembleRelease  # For APK