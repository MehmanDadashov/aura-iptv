package com.auraiptv.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.FrameLayout;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.getcapacitor.BridgeActivity;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.ProductDetailsResponseListener;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.initialization.InitializationStatus;
import com.google.android.gms.ads.initialization.OnInitializationCompleteListener;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

/**
 * AURA IPTV monetization host.
 *
 * Ad units come from res/values/strings.xml (one unit per format).
 * Exposes window.Android to the WebView:
 *   showInterstitialAd()            — respects ad-free + 90s cadence
 *   showRewardedAd()                — on reward grants 24h ad-free
 *   isAdFree() / getAdFreeUntil()   — entitlement reads
 *   setPremiumOwned(boolean)        — permanent purchase entitlement
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "AuraIPTV";
    private static final String PREFS = "aura_ads_prefs";
    private static final String KEY_ADFREE_UNTIL = "adfree_until";
    private static final String KEY_PREMIUM_OWNED = "premium_owned";
    private static final long INTERSTITIAL_MIN_INTERVAL_MS = 90_000L;
    private static final long REWARDED_ADFREE_MS = 24L * 60L * 60L * 1000L;

    private AdView bannerAdView;
    private InterstitialAd interstitialAd;
    private RewardedAd rewardedAd;
    private long lastInterstitialAt = 0L;

    private SharedPreferences prefs;

    // ------------------------------------------------------------ lifecycle

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Нативный плагин фонового воспроизведения (foreground service + MediaSession).
        registerPlugin(AuraFgPlugin.class);
        super.onCreate(savedInstanceState);

        // Стрим не должен прерываться при выключенном экране / в фоне.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        initBilling();

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.addJavascriptInterface(new AdsBridge(), "Android");
            // Сервис (кнопки на экране блокировки) шлёт сюда команду play/pause в JS-плеер.
            AuraMediaBridge.setJsToggle(() -> {
                WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                if (wv == null) return;
                wv.post(() -> wv.evaluateJavascript(
                        "(function(){try{(window.__auraFgToggle||function(){})();}catch(e){}})()", null));
            });
        }

        MobileAds.initialize(this, new OnInitializationCompleteListener() {
            @Override
            public void onInitializationComplete(InitializationStatus status) {
                Log.d(TAG, "AdMob initialized");
                if (!isAdFree()) {
                    loadBannerAd();
                    loadInterstitialAd();
                    loadRewardedAd();
                }
            }
        });

        setupBannerAd();
    }

    private void setupBannerAd() {
        if (isAdFree()) return;
        FrameLayout adContainer = new FrameLayout(this);
        adContainer.setId(View.generateViewId());
        adContainer.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        ViewGroup rootView = findViewById(android.R.id.content);
        if (rootView != null) {
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
            );
            params.gravity = android.view.Gravity.BOTTOM;
            rootView.addView(adContainer, params);
        }

        bannerAdView = new AdView(this);
        bannerAdView.setAdUnitId(getString(R.string.ad_unit_banner));
        bannerAdView.setAdSize(AdSize.BANNER);
        adContainer.addView(bannerAdView);
    }

    private void loadBannerAd() {
        if (bannerAdView == null || isAdFree()) return;
        bannerAdView.loadAd(new AdRequest.Builder().build());
    }

    private void loadInterstitialAd() {
        if (isAdFree()) return;
        InterstitialAd.load(this, getString(R.string.ad_unit_interstitial),
                new AdRequest.Builder().build(),
                new InterstitialAdLoadCallback() {
                    @Override
                    public void onAdLoaded(InterstitialAd ad) {
                        interstitialAd = ad;
                        Log.d(TAG, "Interstitial ad loaded");
                    }

                    @Override
                    public void onAdFailedToLoad(LoadAdError e) {
                        Log.d(TAG, "Interstitial ad failed to load: " + e.getMessage());
                    }
                });
    }

    private void loadRewardedAd() {
        if (isAdFree()) return;
        RewardedAd.load(this, getString(R.string.ad_unit_rewarded),
                new AdRequest.Builder().build(),
                new RewardedAdLoadCallback() {
                    @Override
                    public void onAdLoaded(RewardedAd ad) {
                        rewardedAd = ad;
                        Log.d(TAG, "Rewarded ad loaded");
                    }

                    @Override
                    public void onAdFailedToLoad(LoadAdError e) {
                        Log.d(TAG, "Rewarded ad failed to load: " + e.getMessage());
                    }
                });
    }

    @Override
    public void onPause() {
        super.onPause();
        if (bannerAdView != null) bannerAdView.pause();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (bannerAdView != null && !isAdFree()) bannerAdView.resume();
    }

    @Override
    public void onDestroy() {
        if (bannerAdView != null) {
            bannerAdView.destroy();
            bannerAdView = null;
        }
        super.onDestroy();
    }

    // ------------------------------------------------------------ billing

    private BillingClient billingClient;
    private boolean billingConnected = false;
    private final Map<String, ProductDetails> billingProducts = new HashMap<>();
    private static final String PRODUCT_LIFETIME = "premium_remove_ads";
    private static final String PRODUCT_MONTHLY = "premium_monthly";
    private static final String PRODUCT_YEARLY = "premium_yearly";

    private void initBilling() {
        billingClient = BillingClient.newBuilder(this)
                .setListener(new PurchasesUpdatedListener() {
                    @Override
                    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
                        MainActivity.this.onPurchasesUpdated(result, purchases);
                    }
                })
                .enablePendingPurchases()
                .build();
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                billingConnected = result.getResponseCode() == BillingClient.BillingResponseCode.OK;
                Log.d(TAG, "Billing setup: " + result.getResponseCode());
                if (billingConnected) {
                    queryBillingProducts();
                    queryExistingPurchases();
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                billingConnected = false;
                Log.d(TAG, "Billing service disconnected");
            }
        });
    }

    private void queryBillingProducts() {
        if (!billingConnected) return;
        queryProductsForType(BillingClient.ProductType.INAPP, Arrays.asList(PRODUCT_LIFETIME));
        queryProductsForType(BillingClient.ProductType.SUBS, Arrays.asList(PRODUCT_MONTHLY, PRODUCT_YEARLY));
    }

    private void queryProductsForType(String type, List<String> ids) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (String id : ids) {
            products.add(QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(id)
                    .setProductType(type)
                    .build());
        }
        billingClient.queryProductDetailsAsync(
                QueryProductDetailsParams.newBuilder().setProductList(products).build(),
                new ProductDetailsResponseListener() {
                    @Override
                    public void onProductDetailsResponse(BillingResult result, List<ProductDetails> list) {
                        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && list != null) {
                            for (ProductDetails d : list) billingProducts.put(d.getProductId(), d);
                            Log.d(TAG, "Billing products: " + billingProducts.keySet());
                        } else {
                            Log.d(TAG, "Billing products unavailable (" + type + "): " + result.getResponseCode());
                        }
                    }
                });
    }

    private void queryExistingPurchases() {
        if (!billingConnected) return;
        billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
                (result, purchases) -> handlePurchases(purchases));
        billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
                (result, purchases) -> handlePurchases(purchases));
    }

    private void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null && !purchases.isEmpty()) {
            handlePurchases(purchases);
            notifyJsJson("onBillingPurchase", "{\"granted\":true}");
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            notifyJsJson("onBillingFailed", "{\"code\":\"canceled\"}");
        } else if (code != BillingClient.BillingResponseCode.OK) {
            notifyJsJson("onBillingFailed", "{\"code\":" + code + "}");
        }
    }

    private void handlePurchases(List<Purchase> purchases) {
        if (purchases == null) return;
        boolean granted = false;
        for (Purchase p : purchases) {
            if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
            granted = true;
            if (!p.isAcknowledged()) {
                AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
                        .setPurchaseToken(p.getPurchaseToken())
                        .build();
                billingClient.acknowledgePurchase(params, ref -> Log.d(TAG, "Purchase acknowledged"));
            }
        }
        if (granted) {
            prefs.edit().putBoolean(KEY_PREMIUM_OWNED, true).apply();
            runOnUiThread(this::hideBanner);
        }
        notifyJsJson(granted ? "onBillingPurchase" : "onBillingRestored", "{\"active\":" + granted + "}");
    }

    // ------------------------------------------------------------ ad-free state

    private boolean isAdFree() {
        if (prefs.getBoolean(KEY_PREMIUM_OWNED, false)) return true;
        return prefs.getLong(KEY_ADFREE_UNTIL, 0L) > System.currentTimeMillis();
    }

    private void notifyJsJson(String event, String json) {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('" + event + "',{detail:" + json + "}))", null));
    }

    private long getAdFreeUntil() {
        if (prefs.getBoolean(KEY_PREMIUM_OWNED, false)) return Long.MAX_VALUE;
        return prefs.getLong(KEY_ADFREE_UNTIL, 0L);
    }

    private void hideBanner() {
        if (bannerAdView != null) {
            bannerAdView.setVisibility(View.GONE);
            bannerAdView.pause();
        }
    }

    // ------------------------------------------------------------ JS bridge

    private class AdsBridge {

        @JavascriptInterface
        public void showInterstitialAd() {
            runOnUiThread(() -> {
                if (isAdFree()) return;
                long now = System.currentTimeMillis();
                if (now - lastInterstitialAt < INTERSTITIAL_MIN_INTERVAL_MS) return;
                lastInterstitialAt = now;
                if (interstitialAd != null) {
                    interstitialAd.show(MainActivity.this);
                    interstitialAd = null;
                    loadInterstitialAd();
                    return;
                }
                // Не загружен — грузим и показываем сразу по готовности.
                InterstitialAd.load(MainActivity.this, getString(R.string.ad_unit_interstitial),
                        new AdRequest.Builder().build(),
                        new InterstitialAdLoadCallback() {
                            @Override
                            public void onAdLoaded(InterstitialAd ad) {
                                interstitialAd = ad;
                                ad.show(MainActivity.this);
                                interstitialAd = null;
                                loadInterstitialAd();
                            }

                            @Override
                            public void onAdFailedToLoad(LoadAdError e) {
                                Log.d(TAG, "Interstitial load-on-demand failed: " + e.getMessage());
                            }
                        });
            });
        }

        @JavascriptInterface
        public void showRewardedAd() {
            runOnUiThread(() -> {
                if (isAdFree()) return;
                if (rewardedAd != null) {
                    rewardedAd.show(MainActivity.this, rewardItem -> {
                        Log.d(TAG, "User earned reward: " + rewardItem.getAmount());
                        grantAdFree();
                    });
                    rewardedAd = null;
                    loadRewardedAd();
                    return;
                }
                RewardedAd.load(MainActivity.this, getString(R.string.ad_unit_rewarded),
                        new AdRequest.Builder().build(),
                        new RewardedAdLoadCallback() {
                            @Override
                            public void onAdLoaded(RewardedAd ad) {
                                rewardedAd = ad;
                                ad.show(MainActivity.this, rewardItem -> {
                                    Log.d(TAG, "User earned reward: " + rewardItem.getAmount());
                                    grantAdFree();
                                });
                                rewardedAd = null;
                                loadRewardedAd();
                            }

                            @Override
                            public void onAdFailedToLoad(LoadAdError e) {
                                Log.d(TAG, "Rewarded load-on-demand failed: " + e.getMessage());
                                notifyJs("onRewardedFailed");
                            }
                        });
            });
        }

        @JavascriptInterface
        public boolean isAdFree() {
            return MainActivity.this.isAdFree();
        }

        @JavascriptInterface
        public long getAdFreeUntil() {
            return getAdFreeUntil();
        }

        @JavascriptInterface
        public void setPremiumOwned(boolean owned) {
            prefs.edit()
                    .putBoolean(KEY_PREMIUM_OWNED, owned)
                    .apply();
            runOnUiThread(() -> {
                if (owned) {
                    hideBanner();
                } else {
                    if (bannerAdView != null) bannerAdView.setVisibility(View.VISIBLE);
                    loadBannerAd();
                    loadInterstitialAd();
                    loadRewardedAd();
                }
                notifyJs(owned ? "onPremiumOwned" : "onPremiumRevoked");
            });
        }

        @JavascriptInterface
        public boolean billingReady() {
            return billingConnected && !billingProducts.isEmpty();
        }

        @JavascriptInterface
        public boolean buyPlan(String plan) {
            if (!billingConnected) return false;
            String product;
            boolean isSub = false;
            if ("monthly".equals(plan)) { product = PRODUCT_MONTHLY; isSub = true; }
            else if ("yearly".equals(plan)) { product = PRODUCT_YEARLY; isSub = true; }
            else if ("lifetime".equals(plan)) { product = PRODUCT_LIFETIME; }
            else return false;
            final ProductDetails details = billingProducts.get(product);
            if (details == null) {
                Log.d(TAG, "billing: product not loaded: " + product);
                notifyJsJson("onBillingFailed", "{\"code\":\"item_unavailable\"}");
                return false;
            }
            final boolean subs = isSub;
            runOnUiThread(() -> {
                BillingFlowParams.ProductDetailsParams.Builder pb = BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details);
                if (subs && details.getSubscriptionOfferDetails() != null
                        && !details.getSubscriptionOfferDetails().isEmpty()) {
                    pb.setOfferToken(details.getSubscriptionOfferDetails().get(0).getOfferToken());
                }
                billingClient.launchBillingFlow(MainActivity.this,
                        BillingFlowParams.newBuilder()
                                .setProductDetailsParamsList(Arrays.asList(pb.build()))
                                .build());
            });
            return true;
        }

        @JavascriptInterface
        public void restorePurchases() {
            queryExistingPurchases();
        }
    }

    // ------------------------------------------------------------ reward grant

    private void grantAdFree() {
        long until = System.currentTimeMillis() + REWARDED_ADFREE_MS;
        prefs.edit().putLong(KEY_ADFREE_UNTIL, until).apply();
        runOnUiThread(() -> {
            hideBanner();
            notifyJs("onAdFreeGranted", until);
        });
    }

    private void notifyJs(String event) {
        notifyJs(event, 0L);
    }

    private void notifyJs(String event, long until) {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        String detail = until > 0L ? "{detail:{until:" + until + "}}" : "";
        webView.post(() -> webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('" + event + "'," + detail + "))", null));
    }
}