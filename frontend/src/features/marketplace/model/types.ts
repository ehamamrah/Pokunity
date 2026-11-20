import type { z } from 'zod';
import type { featuredListSchema, jameyaListSchema } from '@/shared/contract';

export type JameyaListPage = z.infer<typeof jameyaListSchema>;
export type FeaturedPage = z.infer<typeof featuredListSchema>;
