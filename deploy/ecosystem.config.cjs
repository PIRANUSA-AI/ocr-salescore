// PM2 ecosystem config — runs both frontend & backend on the VPS.
// Usage: pm2 start deploy/ecosystem.config.cjs
// Then:  pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name: 'salescore-frontend',
      cwd: '/var/www/salescore/apps/frontend/.next/standalone/apps/frontend',
      script: 'server.js',
      args: '',
      env: {
        NODE_ENV: 'production',
        PORT: '9003',
        HOSTNAME: '127.0.0.1',
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      error_file: '/var/log/salescore/frontend-error.log',
      out_file: '/var/log/salescore/frontend-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 10000,
      listen_timeout: 15000,
    },
    {
      name: 'salescore-backend',
      cwd: '/var/www/salescore/apps/backend',
      script: 'dist/index.js',
      args: '',
      env: {
        NODE_ENV: 'production',
        BACKEND_PORT: '4000',
        PGHOST: '127.0.0.1',
        PGPORT: '5432',
        PGUSER: 'salescore',
        PGPASSWORD: 'salescore_pass',
        PGDATABASE: 'salescore',
        PG_POOL_SIZE: '15',
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      error_file: '/var/log/salescore/backend-error.log',
      out_file: '/var/log/salescore/backend-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 10000,
    },
  ],
};
