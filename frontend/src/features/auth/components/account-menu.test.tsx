import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import { redirectToLogin } from '@/shared/lib/navigation';
import { renderWithClient } from '@/test/render';
import { AccountMenu } from './AccountMenu';

vi.mock('@/shared/lib/navigation', () => ({ redirectToLogin: vi.fn() }));

function recordLogoutBody(): { body: () => unknown } {
  let captured: unknown = null;
  server.use(
    http.delete('*/api/session', async ({ request }) => {
      captured = await request.json();
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { body: () => captured };
}

it('logs out of all devices through the BFF, clears the cache and redirects to sign-in', async () => {
  const recorded = recordLogoutBody();
  const { queryClient } = renderWithClient(<AccountMenu />);
  queryClient.setQueryData(['me'], { name: 'Sara' });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Account' }));
  await user.click(screen.getByRole('menuitem', { name: 'Log out of all devices' }));
  await waitFor(() => expect(redirectToLogin).toHaveBeenCalledWith('signed_out'));
  expect(recorded.body()).toEqual({ allSessions: true });
  expect(queryClient.getQueryData(['me'])).toBeUndefined();
});

it('closes the menu on Escape', async () => {
  renderWithClient(<AccountMenu />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Account' }));
  expect(screen.getByRole('menu')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
