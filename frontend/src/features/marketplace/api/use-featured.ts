'use client';

import { useQuery } from '@tanstack/react-query';
import { featuredOptions } from './jameya-catalog';

export function useFeatured() {
  return useQuery(featuredOptions());
}
