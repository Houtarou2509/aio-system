import cron from 'node-cron';
import { runBackup } from '../services/backup.service';

// Run daily backup at 02:00 Asia/Singapore (UTC 18:00 previous day)
export function startCronJobs() {
  cron.schedule('0 18 * * *', async () => {
    console.log('[Cron] Running daily backup...');
    try {
      await runBackup();
      console.log('[Cron] Backup completed');
    } catch (err) {
      console.error('[Cron] Backup failed:', err);
    }
  });

  console.log('[Cron] Scheduled: backup at 02:00 SGT');
}