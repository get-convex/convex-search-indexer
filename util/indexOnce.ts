import * as dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: `.env.local`, override: true });

if (!process.env.VITE_CONVEX_URL) {
  throw "Make sure VITE_CONVEX_URL is present in the environment";
}

if (!process.env.SEARCH_INDEXER_SECRET) {
  throw "Make sure SEARCH_INDEXER_SECRET is present in the environment";
}

console.log(`Using ${process.env.VITE_CONVEX_URL}...`);

async function runEm() {
  const secret = process.env.SEARCH_INDEXER_SECRET!;
  await fetch(
    process.env.VITE_CONVEX_URL!.replace(".cloud", ".site") + "/index/stack",
    { headers: { "x-indexer-secret": secret }, method: "POST" }
  );
}
runEm();
