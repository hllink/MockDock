import { buildApp } from "./app.js";
import { getConfig } from "./config.js";

const config = getConfig();
const app = await buildApp(config);

try {
  const address = await app.listen({ host: config.host, port: config.port });
  process.stdout.write(`MockDock server v${config.version} listening at ${address}\n`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
