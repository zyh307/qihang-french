package cn.qihang.francais;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

public final class ReminderReceiver extends BroadcastReceiver {
    private static final String ACTION="cn.qihang.francais.REVIEW",CHANNEL="review";
    private static SharedPreferences prefs(Context c){return c.getSharedPreferences("review-reminder",Context.MODE_PRIVATE);}
    static String date(Calendar c){return new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).format(c.getTime());}
    private static void channel(Context c){c.getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"复习提醒 / Révision",NotificationManager.IMPORTANCE_DEFAULT));}
    static String permission(Context c){
        channel(c);NotificationManager manager=c.getSystemService(NotificationManager.class);
        if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED)return "denied";
        NotificationChannel channel=manager.getNotificationChannel(CHANNEL);
        return manager.areNotificationsEnabled()&&(channel==null||channel.getImportance()!=NotificationManager.IMPORTANCE_NONE)?"granted":"denied";
    }
    private static boolean validDate(String value){return value.matches("\\d{4}-\\d{2}-\\d{2}");}
    static synchronized void sync(Context c,String payload){
        try{JSONObject state=new JSONObject(payload);JSONArray dates=state.getJSONArray("dates"),errors=state.optJSONArray("errorDates");if(errors==null)errors=new JSONArray();
            if(dates.length()>10000||errors.length()>10000)return;
            for(int i=0;i<dates.length();i++)if(!validDate(dates.getString(i)))return;
            for(int i=0;i<errors.length();i++)if(!validDate(errors.getString(i)))return;
            String time=state.optString("time","08:00");if(!time.matches("(?:[01]\\d|2[0-3]):[0-5]\\d"))return;
            String reviewQuiet=state.optString("reviewQuietUntil",""),errorQuiet=state.optString("errorQuietUntil","");
            if((!reviewQuiet.isEmpty()&&!validDate(reviewQuiet))||(!errorQuiet.isEmpty()&&!validDate(errorQuiet)))return;
            SharedPreferences old=prefs(c);SharedPreferences.Editor editor=old.edit();String legacy=old.getString("lastSent","");
            if(!old.contains("lastReviewSent")&&!legacy.isEmpty())editor.putString("lastReviewSent",legacy);
            if(!old.contains("lastErrorSent")&&!legacy.isEmpty())editor.putString("lastErrorSent",legacy);
            editor.putBoolean("enabled",state.getBoolean("enabled")).putString("dates",dates.toString()).putString("errorDates",errors.toString()).putString("time",time).putString("reviewQuietUntil",reviewQuiet).putString("errorQuietUntil",errorQuiet).remove("threshold").remove("intervalDays").remove("lastSent").apply();
            check(c);
        }catch(Exception ignored){}
    }
    private static JSONArray dates(Context c,String key){try{return new JSONArray(prefs(c).getString(key,"[]"));}catch(Exception error){return new JSONArray();}}
    private static int hour(Context c){return Integer.parseInt(prefs(c).getString("time","08:00").split(":")[0]);}
    private static int minute(Context c){return Integer.parseInt(prefs(c).getString("time","08:00").split(":")[1]);}
    private static int due(Context c,String key,String today){int count=0;JSONArray items=dates(c,key);for(int i=0;i<items.length();i++)if(items.optString(i).compareTo(today)<=0)count++;return count;}
    private static String later(String a,String b){return a.compareTo(b)>=0?a:b;}
    private static String plusDays(String value,int days){Calendar c=Calendar.getInstance();String[] parts=value.split("-");c.set(Integer.parseInt(parts[0]),Integer.parseInt(parts[1])-1,Integer.parseInt(parts[2]),12,0,0);c.add(Calendar.DAY_OF_MONTH,days);return date(c);}
    private static String readyDate(Context c,String key,String quietKey,String sentKey,int interval){
        JSONArray items=dates(c,key);if(items.length()==0)return null;
        ArrayList<String> sorted=new ArrayList<>();for(int i=0;i<items.length();i++)sorted.add(items.optString(i));Collections.sort(sorted);
        String first=later(sorted.get(0),prefs(c).getString(quietKey,"")),last=prefs(c).getString(sentKey,"");
        return last.isEmpty()?first:later(first,plusDays(last,interval));
    }
    private static PendingIntent alarm(Context c){return PendingIntent.getBroadcast(c,1,new Intent(c,ReminderReceiver.class).setAction(ACTION),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static synchronized void schedule(Context c){
        AlarmManager manager=c.getSystemService(AlarmManager.class);PendingIntent pending=alarm(c);
        if(!prefs(c).getBoolean("enabled",false)||!"granted".equals(permission(c))){manager.cancel(pending);prefs(c).edit().remove("nextAlarmAt").apply();return;}
        String review=readyDate(c,"dates","reviewQuietUntil","lastReviewSent",1),errors=readyDate(c,"errorDates","errorQuietUntil","lastErrorSent",2);
        if(review==null&&errors==null){manager.cancel(pending);prefs(c).edit().remove("nextAlarmAt").apply();return;}
        String first=review==null?errors:errors==null?review:review.compareTo(errors)<=0?review:errors;
        Calendar next=Calendar.getInstance();next.set(Calendar.HOUR_OF_DAY,hour(c));next.set(Calendar.MINUTE,minute(c));next.set(Calendar.SECOND,0);next.set(Calendar.MILLISECOND,0);
        if(next.getTimeInMillis()<=System.currentTimeMillis())next.add(Calendar.DAY_OF_MONTH,1);
        if(first.compareTo(date(next))>0){String[] parts=first.split("-");next.set(Integer.parseInt(parts[0]),Integer.parseInt(parts[1])-1,Integer.parseInt(parts[2]),hour(c),minute(c),0);}
        long at=next.getTimeInMillis();if(prefs(c).getLong("nextAlarmAt",0)==at)return;
        manager.cancel(pending);
        try{if(Build.VERSION.SDK_INT<31||manager.canScheduleExactAlarms())manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);}
        catch(SecurityException denied){manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);}
        prefs(c).edit().putLong("nextAlarmAt",at).apply();
    }
    private static boolean intervalReady(Context c,String key,String today,int interval){String last=prefs(c).getString(key,"");return last.isEmpty()||today.compareTo(plusDays(last,interval))>=0;}
    private static void show(Context c,int review,int errors){
        channel(c);NotificationManager manager=c.getSystemService(NotificationManager.class);
        Intent open=new Intent(c,MainActivity.class).putExtra("review",true).putExtra("notebook",review>0?"review":"errors").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap=PendingIntent.getActivity(c,2,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        int icon=c.getResources().getIdentifier("ic_notification","drawable",c.getPackageName());
        String body="复习 "+review+" · 错题 "+errors+" / Révision "+review+" · Erreurs "+errors;
        manager.notify(8,new Notification.Builder(c,CHANNEL).setSmallIcon(icon).setContentTitle("该复习法语啦 · À réviser !").setContentText(body).setContentIntent(tap).setAutoCancel(true).build());
    }
    static synchronized void check(Context c){
        SharedPreferences saved=prefs(c);String legacy=saved.getString("lastSent","");
        if(!legacy.isEmpty()){SharedPreferences.Editor edit=saved.edit();if(!saved.contains("lastReviewSent"))edit.putString("lastReviewSent",legacy);if(!saved.contains("lastErrorSent"))edit.putString("lastErrorSent",legacy);edit.remove("lastSent").apply();}
        Calendar now=Calendar.getInstance();String today=date(now);
        if(prefs(c).getBoolean("enabled",false)&&"granted".equals(permission(c))&&now.get(Calendar.HOUR_OF_DAY)*60+now.get(Calendar.MINUTE)>=hour(c)*60+minute(c)){
            int review=due(c,"dates",today),errors=due(c,"errorDates",today);
            if(today.compareTo(prefs(c).getString("reviewQuietUntil",""))<0||!intervalReady(c,"lastReviewSent",today,1))review=0;
            if(today.compareTo(prefs(c).getString("errorQuietUntil",""))<0||!intervalReady(c,"lastErrorSent",today,2))errors=0;
            if(review>0||errors>0){try{show(c,review,errors);SharedPreferences.Editor edit=prefs(c).edit();if(review>0)edit.putString("lastReviewSent",today);if(errors>0)edit.putString("lastErrorSent",today);edit.apply();}catch(RuntimeException ignored){}}
        }
        schedule(c);
    }
    @Override public void onReceive(Context c,Intent intent){prefs(c).edit().remove("nextAlarmAt").apply();check(c);}
}
