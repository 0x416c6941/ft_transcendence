import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, closeTestApp } from './testHelper';

describe('JWT Authentication', () => {
	let app: FastifyInstance;
	let accessToken: string;
	let refreshToken: string;
	let userId: number;

	beforeEach(async () => {
		app = await buildTestApp();

		// Create a test user and login to get tokens
		await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'jwttest',
				password: 'SecurePass123',
				email: 'jwt@example.com',
				display_name: 'JWT Test User'
			}
		});

		const loginResponse = await app.inject({
			method: 'POST',
			url: '/api/users/login',
			payload: {
				username: 'jwttest',
				password: 'SecurePass123'
			}
		});

		const loginBody = JSON.parse(loginResponse.body);
		accessToken = loginBody.accessToken;
		refreshToken = loginBody.refreshToken;
		userId = loginBody.user.id;
	});

	afterEach(async () => {
		await closeTestApp(app);
	});

	describe('Token Generation', () => {
		it('should return access and refresh tokens on successful login', async () => {
			const response = await app.inject({
				method: 'POST',
				url: '/api/users/login',
				payload: {
					username: 'jwttest',
					password: 'SecurePass123'
				}
			});

			expect(response.statusCode).toBe(200);
			const body = JSON.parse(response.body);
			expect(body).toHaveProperty('accessToken');
			expect(body).toHaveProperty('refreshToken');
			expect(body).toHaveProperty('user');
			expect(body.user).toHaveProperty('id');
			expect(body.user).toHaveProperty('username', 'jwttest');
			expect(body.user).not.toHaveProperty('password'); // Password should not be returned
		});
	});

	describe('Token Refresh', () => {
		it('should refresh access token with valid refresh token', async () => {
			const response = await app.inject({
				method: 'POST',
				url: '/api/users/refresh',
				payload: {
					refreshToken: refreshToken
				}
			});

			expect(response.statusCode).toBe(200);
			const body = JSON.parse(response.body);
			expect(body).toHaveProperty('accessToken');
			expect(body).toHaveProperty('refreshToken');
			expect(typeof body.accessToken).toBe('string');
		});

		it('should reject refresh with invalid token', async () => {
			const response = await app.inject({
				method: 'POST',
				url: '/api/users/refresh',
				payload: {
					refreshToken: 'invalid-token'
				}
			});

			expect(response.statusCode).toBe(401);
			const body = JSON.parse(response.body);
			expect(body.error).toContain('Invalid or expired refresh token');
		});

		it('should reject refresh with missing token', async () => {
			const response = await app.inject({
				method: 'POST',
				url: '/api/users/refresh',
				payload: {}
			});

			expect(response.statusCode).toBe(400);
			const body = JSON.parse(response.body);
			expect(body.error).toContain('Refresh token is required');
		});
	});

	describe('Protected Endpoint - PUT /users/:id', () => {
		it('should allow user to update their own profile with valid token', async () => {
			const response = await app.inject({
				method: 'PUT',
				url: `/api/users/${userId}`,
				headers: {
					authorization: `Bearer ${accessToken}`
				},
				payload: {
					display_name: 'Updated Display Name'
				}
			});

			expect(response.statusCode).toBe(200);
			const body = JSON.parse(response.body);
			expect(body).toHaveProperty('id', userId);
			expect(body).toHaveProperty('display_name', 'Updated Display Name');
		});

		it('should reject update without token', async () => {
			const response = await app.inject({
				method: 'PUT',
				url: `/api/users/${userId}`,
				payload: {
					display_name: 'Should Fail'
				}
			});

			expect(response.statusCode).toBe(401);
		});

		it('should reject user trying to update another user profile', async () => {
			// Create another user
			await app.inject({
				method: 'POST',
				url: '/api/users',
				payload: {
					username: 'otheruser',
					password: 'Password123',
					email: 'other@example.com',
					display_name: 'Other User'
				}
			});

			// Login as the other user
			const otherLoginResponse = await app.inject({
				method: 'POST',
				url: '/api/users/login',
				payload: {
					username: 'otheruser',
					password: 'Password123'
				}
			});
			const otherUserId = JSON.parse(otherLoginResponse.body).user.id;

			// Try to update the first user's profile with the first user's token
			const response = await app.inject({
				method: 'PUT',
				url: `/api/users/${otherUserId}`,
				headers: {
					authorization: `Bearer ${accessToken}` // First user's token
				},
				payload: {
					display_name: 'Unauthorized Update'
				}
			});

			expect(response.statusCode).toBe(403);
			const body = JSON.parse(response.body);
			expect(body.error).toContain('Forbidden');
		});
	});

	describe('Protected Endpoint - DELETE /users/:id', () => {
		it('should allow user to delete their own profile with valid token', async () => {
			const response = await app.inject({
				method: 'DELETE',
				url: `/api/users/${userId}`,
				headers: {
					authorization: `Bearer ${accessToken}`
				}
			});

			expect(response.statusCode).toBe(200);
			const body = JSON.parse(response.body);
			expect(body.message).toBe('User deleted successfully');
		});

		it('should reject delete without token', async () => {
			const response = await app.inject({
				method: 'DELETE',
				url: `/api/users/${userId}`
			});

			expect(response.statusCode).toBe(401);
		});

		it('should reject user trying to delete another user profile', async () => {
			// Create another user
			await app.inject({
				method: 'POST',
				url: '/api/users',
				payload: {
					username: 'deleteme',
					password: 'Password123',
					email: 'deleteme@example.com',
					display_name: 'Delete Me'
				}
			});

			// Login as the other user
			const otherLoginResponse = await app.inject({
				method: 'POST',
				url: '/api/users/login',
				payload: {
					username: 'deleteme',
					password: 'Password123'
				}
			});
			const otherUserId = JSON.parse(otherLoginResponse.body).user.id;

			// Try to delete the other user's profile with the first user's token
			const response = await app.inject({
				method: 'DELETE',
				url: `/api/users/${otherUserId}`,
				headers: {
					authorization: `Bearer ${accessToken}` // First user's token
				}
			});

			expect(response.statusCode).toBe(403);
			const body = JSON.parse(response.body);
			expect(body.error).toContain('Forbidden');
		});
	});
});
