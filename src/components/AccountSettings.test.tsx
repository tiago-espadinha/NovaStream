import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthProvider } from '../context/AuthContext';
import { AccountSettings } from './AccountSettings';

const render = () =>
  renderToStaticMarkup(
    <AuthProvider>
      <AccountSettings onClose={() => {}} onDeleted={() => {}} />
    </AuthProvider>,
  );

describe('AccountSettings', () => {
  it('is a labelled modal dialog with change password, sign out and delete sections', () => {
    const html = render();
    expect(html).toMatch(/role="dialog" aria-modal="true" aria-labelledby="account-title"/);
    for (const id of ['account-password-title', 'account-signout-title', 'account-delete-title']) {
      expect(html).toContain(`aria-labelledby="${id}"`);
    }
  });

  it('focuses the current password first and labels both password fields for password managers', () => {
    const html = render();
    expect(html).toMatch(/<input id="account-current-password" type="password"[^>]*autoComplete="current-password"[^>]*data-autofocus="true"/);
    expect(html).toMatch(/<input id="account-new-password" type="password"[^>]*autoComplete="new-password"/);
    expect(html).toMatch(/aria-describedby="account-new-password-hint"/);
  });

  it('asks for confirmation before deleting: no password field or delete action until the user starts', () => {
    const html = render();
    expect(html).toContain('Delete account…');
    expect(html).not.toContain('account-delete-password');
    expect(html).not.toContain('Delete my account');
  });
});
