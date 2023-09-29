import * as dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: `.env.local`, override: true });

import { ConvexHttpClient } from "convex/browser";

if (!process.env.VITE_CONVEX_URL) {
  throw "Make sure VITE_CONVEX_URL is present in the environment";
}

if (!process.env.SEARCH_INDEXER_SECRET) {
  throw "Make sure SEARCH_INDEXER_SECRET is present in the environment";
}

console.log(`Using ${process.env.VITE_CONVEX_URL}...`);

const convex = new ConvexHttpClient(process.env.VITE_CONVEX_URL);

async function runEm() {
  const secret = process.env.SEARCH_INDEXER_SECRET;
  // await convex.action("actions/indexStack", { secret });
  await convex.action("actions/indexDocs", { secret });
}
runEm();
