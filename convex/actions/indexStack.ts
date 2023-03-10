import groq from "groq";
import algoliasearch from "algoliasearch";
import markdownToTxt from "markdown-to-txt";
import { createClient as createSanityClient } from "@sanity/client";
import { action } from "../_generated/server";

const ALGOLIA_APP_ID = "1KIE511890";
const STACK_INDEX = "stack";
const SANITY_APP_ID = "ts10onj4";

const sanity = createSanityClient({
  projectId: SANITY_APP_ID,
  dataset: "production",
  apiVersion: "v1",
  useCdn: false,
});

const convexAlgolia = algoliasearch(
  ALGOLIA_APP_ID,
  process.env.ALGOLIA_API_KEY!
);

const A_LOT_OF_POSTS = 10000;

type AlgoliaStackDocument = {
  objectID: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
};

// A union of the fields needed for fetching articles and videos.
const postFields = `
  _id,
  title,
  content,
  summary,
  'slug':slug.current,
  'tags': tags[]->tag.current
`;

type Post = {
  _id: any;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  slug: string;
};

async function getPosts(limit: number): Promise<AlgoliaStackDocument[]> {
  const query = groq`
    *[_type == "post" && dateTime(published) < dateTime(now())] | order(featured desc, published desc)[0...${limit}] {
      ${postFields}
    }
  `;
  const sanityPosts = await sanity.fetch<Post[]>(query);

  const posts = await Promise.all(sanityPosts.map(postToAlgoliaDocument));

  return posts;
}

function postToAlgoliaDocument(post: Post): AlgoliaStackDocument {
  return {
    objectID: post.slug,
    title: post.title,
    summary: post.summary ?? "",
    content: markdownToTxt(post.content ?? ""),
    tags: post.tags,
  };
}

// This isn't incremental, but oh well. We don't have that much content yet.
async function syncAlgoliaIndex() {
  console.log("Indexing Stack -> Algolia");
  const posts = await getPosts(A_LOT_OF_POSTS);
  for (const p of posts) {
    console.log(` .. Adding post ${p.title}`);
  }
  const index = convexAlgolia.initIndex(STACK_INDEX);
  await index.replaceAllObjects(posts, { safe: true });
  console.log("Done indexing Stack -> Algolia");
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
  await syncAlgoliaIndex();
});
