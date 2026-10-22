import { createGenerationSession } from './generationSession';
import { download, generate } from './client';

export const UNAUTHORIZED_EVENT = 'odd-shadows:unauthorized';

/** Tells the login gate the session is gone; it re-checks and shows the sign-in screen. */
export const notifyUnauthorized = () => window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));

export const newGenerationSession = () => createGenerationSession({ generate, download, onUnauthorized: notifyUnauthorized });
