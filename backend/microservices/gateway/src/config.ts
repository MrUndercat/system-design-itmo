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
  userGraphQlUrl: readEnv("USER_GRAPHQL_URL"),
  rentGraphQlUrl: readEnv("RENT_GRAPHQL_URL"),
  commGraphQlUrl: readEnv("COMM_GRAPHQL_URL"),
};

export function readCorsAllowedOrigins(): string[] {
  return readEnv("CORS_ALLOWED_ORIGINS")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
