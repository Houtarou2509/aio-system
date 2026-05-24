import cron from 'node-cron';
import { runBackup } from '../services/backup.service';
import { checkAndGenerateNotifications } from '../services/notification.service';
import { checkAndNotifyWarrantyExpiry } from '../services/warrantyCheck.service';

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

  // Run notification check every day at 09:00 Asia/Singapore (UTC 01:00)
  cron.schedule('0 1 * * *', async () => {
    console.log('[Cron] Running notification check...');
    try {
      const created = await checkAndGenerateNotifications();
      console.log(`[Cron] Notification check completed: ${created} new notification(s)`);
    } catch (err) {
      console.error('[Cron] Notification check failed:', err);
    }
  });

  // Run warranty expiry check every day at 08:00 Asia/Singapore (UTC 00:00)
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running warranty expiry check...');
    try {
      await checkAndNotifyWarrantyExpiry();
      console.log('[Cron] Warranty expiry check completed');
    } catch (err) {
      console.error('[Cron] Warranty expiry check failed:', err);
    }
  });

  // Initial warranty check after a 10-second delay
  setTimeout(() => {
    console.log('[Cron] Running initial warranty expiry check...');
    checkAndNotifyWarrantyExpiry().catch((err) => {
      console.error('[Cron] Initial warranty expiry check failed:', err);
    });
  }, 10_000);

  console.log('[Cron] Scheduled: backup at 02:00 SGT');
  console.log('[Cron] Scheduled: notifications at 09:00 SGT');
  console.log('[Cron] Scheduled: warranty check at 08:00 SGT');
}