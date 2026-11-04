package cn.qihang.francais;
import android.app.*;
import android.app.job.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PowerManager;
import java.text.SimpleDateFormat;
import java.util.*;
import org.json.*;

public final class ReminderReceiver extends BroadcastReceiver {
 private static final String ACTION="cn.qihang.francais.REVIEW",CHANNEL="review";
 private static final int BACKUP_JOB=810;
 private static SharedPreferences prefs(Context c){return c.getSharedPreferences("review-reminder",Context.MODE_PRIVATE);}
 static String date(Calendar c){return new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).format(c.getTime());}
 private static void channel(Context c){c.getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"复习提醒 / Révision",NotificationManager.IMPORTANCE_DEFAULT));}
 static String permission(Context c){channel(c);NotificationManager m=c.getSystemService(NotificationManager.class);if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED)return "denied";NotificationChannel ch=m.getNotificationChannel(CHANNEL);return m.areNotificationsEnabled()&&(ch==null||ch.getImportance()!=NotificationManager.IMPORTANCE_NONE)?"granted":"denied";}
 static String exactPermission(Context c){return Build.VERSION.SDK_INT<31||c.getSystemService(AlarmManager.class).canScheduleExactAlarms()?"granted":"denied";}
 private static boolean valid(String v){return v.matches("\\d{4}-\\d{2}-\\d{2}");}
 static synchronized void sync(Context c,String payload){try{JSONObject v=new JSONObject(payload);JSONArray dates=v.getJSONArray("dates");if(dates.length()>100000)return;for(int i=0;i<dates.length();i++)if(!valid(dates.getString(i)))return;String time=v.optString("time","08:00");if(!time.matches("(?:[01]\\d|2[0-3]):[0-5]\\d"))return;if(!prefs(c).edit().putBoolean("enabled",v.getBoolean("enabled")).putString("dates",dates.toString()).putString("time",time).remove("errorDates").remove("reviewQuietUntil").remove("errorQuietUntil").commit())throw new IllegalStateException();check(c);}catch(Exception failure){prefs(c).edit().putString("scheduleError","提醒设置未保存 / Rappel non enregistré.").commit();}}
 private static PendingIntent alarm(Context c){return PendingIntent.getBroadcast(c,1,new Intent(c,ReminderReceiver.class).setAction(ACTION),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
 private static JSONArray dates(Context c){try{return new JSONArray(prefs(c).getString("dates","[]"));}catch(Exception e){return new JSONArray();}}
 private static int count(Context c,String today){JSONArray ds=dates(c);int n=0;for(int i=0;i<ds.length();i++)if(ds.optString(i).compareTo(today)<=0)n++;return n;}
 private static void backup(Context c,boolean enabled){
  JobScheduler jobs=c.getSystemService(JobScheduler.class);
  if(!enabled){jobs.cancel(BACKUP_JOB);return;}
  if(jobs.getPendingJob(BACKUP_JOB)!=null)return;
  JobInfo job=new JobInfo.Builder(BACKUP_JOB,new ComponentName(c,ReminderJobService.class)).setPersisted(true).setPeriodic(15*60*1000L).build();
  jobs.schedule(job);
 }
 static String status(Context c){
  JSONObject value=new JSONObject();SharedPreferences saved=prefs(c);
  try{
   value.put("enabled",saved.getBoolean("enabled",false));value.put("notifications",permission(c));value.put("exact",exactPermission(c));
   value.put("batteryOptimized",!c.getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(c.getPackageName()));
   value.put("backgroundRestricted",Build.VERSION.SDK_INT>=28&&c.getSystemService(ActivityManager.class).isBackgroundRestricted());
   value.put("nextAlarmAt",saved.getLong("nextAlarmAt",0));value.put("scheduled",saved.getLong("nextAlarmAt",0)>System.currentTimeMillis());
   value.put("backupScheduled",c.getSystemService(JobScheduler.class).getPendingJob(BACKUP_JOB)!=null);
   value.put("hasWords",dates(c).length()>0);value.put("error",saved.getString("scheduleError",""));
  }catch(RuntimeException|JSONException ignored){}
  return value.toString();
 }
 static synchronized void schedule(Context c){
  AlarmManager manager=c.getSystemService(AlarmManager.class);PendingIntent pending=alarm(c);SharedPreferences saved=prefs(c);
  boolean enabled=saved.getBoolean("enabled",false)&&"granted".equals(permission(c))&&dates(c).length()>0;
  try{backup(c,enabled);}catch(RuntimeException ignored){}
  if(!enabled){manager.cancel(pending);saved.edit().remove("nextAlarmAt").remove("scheduleError").commit();return;}
  String first=null;JSONArray ds=dates(c);for(int i=0;i<ds.length();i++){String d=ds.optString(i);if(first==null||d.compareTo(first)<0)first=d;}
  Calendar next=Calendar.getInstance();String[] time=saved.getString("time","08:00").split(":");int hour=Integer.parseInt(time[0]),minute=Integer.parseInt(time[1]);next.set(Calendar.HOUR_OF_DAY,hour);next.set(Calendar.MINUTE,minute);next.set(Calendar.SECOND,0);next.set(Calendar.MILLISECOND,0);
  if(next.getTimeInMillis()<=System.currentTimeMillis()||date(next).equals(saved.getString("lastReviewSent","")))next.add(Calendar.DAY_OF_MONTH,1);
  if(first.compareTo(date(next))>0){String[] d=first.split("-");next.set(Integer.parseInt(d[0]),Integer.parseInt(d[1])-1,Integer.parseInt(d[2]),hour,minute,0);next.set(Calendar.MILLISECOND,0);}
  long at=next.getTimeInMillis();
  // Replacing the same PendingIntent is atomic; do not cancel a working alarm
  // before asking the system to register its replacement.
  try{
   try{if("granted".equals(exactPermission(c)))manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);}catch(SecurityException denied){manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);}
   saved.edit().putLong("nextAlarmAt",at).remove("scheduleError").commit();
  }catch(RuntimeException failure){saved.edit().putString("scheduleError","系统未能安排提醒 / Rappel non planifié.").commit();}
 }
 private static void show(Context c,int count){channel(c);Intent open=new Intent(c,MainActivity.class).putExtra("review",true).putExtra("notebook","review").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);PendingIntent tap=PendingIntent.getActivity(c,2,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);int icon=c.getResources().getIdentifier("ic_notification","drawable",c.getPackageName());c.getSystemService(NotificationManager.class).notify(8,new Notification.Builder(c,CHANNEL).setSmallIcon(icon).setContentTitle("该复习法语啦 · À réviser !").setContentText(count+" 个单词待复习 / "+count+" mots à réviser").setContentIntent(tap).setOnlyAlertOnce(true).setAutoCancel(true).build());}
 static synchronized void check(Context c){
  SharedPreferences saved=prefs(c);Calendar now=Calendar.getInstance();String today=date(now);String[] time=saved.getString("time","08:00").split(":");
  if(saved.getBoolean("enabled",false)&&"granted".equals(permission(c))&&!today.equals(saved.getString("lastReviewSent",""))&&now.get(Calendar.HOUR_OF_DAY)*60+now.get(Calendar.MINUTE)>=Integer.parseInt(time[0])*60+Integer.parseInt(time[1])){int n=count(c,today);if(n>0)try{show(c,n);saved.edit().putString("lastReviewSent",today).commit();}catch(RuntimeException ignored){}}
  schedule(c);
 }
 @Override public void onReceive(Context c,Intent intent){prefs(c).edit().remove("nextAlarmAt").apply();check(c);}
}
