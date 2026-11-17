// @vitest-environment jsdom
/**
 * Static snapshot (published read-only copy): people are credited, not measured.
 * - /people becomes a credits page: who contributed and how (role, kind of work, initiatives,
 *   repos). No per-person figures.
 * - Skills, Team, person sheets and Ajustes are not part of the snapshot.
 * - The per-initiative people table lists names only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/lib/staticMode', async (orig) => ({
  ...(await orig<typeof import('../src/lib/staticMode')>()),
  IS_STATIC: true,
}));

import { Credits } from '../src/pages/Credits';
import { Nav } from '../src/components/Nav';
import { initiativePeopleColumns } from '../src/pages/Initiative';
import { STATIC_HIDDEN_ROUTES } from '../src/App';

const CREDITS = {
  people: [
    { name: 'Carol Poe', role: null, kinds: ['Code review'], initiatives: [], repos: ['repo-b'] },
    {
      name: 'Alice Doe',
      role: 'Tech Lead',
      kinds: ['Desarrollo', 'Code review'],
      initiatives: ['Tarjeta', 'Pagos'],
      repos: ['repo-a', 'repo-b'],
    },
  ],
};

function stubFetch(body: unknown) {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', f);
  return f;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Credits page (static /people)', () => {
  it('asks for /api/credits and lists people by name with role, kind of work, initiatives and repos', async () => {
    const f = stubFetch(CREDITS);
    const { container } = render(<Credits />);
    await screen.findByRole('heading', { level: 1, name: 'Personas' });
    expect(String(f.mock.calls[0]![0])).toBe('/api/credits');

    const cards = [...container.querySelectorAll<HTMLElement>('.credit-card')];
    expect(cards.map((c) => c.querySelector('h3')!.textContent)).toEqual(['Alice Doe', 'Carol Poe']);

    const alice = within(cards[0]!);
    expect(alice.getByText('Tech Lead')).toBeTruthy();
    expect(alice.getByText('Desarrollo')).toBeTruthy();
    expect(alice.getByText('Code review')).toBeTruthy();
    expect(alice.getByText('Tarjeta')).toBeTruthy();
    expect(alice.getByText('repo-a')).toBeTruthy();
  });

  it('shows no per-person figures', async () => {
    stubFetch(CREDITS);
    const { container } = render(<Credits />);
    await screen.findByRole('heading', { level: 1, name: 'Personas' });
    expect(container.querySelector('.kpi')).toBeNull();
    for (const label of ['Entregadas', 'PRs mergeadas', 'Reviews hechas', 'Bloqueadas']) {
      expect(screen.queryByText(label)).toBeNull();
    }
    for (const card of container.querySelectorAll('.credit-card')) expect(card.textContent).not.toMatch(/\d/);
  });

  it('omits the role line when the person has no role', async () => {
    stubFetch(CREDITS);
    const { container } = render(<Credits />);
    await screen.findByRole('heading', { level: 1, name: 'Personas' });
    const carol = [...container.querySelectorAll<HTMLElement>('.credit-card')][1]!;
    expect(carol.querySelector('.credit-role')).toBeNull();
  });
});

describe('people no longer in the team', () => {
  it('says «Aportó en» for them and «Aporta en» for the rest', async () => {
    stubFetch({
      people: [
        { name: 'Alice Doe', role: null, active: true, kinds: ['Desarrollo'], initiatives: [], repos: [] },
        { name: 'Carol Poe', role: null, active: false, kinds: ['Code review'], initiatives: [], repos: [] },
      ],
    });
    const { container } = render(<Credits />);
    await screen.findByRole('heading', { level: 1, name: 'Personas' });
    const [alice, carol] = [...container.querySelectorAll<HTMLElement>('.credit-card')];
    expect(within(alice!).getByText('Aporta en')).toBeTruthy();
    expect(within(carol!).getByText('Aportó en')).toBeTruthy();
    expect(within(carol!).queryByText('Aporta en')).toBeNull();
  });
});

describe('static navigation', () => {
  it('keeps Personas and drops Skills, Team and Ajustes even for a TL role', () => {
    render(
      <MemoryRouter>
        <Nav role="tl" authDisabled />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Personas' })).toBeTruthy();
    for (const name of ['Skills', 'Team', 'Ajustes']) expect(screen.queryByRole('link', { name })).toBeNull();
  });

  it('declares the routes left out of the snapshot', () => {
    expect([...STATIC_HIDDEN_ROUTES].sort()).toEqual(['/me/:slug', '/settings', '/skills', '/team', '/team/:slug']);
  });
});

describe('initiative people table', () => {
  it('lists names only in the static snapshot', () => {
    expect(initiativePeopleColumns(true).map((c) => c.key)).toEqual(['dev']);
  });

  it('keeps the counts in the live app', () => {
    expect(initiativePeopleColumns(false).map((c) => c.key)).toEqual(['dev', 'total', 'open', 'done']);
  });
});
