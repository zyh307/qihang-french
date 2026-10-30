package cn.qihang.francais;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import org.json.JSONObject;

/** Offline Android host: local assets, system file picker and scoped exports. */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int PICK_FILE=41, SAVE_FILE=42, NOTIFY_PERMISSION=43;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingBytes;
    private String pendingId;
    private FrameLayout container;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        container=new FrameLayout(this);
        container.setBackgroundColor(Color.rgb(243,245,251));
        if(Build.VERSION.SDK_INT>=30){
            getWindow().setDecorFitsSystemWindows(false);
            container.setOnApplyWindowInsetsListener((view,insets)->{
                android.graphics.Insets bars=insets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
                view.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;
            });
        }
        webView=new WebView(this){
            @Override public android.view.inputmethod.InputConnection onCreateInputConnection(android.view.inputmethod.EditorInfo info){
                android.view.inputmethod.InputConnection connection=super.onCreateInputConnection(info);
                if(connection!=null&&(info.inputType&android.text.InputType.TYPE_MASK_CLASS)==android.text.InputType.TYPE_CLASS_TEXT){
                    info.inputType=(info.inputType&~(android.text.InputType.TYPE_TEXT_FLAG_AUTO_CORRECT|android.text.InputType.TYPE_TEXT_FLAG_AUTO_COMPLETE))|android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS;
                    info.imeOptions=(info.imeOptions&~(android.view.inputmethod.EditorInfo.IME_MASK_ACTION|android.view.inputmethod.EditorInfo.IME_FLAG_NO_ENTER_ACTION))|android.view.inputmethod.EditorInfo.IME_ACTION_DONE|android.view.inputmethod.EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING;
                    info.hintLocales=new android.os.LocaleList(java.util.Locale.FRANCE);
                }
                return connection;
            }
        };
        webView.setBackgroundColor(Color.rgb(243,245,251));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings=webView.getSettings();
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setTextZoom(100);settings.setMediaPlaybackRequiresUserGesture(false);
        webView.addJavascriptInterface(new NativeBridge(),"QihangNative");
        webView.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
                String[] accepts=params.getAcceptTypes();
                if(accepts.length==1&&accepts[0].startsWith("image/"))intent.setType("image/*");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try{startActivityForResult(intent,PICK_FILE);}catch(RuntimeException error){fileCallback.onReceiveValue(null);fileCallback=null;}
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();String file=assetPath(uri);
                if(file==null)return notFound();
                try{return new WebResourceResponse(mime(file),"UTF-8",200,"OK",Collections.singletonMap("Cache-Control","no-cache"),getAssets().open(file));}
                catch(IOException error){return notFound();}
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return assetPath(request.getUrl())==null;}
            @Override public void onPageFinished(WebView view,String url){openReviewIntent();}
        });
        container.addView(webView,new FrameLayout.LayoutParams(-1,-1));setContentView(container);
        webView.loadUrl("https://"+HOST+"/index.html");
        ReminderReceiver.schedule(this);
    }
    static String assetPath(Uri uri){
        String path=uri.getPath();
        if(!"https".equals(uri.getScheme())||!HOST.equals(uri.getHost())||path==null||path.contains("..")||path.contains("\\")||path.contains("\u0000"))return null;
        return path.equals("/")?"index.html":path.substring(1);
    }
    private static String mime(String path){
        if(path.endsWith(".html"))return "text/html";if(path.endsWith(".js"))return "application/javascript";
        if(path.endsWith(".css"))return "text/css";if(path.endsWith(".json"))return "application/json";
        if(path.endsWith(".svg"))return "image/svg+xml";if(path.endsWith(".png"))return "image/png";
        if(path.endsWith(".jpg")||path.endsWith(".jpeg"))return "image/jpeg";
        if(path.endsWith(".mp3"))return "audio/mpeg";if(path.endsWith(".woff2"))return "font/woff2";
        return "application/octet-stream";
    }
    private static WebResourceResponse notFound(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    private boolean trustedPage(){return webView!=null&&assetPath(Uri.parse(webView.getUrl()==null?"":webView.getUrl()))!=null;}
    private void event(String name,JSONObject detail){runOnUiThread(()->{if(trustedPage())webView.evaluateJavascript("window.dispatchEvent(new CustomEvent("+JSONObject.quote(name)+",{detail:"+detail.toString()+"}))",null);});}
    private void exportResult(String id,boolean success,boolean cancelled,String message){
        try{JSONObject value=new JSONObject();value.put("id",id);value.put("success",success);value.put("cancelled",cancelled);value.put("message",message);event("qihang-export",value);}catch(Exception ignored){}
    }
    private void permissionResult(){try{JSONObject value=new JSONObject();value.put("permission",ReminderReceiver.permission(this));event("qihang-notification-permission",value);}catch(Exception ignored){}}
    private void openReviewIntent(){
        if(getIntent().getBooleanExtra("review",false)&&trustedPage()){
            if(!Uri.parse(webView.getUrl()).getPath().equals("/index.html")){webView.loadUrl("https://"+HOST+"/index.html");return;}
            webView.evaluateJavascript("window.dispatchEvent(new Event('qihang-review-open'))",null);getIntent().removeExtra("review");
        }
    }
    public final class NativeBridge {
        @JavascriptInterface public String notificationPermission(){return ReminderReceiver.permission(MainActivity.this);}
        @JavascriptInterface public void requestNotifications(){runOnUiThread(()->{
            if(!trustedPage())return;
            if(Build.VERSION.SDK_INT>=33&&checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},NOTIFY_PERMISSION);
            else permissionResult();
        });}
        @JavascriptInterface public void syncReviewSchedule(String payload){ReminderReceiver.sync(MainActivity.this,payload);}
        @JavascriptInterface public void exportFile(String id,String name,String type,String base64,boolean share){
            final byte[] bytes;
            try{if(base64==null||base64.length()>110*1024*1024)throw new IOException();bytes=Base64.decode(base64,Base64.DEFAULT);if(bytes.length==0)throw new IOException();}
            catch(Exception error){exportResult(id,false,false,"文件过大或格式无效 / Fichier invalide.");return;}
            runOnUiThread(()->{
                if(!trustedPage())return;
                if(share){
                    try{
                        if(!"image/png".equals(type)||bytes.length<8||bytes[0]!=(byte)137||bytes[1]!=80||bytes[2]!=78||bytes[3]!=71)throw new IOException();
                        File dir=new File(getCacheDir(),"share");if(!dir.exists()&&!dir.mkdirs())throw new IOException();
                        try(FileOutputStream output=new FileOutputStream(new File(dir,"learning-card.png"))){output.write(bytes);}
                        Uri uri=Uri.parse("content://"+getPackageName()+".share/learning-card.png");
                        Intent send=new Intent(Intent.ACTION_SEND);send.setType("image/png");send.putExtra(Intent.EXTRA_STREAM,uri);
                        send.setClipData(ClipData.newUri(getContentResolver(),"启航法语",uri));send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(send,"分享 / Partager"));exportResult(id,true,false,"");
                    }catch(Exception error){exportResult(id,false,false,"分享失败 / Partage impossible.");}
                    return;
                }
                if(pendingBytes!=null){exportResult(id,false,false,"请先完成上一次保存 / Terminez l’enregistrement précédent.");return;}
                pendingBytes=bytes;pendingId=id;
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(type);intent.putExtra(Intent.EXTRA_TITLE,new File(name.replace('\\','/')).getName());
                try{startActivityForResult(intent,SAVE_FILE);}catch(RuntimeException error){pendingBytes=null;pendingId=null;exportResult(id,false,false,"无法打开保存位置 / Enregistrement indisponible.");}
            });
        }
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==PICK_FILE&&fileCallback!=null){
            ArrayList<Uri> uris=new ArrayList<>();
            if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null){for(int i=0;i<data.getClipData().getItemCount();i++)uris.add(data.getClipData().getItemAt(i).getUri());}else if(data.getData()!=null)uris.add(data.getData());}
            fileCallback.onReceiveValue(uris.isEmpty()?null:uris.toArray(new Uri[0]));fileCallback=null;
        }else if(request==SAVE_FILE){
            final byte[] bytes=pendingBytes;final String id=pendingId;pendingBytes=null;pendingId=null;
            if(result!=RESULT_OK||data==null||data.getData()==null){exportResult(id,false,true,"");return;}
            final Uri target=data.getData();new Thread(()->{
                try(OutputStream output=getContentResolver().openOutputStream(target,"wt")){if(output==null||bytes==null)throw new IOException();output.write(bytes);exportResult(id,true,false,"");}
                catch(Exception error){exportResult(id,false,false,"保存失败 / Échec de l’enregistrement.");}
            }).start();
        }
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==NOTIFY_PERMISSION){permissionResult();ReminderReceiver.schedule(this);}}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);openReviewIntent();}
    @Override public void onBackPressed(){
        if(webView.canGoBack()){webView.goBack();return;}
        webView.evaluateJavascript("(function(){return !window.dispatchEvent(new Event('qihang-back',{cancelable:true}));})()",handled->{if(!"true".equals(handled))finish();});
    }
    @Override protected void onResume(){super.onResume();if(webView!=null){webView.onResume();openReviewIntent();ReminderReceiver.schedule(this);}}
    @Override protected void onPause(){if(webView!=null)webView.onPause();super.onPause();}
    @Override protected void onDestroy(){if(fileCallback!=null)fileCallback.onReceiveValue(null);pendingBytes=null;if(webView!=null){container.removeView(webView);webView.destroy();webView=null;}super.onDestroy();}
}
