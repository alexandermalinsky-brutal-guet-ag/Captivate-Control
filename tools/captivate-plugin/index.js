import { startCaptivateConnector } from "./connector-core.js";
import { createCaptivateApiAdapter } from "./captivate-api-adapter.example.js";

const captivateApi = createCaptivateApiAdapter();

const runtime = startCaptivateConnector({
  captivateApi,
});

process.on("SIGINT", () => {
  runtime.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  runtime.stop();
  process.exit(0);
});
