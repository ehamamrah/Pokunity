import { apiClient } from '@/shared/api-client';
import { jameyaDetailSchema } from '@/shared/contract';

/** GET /jameyas/{id}: detail plus the seat map as seen by the viewer (restrictions applied). */
export async function fetchJameyaDetail(id: string) {
  const { data } = await apiClient.get(`/jameyas/${id}`, jameyaDetailSchema);
  return data;
}
