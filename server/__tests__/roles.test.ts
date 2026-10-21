import { describe, expect, it } from 'vitest';
import { roleFor } from '../roles';

describe('roleFor', () => {
  it('gives admin to the verified admin email, ignoring case', () => {
    expect(roleFor({ email: 'Me@X.com', emailVerified: true }, 'me@x.com')).toBe('admin');
  });
  it('gives user when the admin email is not verified', () => {
    expect(roleFor({ email: 'me@x.com', emailVerified: false }, 'me@x.com')).toBe('user');
  });
  it('gives user to any other email', () => {
    expect(roleFor({ email: 'other@x.com', emailVerified: true }, 'me@x.com')).toBe('user');
  });
  it('gives user when no admin email is configured', () => {
    expect(roleFor({ email: 'me@x.com', emailVerified: true }, undefined)).toBe('user');
    expect(roleFor({ email: 'me@x.com', emailVerified: true }, '')).toBe('user');
  });
});
