package dev.escape.brazil;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/** Casca WebView: o jogo inteiro (motor, mapas, sprites, som) é o mesmo HTML da versão web, offline nos assets. */
public class MainActivity extends Activity {
    private WebView web;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#120e1c"));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setMediaPlaybackRequiresUserGesture(false);
        web.getSettings().setAllowFileAccess(false);
        web.addJavascriptInterface(new Bridge(), "EscapeAndroid");
        web.setWebViewClient(new WebViewClient() {
            // Links externos abrem no navegador do aparelho.
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                if ("https".equals(scheme) || "http".equals(scheme)) { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); return true; }
                return false;
            }
        });
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.parseColor("#120e1c"));
        frame.addView(web);
        frame.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(0, insets.getSystemWindowInsetTop(), 0, insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        setContentView(frame);
        if (android.os.Build.VERSION.SDK_INT >= 33)
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/game/index.html");
    }

    // Voltar: fora do título volta ao título; no título da versão clássica volta à 2.0; no título da 2.0 fecha o app.
    private void handleBack() {
        web.evaluateJavascript("(function(){var t=document.getElementById('title');if(t&&t.classList.contains('hidden')){location.reload();return 'reload';}return location.pathname.indexOf('/classico-')>=0?'main':'close';})()",
            result -> {
                if ("\"main\"".equals(result)) web.loadUrl("file:///android_asset/game/index.html");
                else if (!"\"reload\"".equals(result)) finish();
            });
    }
    @Override public void onBackPressed() { handleBack(); }

    /** "FECHAR O JOGO" na tela de título: window.close() não fecha um app, então o JS chama exit(). */
    public class Bridge {
        @android.webkit.JavascriptInterface public void exit() { runOnUiThread(MainActivity.this::finishAndRemoveTask); }
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onPause() { web.onPause(); web.pauseTimers(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); web.resumeTimers(); web.onResume(); }
    @Override protected void onDestroy() { web.stopLoading(); web.destroy(); super.onDestroy(); }
}
