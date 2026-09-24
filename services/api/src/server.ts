import { createServer } from "node:http";
import { apiEnvironmentSchema } from "@homebase/config";
import { createRequestHandler } from "./http.js";

const environment = apiEnvironmentSchema.parse(process.env);
const server = createServer(createRequestHandler(environment.WEB_ORIGIN));
server.listen(environment.API_PORT, environment.API_HOST, () => {
  console.log(`HOMEBASE API listening on http://${environment.API_HOST}:${environment.API_PORT}/api/v1`);
});
