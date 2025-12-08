module.exports = {
  apps: [
    {
      name: 'froglog-backend',
      script: 'server.js',
      cwd: '/home/user/webapp/backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Auto restart
      watch: false, // Disable for production
      ignore_watch: ['node_modules', 'logs', 'uploads'],
      
      // Resource limits
      max_memory_restart: '1G',
      
      // Auto restart settings
      restart_delay: 4000,
      max_restarts: 5,
      min_uptime: '10s',
      
      // Source map support
      source_map_support: true,
      
      // Merge logs from different instances
      merge_logs: true,
      
      // Kill timeout
      kill_timeout: 5000
    }
  ],

  deploy: {
    production: {
      user: 'ubuntu',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'https://github.com/yourusername/froglog-medical.git',
      path: '/var/www/froglog-medical',
      'pre-deploy-local': '',
      'post-deploy': 'cd backend && npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};