/**
 * What the browser holds about a session, and what it deliberately does not.
 */

import {
    setToken,
    getToken,
    clearToken,
    isAuthenticated,
    onSessionChange,
    setUser,
    getUser,
    clearUser,
    clearAuth,
    legacyStorage,
} from '@/shared/utils/token-storage';

beforeEach(() => {
    localStorage.clear();
    clearToken();
});

describe('the access token', () => {
    it('is held in memory, not in storage', () => {
        setToken('an-access-token');

        expect(getToken()).toBe('an-access-token');
        // The whole point: nothing that runs on the page can read it out of
        // storage, because it is not there.
        expect(localStorage.getItem('auth_token')).toBeNull();
    });

    it('does not survive a fresh module state', () => {
        // A reload starts with nothing and asks the server, which it can do
        // because the refresh cookie survives.
        expect(getToken()).toBeNull();
    });

    it('is forgotten on clear', () => {
        setToken('an-access-token');
        clearToken();

        expect(getToken()).toBeNull();
        expect(isAuthenticated()).toBe(false);
    });
});

describe('the refresh token', () => {
    it('is never written to storage by this module', () => {
        setToken('an-access-token');
        setUser({ id: 1 });

        // A refresh token in localStorage is readable by anything that manages
        // to run on the page, and a stolen one is a session that outlives every
        // password the victim changes. It lives in an HttpOnly cookie instead.
        expect(localStorage.getItem('refresh_token')).toBeNull();
    });
});

describe('session listeners', () => {
    it('are told when a session starts and ends', () => {
        const seen: boolean[] = [];
        const stop = onSessionChange((authenticated) => seen.push(authenticated));

        setToken('an-access-token');
        clearToken();
        stop();
        setToken('another-token');

        expect(seen).toEqual([true, false]);
    });
});

describe('user data', () => {
    it('is stored, read back and cleared', () => {
        setUser({ id: 1, email: 'user@example.com' });

        expect(getUser()).toEqual({ id: 1, email: 'user@example.com' });

        clearUser();
        expect(getUser()).toBeNull();
    });

    it('survives unreadable storage without throwing', () => {
        localStorage.setItem('user', 'not json');

        expect(getUser()).toBeNull();
    });
});

describe('the storage left over from the previous scheme', () => {
    it('is readable once, so nobody is signed out by the migration', () => {
        localStorage.setItem('refresh_token', 'an-old-token');

        expect(legacyStorage.refreshToken()).toBe('an-old-token');
    });

    it('is cleared once it has done its job', () => {
        localStorage.setItem('refresh_token', 'an-old-token');
        localStorage.setItem('auth_token', 'an-old-access-token');

        legacyStorage.clear();

        expect(localStorage.getItem('refresh_token')).toBeNull();
        expect(localStorage.getItem('auth_token')).toBeNull();
    });

    it('reports nothing when there is nothing', () => {
        expect(legacyStorage.refreshToken()).toBeNull();
    });
});

describe('clearAuth', () => {
    it('leaves nothing about the session behind', () => {
        setToken('an-access-token');
        setUser({ id: 1 });
        localStorage.setItem('refresh_token', 'an-old-token');

        clearAuth();

        expect(getToken()).toBeNull();
        expect(getUser()).toBeNull();
        expect(localStorage.getItem('refresh_token')).toBeNull();
    });
});
