module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'node',
      args: 'app.js',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'development',
        PORT: 3443,
        DB_HOST: '127.0.0.1',
        DB_PORT: 3306,
        DB_USER: 'webapp',
        DB_PASSWORD: 'webapp1234',
        DB_NAME: 'business_cards'
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
