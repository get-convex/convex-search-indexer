import { httpRouter } from "convex/server";
import { httpEndpoint } from "./_generated/server";

// Webhook called by Sanity on Stack content changes.
const indexStack = httpEndpoint(async ({ runAction }, request) => {
  const secret = request.headers.get("x-indexer-secret");
  if (secret === null) {
    console.error("Index webhook called without x-indexer-secret header");
    return new Response(null, {
      status: 403,
    });
  }

  await runAction("actions/indexStack", secret);
  return new Response(null, {
    status: 200,
  });
});

const http = httpRouter();

http.route({
  path: "/index/stack",
  method: "POST",
  handler: indexStack,
});

export default http;
