import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const opus = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/opus' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['dev', 'music', 'photo']),
    description: z.string(),
    link: z.string().url().optional(),
    image: z.string(),
    date: z.coerce.date(),
    featured: z.boolean().default(false),
    org: z.enum(['nattsu', 'kzgrm']).default('nattsu'),
  }),
});

export const collections = { opus };
