export default () => ({
  port: parseInt(process.env.PORT ?? '3002', 10),
  mongodb: {
    uri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/auth-service',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'jwt_secret_change_this',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ?? 'refresh_secret_change_this',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
});
