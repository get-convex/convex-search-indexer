import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

// Webhook called by Sanity on Stack content changes.
const indexStack = httpAction(async ({ runAction }, request) => {
  const secret = request.headers.get("x-indexer-secret");
  if (secret === null) {
    console.error("Index webhook called without x-indexer-secret header");
    return new Response(null, {
      status: 403,
    });
  }
  if (secret !== process.env.SEARCH_INDEXER_SECRET) {
    console.error("Index webhook called with incorrect x-indexer-secret header");
    return new Response(null, {
      status: 403,
    });
  }

  await runAction("actions/indexStack", {});
  return new Response(null, {
    status: 200,
  });
});

// Webhook called by netlify on documentation changes
const indexDocs = httpAction(async ({ runAction }, request) => {
  const signature = request.headers.get("X-Webhook-Signature");

  if (signature === null) {
    console.error("Index webhook called without x-webhook-signature header");
    return new Response(null, {
      status: 403,
    });
  }
  // Run action in background (if it passes auth checks).
  // Netlify doesn't like long-running HTTP requests.
  const validated = await runAction("actions/indexDocs:validateAndIndex", { jwt: signature, async: true });
  if (!validated) {
    console.error("JWT validation failed");
    return new Response(null, {
      status: 403,
    });
  }
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
http.route({
  path: "/index/docs",
  method: "POST",
  handler: indexDocs,
});

export default http;
