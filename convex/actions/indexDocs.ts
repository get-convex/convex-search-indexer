import got from "got";
import Sitemapper from "sitemapper";
import { action } from "../_generated/server";
import * as cheerio from "cheerio";
import { ConcurrencyLimiter, getAlgolia } from "./common";
import { htmlToText } from "html-to-text";

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

export default action(async ({}, secret: string) => {
  if (
    typeof secret != "string" ||
    secret !== process.env.SEARCH_INDEXER_SECRET
  ) {
    console.error(
      "Unauthorized -- secret not given or doesn't match backend environment"
    );
    throw "Unauthorized";
  }
  await syncDocsIndex();
});
