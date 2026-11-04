package cn.qihang.francais;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Persistent recovery when the system delays or removes a reminder alarm. */
public final class ReminderJobService extends JobService {
 @Override public boolean onStartJob(JobParameters params){
  ReminderReceiver.check(getApplicationContext());
  return false;
 }
 @Override public boolean onStopJob(JobParameters params){return true;}
}
