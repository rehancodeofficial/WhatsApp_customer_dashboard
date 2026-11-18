import { isDemoMode } from '@/lib/config';
import type { Repo } from './types';
import { MemoryRepo } from './memory';
import { SupabaseRepo } from './supabase';

let cached: Repo | null = null;

export function getRepo(): Repo {
  if (!cached) cached = isDemoMode() ? new MemoryRepo() : new SupabaseRepo();
  return cached;
}

export type { Repo, Viewer } from './types';
