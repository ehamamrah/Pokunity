import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Marks a route as not requiring a JWT (login, health, provider webhook). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const SESSION_POLICY = 'sessionPolicy';

/**
 * `strict`: money-moving routes refuse tokens whose revocation status cannot be verified (Redis down).
 * `allow-revoked`: logout accepts an already revoked token so that it stays idempotent (204).
 */
export const SessionPolicy = (policy: 'strict' | 'allow-revoked') => SetMetadata(SESSION_POLICY, policy);
