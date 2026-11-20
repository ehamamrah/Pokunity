import { z } from 'zod';

/** Mirrors LoginRequest in docs/api/openapi.yaml (password minLength 8). */
export const loginFormSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Passwords are at least 8 characters.'),
});

export type LoginCredentials = z.infer<typeof loginFormSchema>;
