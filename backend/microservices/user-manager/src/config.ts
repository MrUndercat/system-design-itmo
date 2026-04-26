function readEnv(name: string): string {
  const v = process.env[name];
  if (v == null || v === "") {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return v;
}

function readInt(name: string): number {
  return parseInt(readEnv(name), 10);
}

export const config = {
  port: readInt("PORT"),
  graphqlPort: readInt("GRAPHQL_PORT"),
  jwtSecret: readEnv("JWT_SECRET"),
  internalToken: readEnv("INTERNAL_SERVICE_TOKEN"),
  accessTtl: readInt("ACCESS_TOKEN_TTL_SEC"),
  refreshTtl: readInt("REFRESH_TOKEN_TTL_SEC"),
};
