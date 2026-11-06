// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Section } from '../../src/components/ui/Section';

const KEY = 'devboard.demo.sections';

function toggle(details: HTMLDetailsElement, open: boolean) {
  details.open = open;
  fireEvent(details, new Event('toggle'));
}

describe('Section', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders a collapsible card with title, count badge, chevron and note', () => {
    const { container } = render(
      <Section pageKey="demo" id="list" title="Items" count={7} note="Only active ones.">
        <p>body</p>
      </Section>,
    );
    const d = container.querySelector('details.card.cr-sec')!;
    expect(d.querySelector('summary h3')!.textContent).toBe('Items');
    expect(d.querySelector('summary .count')!.textContent).toBe('7');
    expect(d.querySelector('summary .chev')).toBeTruthy();
    expect(d.querySelector('.cr-sec-body .q')!.textContent).toBe('Only active ones.');
    expect(d.querySelector('.cr-sec-body .q svg.info-ico')).toBeTruthy();
    expect((d as HTMLDetailsElement).open).toBe(true);
  });

  it('omits the badge when there is no count', () => {
    const { container } = render(
      <Section pageKey="demo" id="x" title="X">
        <p />
      </Section>,
    );
    expect(container.querySelector('.count')).toBeNull();
  });

  it('honours defaultOpen=false and does not write storage on mount', () => {
    const { container } = render(
      <Section pageKey="demo" id="list" title="Items" defaultOpen={false}>
        <p />
      </Section>,
    );
    expect(container.querySelector('details')!.open).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('opens by default from a min width (matchMedia)', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(min-width: 1280px)', media: q }));
    const { container } = render(
      <Section pageKey="demo" id="wide" title="Wide" defaultOpen={false} defaultOpenMinWidth={1280}>
        <p />
      </Section>,
    );
    expect(container.querySelector('details')!.open).toBe(true);
  });

  it('stays closed below the min width', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
    const { container } = render(
      <Section pageKey="demo" id="wide" title="Wide" defaultOpenMinWidth={1280}>
        <p />
      </Section>,
    );
    expect(container.querySelector('details')!.open).toBe(false);
  });

  it('persists toggles per page key, merging with other sections', () => {
    localStorage.setItem(KEY, JSON.stringify({ other: true }));
    const { container } = render(
      <Section pageKey="demo" id="list" title="Items">
        <p />
      </Section>,
    );
    toggle(container.querySelector('details')!, false);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ other: true, list: false });
  });

  it('stored state wins over defaults and ignores corrupt values', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: false, b: 'yes' }));
    const { container } = render(
      <>
        <Section pageKey="demo" id="a" title="A">
          <p />
        </Section>
        <Section pageKey="demo" id="b" title="B" defaultOpen={false}>
          <p />
        </Section>
      </>,
    );
    expect([...container.querySelectorAll('details')].map((d) => d.open)).toEqual([false, false]);
  });

  it('survives unparsable storage', () => {
    localStorage.setItem(KEY, '{nope');
    const { container } = render(
      <Section pageKey="demo" id="a" title="A">
        <p />
      </Section>,
    );
    expect(container.querySelector('details')!.open).toBe(true);
  });
});
