import type { z } from 'zod';
import type { featuredListSchema, jameyaListSchema, similarListSchema } from '@/shared/contract';

export type JameyaListPage = z.infer<typeof jameyaListSchema>;
export type FeaturedPage = z.infer<typeof featuredListSchema>;
export type SimilarPage = z.infer<typeof similarListSchema>;
