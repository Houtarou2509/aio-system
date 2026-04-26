module.exports = {
  apps: [
    {
      name: 'aio-system',
      script: './server/dist/index.js',
      cwd: '/home/reggie/.openclaw/workspace/aio-system',
      instances: 1,
      exec_mode: 'fork',
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        DATABASE_URL: 'postgresql://aio_user:dl1nkupp94rd6@localhost:5432/aio_system_db',
        JWT_SECRET: 'b721b1768cae95a796775b62b45fbd189e468595167e29673662a74d93f21ba4',
        REFRESH_TOKEN_SECRET: '23f29e87f97ec367046b92684d2ab8f0c7642922bff3033f6ca7435101f63bc4',
      },
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
