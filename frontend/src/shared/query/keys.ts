/**
 * Factory for TanStack Query keys. Centralising keys keeps invalidation precise:
 * e.g. `queryKeys.jameyas.detail(id)` is the single cache slot the seat map uses.
 */
export const queryKeys = {
  me: () => ['me'] as const,
  jameyas: {
    lists: () => ['jameyas', 'list'] as const,
    list: (filters: unknown) => ['jameyas', 'list', filters] as const,
    featured: () => ['jameyas', 'featured'] as const,
    detail: (id: string) => ['jameyas', 'detail', id] as const,
    similar: (id: string) => ['jameyas', 'similar', id] as const,
  },
  reservations: {
    lists: () => ['reservations', 'list'] as const,
    list: (statuses: readonly string[]) => ['reservations', 'list', statuses] as const,
    detail: (id: string) => ['reservations', 'detail', id] as const,
  },
} as const;
