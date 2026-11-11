package cn.qihang.francais;
import android.app.job.JobParameters;
import android.app.job.JobService;
/** Persistent recovery independent of the WebView and activity lifecycle. */
public final class ReminderJobService extends JobService {
 private volatile int generation;
 @Override public boolean onStartJob(JobParameters params){
  final int token=++generation;
  new Thread(()->{try{ReminderReceiver.check(getApplicationContext(),"job");}finally{if(token==generation)jobFinished(params,false);}},"qihang-reminder-recovery").start();
  return true;
 }
 @Override public boolean onStopJob(JobParameters params){generation++;return true;}
}
