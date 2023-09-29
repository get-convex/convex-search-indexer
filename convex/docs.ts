"use node";
import got from "got";
import Sitemapper from "sitemapper";
import { action, internalAction } from "./_generated/server";
import * as cheerio from "cheerio";
import { ConcurrencyLimiter, getAlgolia } from "./common";
import { htmlToText } from "html-to-text";
import jwt from "jsonwebtoken";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

// TODO -- simple for now, maybe make contents structurally richer eventually
type AlgoliaDocsDocument = {
  objectID: string;
  title: string;
  contents: string;
};

const convexAlgolia = getAlgolia();

const DOCS_INDEX = "docs";
const DEFAULT_DOCS_URL = "https://docs.convex.dev";
const CRAWL_CONCURRENCY = 10;

async function docUrlToIndexDocument(
  url: string
): Promise<AlgoliaDocsDocument> {
  console.log(`Starting ${url}`);
  // 1. Get the doc HTML
  const response = await got(url, {
    retry: 3,
    headers: {
      "user-agent": "ConvexSearchIndexer/0.1",
    },
  });
  const pageHtml = response.body;

  // 2. Load into Cheerio to grab parts of the page.
  const doc = cheerio.load(pageHtml);

  const title = htmlToText(doc("article header h1").html()!);
  const docBody = doc("article > div.markdown");
  // Doc contains the title as first child, so let's shed it.
  var sections = docBody.children().slice(1);
  // Let's create new container only with doc contents.
  var docStrings = sections.map((_ind, s) => htmlToText(doc.html(s)));
  const contents = docStrings.toArray().join("\n");
  console.log(`Finished ${url}`);

  return {
    objectID: url,
    title,
    contents,
  };
}

async function syncDocsIndex(url?: string) {
  const crawlUrl = url ?? DEFAULT_DOCS_URL;
  const sitemapUrl = `${crawlUrl}/sitemap.xml`;

  const docUrls = new Sitemapper({
    url: sitemapUrl,
    timeout: 5000,
  });

  const { sites } = await docUrls.fetch();
  const limiter: ConcurrencyLimiter<AlgoliaDocsDocument> =
    new ConcurrencyLimiter(CRAWL_CONCURRENCY);
  var promises: Promise<AlgoliaDocsDocument>[] = [];
  for (const s of sites) {
    promises.push(
      limiter.add(async () => {
        return await docUrlToIndexDocument(s);
      })
    );
  }

  const indexDocuments: AlgoliaDocsDocument[] = await Promise.all(promises);
  const index = convexAlgolia.initIndex(DOCS_INDEX);
  await index.replaceAllObjects(indexDocuments, { safe: true });
  console.log(`Done indexing Docs -> Algolia (${indexDocuments.length} docs)`);
}

function validateSecretString(secret?: string): boolean {
  return (
    typeof secret === "string" && secret === process.env.SEARCH_INDEXER_SECRET
  );
}

function validateJwt(inputJwt?: string): boolean {
  if (typeof inputJwt !== "string") {
    return false;
  }
  try {
    jwt.verify(inputJwt, process.env.SEARCH_INDEXER_SECRET!, {
      issuer: "netlify",
    });
  } catch (error) {
    // Some sort of auth error with the JWT.
    console.error(error);
    return false;
  }
  return true;
}

export const validateAndIndex = internalAction({
  args: {
    jwt: v.optional(v.string()),
    async: v.optional(v.boolean()),
  },
  handler: async ({ runAction }, { jwt, async }): Promise<boolean> => {
    if (!validateJwt(jwt)) {
      console.error("Unauthorized -- JWT validation failed");
      return false;
    }
    await runAction(internal.docs.index, { async });
    return true;
  },
});

export const index = internalAction(
  async ({ scheduler }, { async }: { async?: boolean }) => {
    const isAsync = async ?? false;
    if (isAsync) {
      // To not e.g. block netlify.
      // TODO await scheduler.runAfter(0, "actions/indexDocs:index", {});
    } else {
      await syncDocsIndex();
    }
  }
);
