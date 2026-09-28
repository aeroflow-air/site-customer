import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

// RSS feed for the engineering blog, built from the `blog` content collection.
// Links are absolute and include the GitHub Pages base path (/site-customer/).
export async function GET(context: APIContext) {
  const siteUrl = new URL(import.meta.env.BASE_URL, context.site);
  const posts = (await getCollection('blog')).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );

  return rss({
    title: 'AeroFlow Air engineering blog',
    description:
      'Notes from building the AeroFlow Air platform: what was built, which decision record justified it, and what was left out.',
    site: siteUrl,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: new URL(`engineering/${post.id}/`, siteUrl).href,
      categories: post.data.tags,
    })),
    customData: '<language>en-gb</language>',
  });
}
