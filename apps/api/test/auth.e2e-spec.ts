/// <reference types="jest" />

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { SystemRole } from '../src/generated/prisma/enums';
import { createTestApp } from './helpers/create-test-app';
import { cleanDatabase } from './helpers/database.helper';

type RegisterResponse = {
  id: string;
  email: string;
  name: string;
  systemRole: SystemRole;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type LoginResponse = {
  user: RegisterResponse;
  accessToken: string;
};

type RefreshResponse = {
  accessToken: string;
};

function getCookiePair(setCookieHeader: unknown, cookieName: string): string {
  if (!Array.isArray(setCookieHeader)) {
    throw new Error('Set-Cookie header is missing');
  }

  const values: unknown[] = setCookieHeader;

  const cookie = values.find(
    (value): value is string =>
      typeof value === 'string' && value.startsWith(`${cookieName}=`),
  );

  if (!cookie) {
    throw new Error(`Cookie ${cookieName} was not returned`);
  }

  const [cookiePair] = cookie.split(';');

  if (!cookiePair) {
    throw new Error(`Cookie ${cookieName} is invalid`);
  }

  return cookiePair;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('registers a new user', async () => {
    const password = 'strong-password';

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'Max@Example.com',
        name: 'Max',
        password,
      })
      .expect(201);

    const body = response.body as RegisterResponse;

    expect(body.email).toBe('max@example.com');
    expect(body.name).toBe('Max');
    expect(body.systemRole).toBe(SystemRole.USER);
    expect(body.emailVerifiedAt).toBeNull();

    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('passwordHash');

    const user = await prisma.user.findUnique({
      where: {
        email: 'max@example.com',
      },
    });

    if (!user) {
      throw new Error('Registered user was not saved');
    }

    expect(user.email).toBe('max@example.com');
    expect(user.passwordHash).not.toBe(password);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('returns 409 when email is already registered', async () => {
    const registrationData = {
      email: 'max@example.com',
      name: 'Max',
      password: 'strong-password',
    };

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registrationData)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        ...registrationData,
        email: 'MAX@EXAMPLE.COM',
      })
      .expect(409);

    const usersCount = await prisma.user.count({
      where: {
        email: 'max@example.com',
      },
    });

    expect(usersCount).toBe(1);
  });

  it('logs in and creates a refresh session', async () => {
    const registrationData = {
      email: 'max@example.com',
      name: 'Max',
      password: 'strong-password',
    };

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registrationData)
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registrationData.email,
        password: registrationData.password,
      })
      .expect(200);

    const body = response.body as LoginResponse;

    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.user.email).toBe('max@example.com');
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(body).not.toHaveProperty('refreshToken');

    const setCookieHeader: unknown = response.headers['set-cookie'];

    if (
      !Array.isArray(setCookieHeader) ||
      typeof setCookieHeader[0] !== 'string'
    ) {
      throw new Error('Refresh cookie was not returned');
    }

    const refreshCookie = setCookieHeader[0];

    expect(refreshCookie).toContain('refresh_token=');
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('Path=/api/v1/auth');
    expect(refreshCookie).toContain('SameSite=Lax');

    const session = await prisma.session.findFirst({
      where: {
        userId: body.user.id,
      },
    });

    expect(session).not.toBeNull();
    expect(session?.revokedAt).toBeNull();
    expect(session?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(session?.refreshTokenHash).toHaveLength(64);
  });

  it('returns 401 and does not create a session for an invalid password', async () => {
    const registrationData = {
      email: 'max@example.com',
      name: 'Max',
      password: 'strong-password',
    };

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registrationData)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registrationData.email,
        password: 'wrong_password',
      })
      .expect(401);

    const sessionsCount = await prisma.session.count();
    expect(sessionsCount).toBe(0);
  });

  it('returns the current user profile for a valid access token', async () => {
    const registrationData = {
      email: 'max@example.com',
      name: 'Max',
      password: 'strong-password',
    };

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registrationData)
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registrationData.email,
        password: registrationData.password,
      })
      .expect(200);

    const body = loginResponse.body as LoginResponse;

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);

    const profile = response.body as RegisterResponse;

    expect(profile.id).toBe(body.user.id);
    expect(profile.email).toBe(registrationData.email);
    expect(profile.name).toBe(registrationData.name);
    expect(profile.systemRole).toBe(SystemRole.USER);

    expect(profile).not.toHaveProperty('password');
    expect(profile).not.toHaveProperty('passwordHash');
  });

  it('returns 401 when requesting profile without an access token', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('rotates the refresh token and updates the session', async () => {
    const registrationData = {
      email: 'max@example.com',
      name: 'Max',
      password: 'strong-password',
    };

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registrationData)
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registrationData.email,
        password: registrationData.password,
      })
      .expect(200);

    const body = loginResponse.body as LoginResponse;

    const oldRefreshCookie = getCookiePair(
      loginResponse.headers['set-cookie'],
      'refresh_token',
    );

    const session = await prisma.session.findFirst({
      where: {
        userId: body.user.id,
      },
    });
    if (!session) {
      throw new Error('Session not created');
    }

    const oldSessionHash = session.refreshTokenHash;
    const sessionId = session.id;

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldRefreshCookie)
      .expect(200);

    const refreshBody = refreshResponse.body as RefreshResponse;
    expect(refreshBody.accessToken).toEqual(expect.any(String));
    expect(refreshBody.accessToken.length).toBeGreaterThan(0);
    expect(refreshBody).not.toHaveProperty('refreshToken');

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshBody.accessToken}`)
      .expect(200);

    const newRefreshCookie = getCookiePair(
      refreshResponse.headers['set-cookie'],
      'refresh_token',
    );

    expect(newRefreshCookie).not.toBe(oldRefreshCookie);

    const updatedSession = await prisma.session.findUnique({
      where: {
        id: sessionId,
      },
    });

    if (!updatedSession) {
      throw new Error('Session disappeared after refresh token rotation');
    }

    expect(updatedSession.id).toBe(sessionId);
    expect(updatedSession.refreshTokenHash).not.toBe(oldSessionHash);
    expect(updatedSession.refreshTokenHash).toHaveLength(64);
    expect(updatedSession.revokedAt).toBeNull();

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldRefreshCookie)
      .expect(401);
  });

  it('logs out and revokes the current session', async () => {
    const registrationData = {
      email: 'max@example.com',
      name: 'Max',
      password: 'strong-password',
    };

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registrationData)
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registrationData.email,
        password: registrationData.password,
      })
      .expect(200);

    const loginBody = loginResponse.body as LoginResponse;
    const refreshCookie = getCookiePair(
      loginResponse.headers['set-cookie'],
      'refresh_token',
    );

    const sessionBeforeLogout = await prisma.session.findFirst({
      where: {
        userId: loginBody.user.id,
      },
    });

    if (!sessionBeforeLogout) {
      throw new Error('Session was not created during login');
    }

    const logoutResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', refreshCookie)
      .expect(204);

    const clearedCookie = getCookiePair(
      logoutResponse.headers['set-cookie'],
      'refresh_token',
    );

    expect(clearedCookie).toBe('refresh_token=');

    const sessionAfterLogout = await prisma.session.findUnique({
      where: {
        id: sessionBeforeLogout.id,
      },
    });

    if (!sessionAfterLogout) {
      throw new Error('Session disappeared after logout');
    }

    expect(sessionAfterLogout.revokedAt).not.toBeNull();

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(401);
  });

  it('logs out from all user sessions', async () => {
    const registrationData = {
      email: 'max@example.com',
      name: 'Max',
      password: 'strong-password',
    };

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registrationData)
      .expect(201);

    const firstLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registrationData.email,
        password: registrationData.password,
      })
      .expect(200);

    const secondLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registrationData.email,
        password: registrationData.password,
      })
      .expect(200);

    const firstLoginBody = firstLoginResponse.body as LoginResponse;
    const firstRefreshCookie = getCookiePair(
      firstLoginResponse.headers['set-cookie'],
      'refresh_token',
    );
    const secondRefreshCookie = getCookiePair(
      secondLoginResponse.headers['set-cookie'],
      'refresh_token',
    );

    expect(firstRefreshCookie).not.toBe(secondRefreshCookie);

    const sessionsBeforeLogout = await prisma.session.findMany({
      where: {
        userId: firstLoginBody.user.id,
      },
    });

    expect(sessionsBeforeLogout).toHaveLength(2);
    expect(
      sessionsBeforeLogout.every((session) => session.revokedAt === null),
    ).toBe(true);

    const logoutResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${firstLoginBody.accessToken}`)
      .set('Cookie', firstRefreshCookie)
      .expect(204);

    const clearedCookie = getCookiePair(
      logoutResponse.headers['set-cookie'],
      'refresh_token',
    );

    expect(clearedCookie).toBe('refresh_token=');

    const sessionsAfterLogout = await prisma.session.findMany({
      where: {
        userId: firstLoginBody.user.id,
      },
    });

    expect(sessionsAfterLogout).toHaveLength(2);
    expect(
      sessionsAfterLogout.every((session) => session.revokedAt !== null),
    ).toBe(true);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstRefreshCookie)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', secondRefreshCookie)
      .expect(401);
  });

  it('returns 401 when logging out from all sessions without an access token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .expect(401);
  });
});
