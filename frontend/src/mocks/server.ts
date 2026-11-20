import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** Node interception for Vitest. */
export const server = setupServer(...handlers);
