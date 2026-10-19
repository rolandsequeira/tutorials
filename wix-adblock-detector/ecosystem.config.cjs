// PM2 process file (CloudPanel or any server without Docker):
//   pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [{
    name: 'adblock-notice',
    script: 'src/server.js',
    node_args: '--disable-warning=ExperimentalWarning',
    cwd: __dirname,
    instances: 1, // SQLite and the in-memory rate limiter expect a single process
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production' },
  }],
};
