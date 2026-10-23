module.exports = {
  apps: [{
    name: 'lanilot',
    script: 'server/index.js',
    cwd: __dirname,
    env: { NODE_ENV: 'production' },
    max_memory_restart: '500M'
  }]
};
