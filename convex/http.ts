import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

type NetlifyDeployWebhookPayload = {
  context?: string;
  branch?: string;
  id?: string;
};

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
    console.error(
      "Index webhook called with incorrect x-indexer-secret header",
    );
    return new Response(null, {
      status: 403,
    });
  }

  await runAction(internal.stack.index, {});
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

  let payload: NetlifyDeployWebhookPayload;
  try {
    payload = (await request.json()) as NetlifyDeployWebhookPayload;
  } catch (error) {
    console.error("Failed to parse Netlify webhook payload", error);
    return new Response(null, {
      status: 400,
    });
  }

  if (payload.context !== "production") {
    console.log(
      `Skipping docs index for Netlify context=${payload.context ?? "unknown"} id=${payload.id ?? "unknown"}`,
    );
    return new Response(null, {
      status: 202,
    });
  }

  console.log(
    `Starting docs index for Netlify production deploy id=${payload.id ?? "unknown"}`,
  );

  // Run action in background (if it passes auth checks).
  // Netlify doesn't like long-running HTTP requests.
  const validated = await runAction(internal.docs.validateAndIndex, {
    jwt: signature,
    async: true,
  });
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
