import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const anlikHaber = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/anlikHaber" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    isDraft: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    author: z.string().optional(),
    category: z.enum(['Siyaset', 'Ekonomi', 'Türkiye', 'Dünya', 'Teknoloji']).optional(),
    breaking: z.boolean().optional(),
    editorPick: z.boolean().optional(),
    sources: z.array(z.object({
      name: z.string(),
      url: z.string().url(),
    })).optional(),
    autoGlossaryLinks: z.boolean().optional(),
    autoGlossaryExclude: z.array(z.string()).optional(),
  }),
});

export const collections = { anlikHaber };
