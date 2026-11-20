/** Seeded accounts from docs/api/README.md. Each one demonstrates a distinct product path. */
export const DEMO_PASSWORD = 'Pokunity123!';

export interface DemoUser {
  email: string;
  name: string;
  demonstrates: string;
}

export const DEMO_USERS: readonly DemoUser[] = [
  {
    email: 'sara@pokunity.app',
    name: 'Sara',
    demonstrates: 'Happy path: verified, low risk, every seat is open to her.',
  },
  {
    email: 'omar@pokunity.app',
    name: 'Omar',
    demonstrates: 'Browse only: KYC is pending, so reserving shows the verification prompt.',
  },
  {
    email: 'lina@pokunity.app',
    name: 'Lina',
    demonstrates: 'High risk tier: early seats are restricted, with the reason shown.',
  },
  {
    email: 'khaled@pokunity.app',
    name: 'Khaled',
    demonstrates: 'Past expired holds: the hold limit is 1, so a second hold is blocked.',
  },
  {
    email: 'noura@pokunity.app',
    name: 'Noura',
    demonstrates: 'KYC service down: browsing works and reserving reports "temporarily unavailable".',
  },
];
