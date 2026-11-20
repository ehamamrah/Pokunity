import type { z } from 'zod';
import type { sessionResponseSchema } from '@/shared/contract';

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
