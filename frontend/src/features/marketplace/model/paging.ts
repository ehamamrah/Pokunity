import type { ListMeta } from '@/shared/contract';

/** `page` is 1-based; returns undefined when the last page has been reached. */
export function nextPageParam(meta: ListMeta): number | undefined {
  return meta.page * meta.pageSize < meta.total ? meta.page + 1 : undefined;
}

/** 1-based rank across all loaded pages, used for analytics `position`. */
export function positionOf(meta: ListMeta, indexInPage: number): number {
  return (meta.page - 1) * meta.pageSize + indexInPage + 1;
}
