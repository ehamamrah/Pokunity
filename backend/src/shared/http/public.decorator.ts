import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Marks a route as not requiring a JWT (login, health, provider webhook). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
