// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Tag } from '../src/components/Tag';

describe('Tag colours come from the shared status mapping', () => {
  afterEach(() => cleanup());
  const GREY = ['rgb(100, 116, 139)', 'rgb(107, 114, 128)', 'rgb(156, 163, 175)'];
  const bg = (el: Element) => (el as HTMLElement).style.background;

  it('Spanish PR states are no longer grey', () => {
    const { container } = render(
      <>
        <Tag value="mergeada" />
        <Tag value="abierta" />
      </>,
    );
    const [merged, open] = [...container.querySelectorAll('.tag')];
    expect(GREY).not.toContain(bg(merged!));
    expect(bg(merged!)).toBe('rgb(22, 163, 74)');
    expect(bg(open!)).toBe('rgb(37, 99, 235)');
  });

  it('raw Jira statuses get a semantic colour', () => {
    const { container } = render(
      <>
        <Tag value="Finalizada" />
        <Tag value="En curso" />
        <Tag value="Bloqueada" />
      </>,
    );
    expect([...container.querySelectorAll('.tag')].map(bg)).toEqual(['rgb(22, 163, 74)', 'rgb(37, 99, 235)', 'rgb(214, 69, 69)']);
  });

  it('keeps existing macro colours and label', () => {
    const { container } = render(<Tag value="entregada" label="Done" />);
    const t = container.querySelector('.tag')!;
    expect(bg(t)).toBe('rgb(14, 165, 233)');
    expect(t.textContent).toBe('Done');
  });
});
