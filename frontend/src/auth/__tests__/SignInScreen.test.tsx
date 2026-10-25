import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CheckingScreen, SignInErrorScreen, SignInScreen } from '../SignInScreen';

const noop = () => {};

describe('sign-in screens', () => {
  it('offers Google sign-in and says why it is needed', () => {
    const html = renderToStaticMarkup(<SignInScreen onSignIn={noop} />);
    expect(html).toContain('Continue with Google');
    expect(html).toContain('generate and download');
    expect(html).not.toContain('disabled=""');
  });

  it('shows a status while checking the session', () => {
    expect(renderToStaticMarkup(<CheckingScreen />)).toContain('role="status"');
  });

  it('shows the failure as an alert with a Retry button', () => {
    const html = renderToStaticMarkup(<SignInErrorScreen onRetry={noop} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Retry');
  });
});
