module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'node',
      args: 'app.js',
      cwd: __dirname,
      env: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        PORT: process.env.PORT || 3443,
        // DB 접속 정보는 .env 또는 실행 환경변수로 주입하세요.
        // (config/ 는 .gitignore 대상이며, 비밀번호를 저장소에 커밋하지 않습니다.)
        DB_HOST: process.env.DB_HOST || '127.0.0.1',
        DB_PORT: process.env.DB_PORT || 3306,
        DB_USER: process.env.DB_USER || '',
        DB_PASSWORD: process.env.DB_PASSWORD || '',
        DB_NAME: process.env.DB_NAME || 'business_cards'
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
