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
import java.util.Calendar;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Keeps the chosen daily reminder available without an open WebView. */
public final class ReminderReceiver extends BroadcastReceiver {
    private static final String ACTION="cn.qihang.francais.REVIEW",CHANNEL="review";
    private static SharedPreferences prefs(Context c){return c.getSharedPreferences("review-reminder",Context.MODE_PRIVATE);}
    static String date(Calendar c){return new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).format(c.getTime());}
    static String permission(Context c){
        if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED)return "denied";
        return c.getSystemService(NotificationManager.class).areNotificationsEnabled()?"granted":"denied";
    }
    static void sync(Context c,String payload){
        try{JSONObject state=new JSONObject(payload);JSONArray dates=state.getJSONArray("dates");
            if(dates.length()>10000)return;
            for(int i=0;i<dates.length();i++)if(!dates.getString(i).matches("\\d{4}-\\d{2}-\\d{2}"))return;
            String time=state.optString("time","08:00");if(!time.matches("(?:[01]\\d|2[0-3]):[0-5]\\d"))return;
            prefs(c).edit().putBoolean("enabled",state.getBoolean("enabled")).putString("dates",dates.toString()).putString("time",time).apply();schedule(c);
        }catch(Exception ignored){}
    }
    private static JSONArray dates(Context c){try{return new JSONArray(prefs(c).getString("dates","[]"));}catch(Exception error){return new JSONArray();}}
    private static int hour(Context c){return Integer.parseInt(prefs(c).getString("time","08:00").split(":")[0]);}
    private static int minute(Context c){return Integer.parseInt(prefs(c).getString("time","08:00").split(":")[1]);}
    private static int due(Context c,String today){int count=0;JSONArray items=dates(c);for(int i=0;i<items.length();i++)if(items.optString(i).compareTo(today)<=0)count++;return count;}
    private static PendingIntent alarm(Context c){return PendingIntent.getBroadcast(c,1,new Intent(c,ReminderReceiver.class).setAction(ACTION),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static void schedule(Context c){
        AlarmManager manager=c.getSystemService(AlarmManager.class);PendingIntent pending=alarm(c);manager.cancel(pending);
        JSONArray items=dates(c);if(!prefs(c).getBoolean("enabled",false)||items.length()==0||!"granted".equals(permission(c)))return;
        Calendar next=Calendar.getInstance();next.set(Calendar.HOUR_OF_DAY,hour(c));next.set(Calendar.MINUTE,minute(c));next.set(Calendar.SECOND,0);next.set(Calendar.MILLISECOND,0);
        if(next.getTimeInMillis()<=System.currentTimeMillis()||date(next).equals(prefs(c).getString("lastSent","")))next.add(Calendar.DAY_OF_MONTH,1);
        String earliest="9999-12-31";for(int i=0;i<items.length();i++)if(items.optString(i).compareTo(earliest)<0)earliest=items.optString(i);
        if(earliest.compareTo(date(next))>0){String[] parts=earliest.split("-");next.set(Integer.parseInt(parts[0]),Integer.parseInt(parts[1])-1,Integer.parseInt(parts[2]),hour(c),minute(c),0);}
        // Inexact alarms avoid requesting special device access; battery rules may delay delivery.
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.getTimeInMillis(),pending);
    }
    @Override public void onReceive(Context c,Intent intent){
        Calendar now=Calendar.getInstance();String today=date(now);int count=due(c,today);
        if(ACTION.equals(intent.getAction())&&now.get(Calendar.HOUR_OF_DAY)*60+now.get(Calendar.MINUTE)>=hour(c)*60+minute(c)&&prefs(c).getBoolean("enabled",false)&&count>0&&!today.equals(prefs(c).getString("lastSent",""))&&"granted".equals(permission(c))){
            NotificationManager manager=c.getSystemService(NotificationManager.class);
            manager.createNotificationChannel(new NotificationChannel(CHANNEL,"复习提醒 / Révision",NotificationManager.IMPORTANCE_DEFAULT));
            Intent open=new Intent(c,MainActivity.class).putExtra("review",true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent tap=PendingIntent.getActivity(c,2,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            int icon=c.getResources().getIdentifier("ic_notification","drawable",c.getPackageName());
            Notification notification=new Notification.Builder(c,CHANNEL).setSmallIcon(icon).setContentTitle("该复习法语啦 · À réviser !").setContentText(count+" 个词待复习 · "+count+" mots à réviser").setContentIntent(tap).setAutoCancel(true).build();
            manager.notify(8,notification);prefs(c).edit().putString("lastSent",today).apply();
        }
        schedule(c);
    }
}
