import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const opus = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/opus' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['dev', 'music', 'photo']),
    description: z.string(),
    link: z.string().url(),
    image: z.string(),
    date: z.coerce.date(),
    featured: z.boolean().default(false),
  }),
});

export const collections = { opus };
