module.exports = {
  apps: [
    {
      name: 'aio-system',
      script: './server/dist/index.js',
      cwd: '/var/www/html/aio-system',
      instances: 1,
      exec_mode: 'fork',
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
