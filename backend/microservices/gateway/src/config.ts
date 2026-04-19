export const config = {
  port: Number(process.env.PORT || 3000),
  userGraphQlUrl: process.env.USER_GRAPHQL_URL || "http://localhost:4001",
  rentGraphQlUrl: process.env.RENT_GRAPHQL_URL || "http://localhost:4002",
  commGraphQlUrl: process.env.COMM_GRAPHQL_URL || "http://localhost:4003",
};
