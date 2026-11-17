// @vitest-environment jsdom
/** Static snapshot hosted inside a bigger site: optional link back to the parent site. */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BackLink } from '../src/components/BackLink';

afterEach(cleanup);

describe('BackLink', () => {
  it('links to the parent site with the given label', () => {
    render(<BackLink url="https://pages.example/site/" label="Parent site" />);
    const a = screen.getByRole('link', { name: '← Parent site' });
    expect(a.getAttribute('href')).toBe('https://pages.example/site/');
  });

  it('falls back to «Volver» without a label', () => {
    render(<BackLink url="../" label="" />);
    expect(screen.getByRole('link', { name: '← Volver' }).getAttribute('href')).toBe('../');
  });

  it('renders nothing without a url', () => {
    const { container } = render(<BackLink url="" label="Parent site" />);
    expect(container.innerHTML).toBe('');
  });
});
