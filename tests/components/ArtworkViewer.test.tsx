// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArtworkViewer } from '../../src/screens/detail/ArtworkViewer';

function viewer() {
  const onClose = vi.fn();
  const view = render(<ArtworkViewer src="https://img/heat.jpg" title="Heat" onClose={onClose} />);
  return { onClose, ...view };
}

describe('ArtworkViewer', () => {
  it('is a labelled dialog on the page body, showing the image with alt text', () => {
    const { container } = viewer();
    const dialog = screen.getByRole('dialog', { name: 'Heat artwork' });
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByRole<HTMLImageElement>('img', { name: 'Heat artwork' }).src).toBe('https://img/heat.jpg');
  });

  it('focuses its close button', () => {
    viewer();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close artwork' }));
  });

  it('closes on any click and on Escape', () => {
    const { onClose } = viewer();
    fireEvent.click(screen.getByRole('img', { name: 'Heat artwork' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close artwork' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
