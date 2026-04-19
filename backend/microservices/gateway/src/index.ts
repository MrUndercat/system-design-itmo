import { startGateway } from "./app";

startGateway().catch((error) => {
  console.error(error);
  process.exit(1);
});
