import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp, closeTestApp } from './testHelper';

describe('User API - Registration', () => {
	let app: FastifyInstance;

	beforeEach(async () => {
		app = await buildTestApp();
	});

	afterEach(async () => {
		await closeTestApp(app);
	});

	it('should create a new user successfully', async () => {
		const response = await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'testuser',
				password: 'SecurePass123',
				email: 'test@example.com',
				display_name: 'Test User'
			}
		});

		expect(response.statusCode).toBe(201);
		const body = JSON.parse(response.body);
		expect(body.message).toBe('User created successfully');
		expect(body.username).toBe('testuser');
	});

	it('should fail to create user with missing fields', async () => {
		const response = await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'testuser',
				password: 'SecurePass123'
				// Missing email and display_name
			}
		});

		expect(response.statusCode).toBe(400);
		const body = JSON.parse(response.body);
		expect(body.error).toContain('Missing required fields');
	});

	it('should fail to create user with duplicate username', async () => {
		// Create first user
		await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'testuser',
				password: 'SecurePass123',
				email: 'test1@example.com',
				display_name: 'Test User 1'
			}
		});

		// Try to create user with same username
		const response = await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'testuser',
				password: 'SecurePass456',
				email: 'test2@example.com',
				display_name: 'Test User 2'
			}
		});

		expect(response.statusCode).toBe(409);
		const body = JSON.parse(response.body);
		expect(body.error).toContain('already exists');
	});

	it('should fail to create user with duplicate email', async () => {
		// Create first user
		await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'testuser1',
				password: 'SecurePass123',
				email: 'test@example.com',
				display_name: 'Test User 1'
			}
		});

		// Try to create user with same email
		const response = await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'testuser2',
				password: 'SecurePass456',
				email: 'test@example.com',
				display_name: 'Test User 2'
			}
		});

		expect(response.statusCode).toBe(409);
		const body = JSON.parse(response.body);
		expect(body.error).toContain('already exists');
	});

	it('should hash the password before storing', async () => {
		const plainPassword = 'SecurePass123';
		
		await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'testuser',
				password: plainPassword,
				email: 'test@example.com',
				display_name: 'Test User'
			}
		});

		// Query database directly to check password is hashed
		const user = await new Promise<any>((resolve, reject) => {
			(app as any).sqlite.get(
				'SELECT password FROM users WHERE username = ?',
				['testuser'],
				(err: Error | null, row: any) => {
					if (err) reject(err);
					else resolve(row);
				}
			);
		});

		// Password should not be stored in plain text
		expect(user.password).not.toBe(plainPassword);
		// Bcrypt hashes start with $2b$
		expect(user.password).toMatch(/^\$2b\$/);
	});
});

describe('User API - Login', () => {
	let app: FastifyInstance;

	beforeEach(async () => {
		app = await buildTestApp();
		
		// Create a test user
		await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'testuser',
				password: 'SecurePass123',
				email: 'test@example.com',
				display_name: 'Test User'
			}
		});
	});

	afterEach(async () => {
		await closeTestApp(app);
	});

	it('should login successfully with correct credentials', async () => {
		const response = await app.inject({
			method: 'POST',
			url: '/api/users/login',
			payload: {
				username: 'testuser',
				password: 'SecurePass123'
			}
		});

		expect(response.statusCode).toBe(200);
		const body = JSON.parse(response.body);
		expect(body.message).toBe('Login successful');
		expect(body.user).toBeDefined();
		expect(body.user.username).toBe('testuser');
		expect(body.user.email).toBe('test@example.com');
		expect(body.user.display_name).toBe('Test User');
		expect(body.user.password).toBeUndefined(); // Password should not be returned
	});

	it('should fail login with incorrect password', async () => {
		const response = await app.inject({
			method: 'POST',
			url: '/api/users/login',
			payload: {
				username: 'testuser',
				password: 'WrongPassword'
			}
		});

		expect(response.statusCode).toBe(401);
		const body = JSON.parse(response.body);
		expect(body.error).toContain('Invalid username or password');
	});

	it('should fail login with non-existent username', async () => {
		const response = await app.inject({
			method: 'POST',
			url: '/api/users/login',
			payload: {
				username: 'nonexistent',
				password: 'SecurePass123'
			}
		});

		expect(response.statusCode).toBe(401);
		const body = JSON.parse(response.body);
		expect(body.error).toContain('Invalid username or password');
	});

	it('should fail login with missing credentials', async () => {
		const response = await app.inject({
			method: 'POST',
			url: '/api/users/login',
			payload: {
				username: 'testuser'
				// Missing password
			}
		});

		expect(response.statusCode).toBe(400);
		const body = JSON.parse(response.body);
		expect(body.error).toContain('Missing required fields');
	});
});

describe('User API - Get All Users', () => {
	let app: FastifyInstance;

	beforeEach(async () => {
		app = await buildTestApp();
	});

	afterEach(async () => {
		await closeTestApp(app);
	});

	it('should return empty array when no users exist', async () => {
		const response = await app.inject({
			method: 'GET',
			url: '/api/users'
		});

		expect(response.statusCode).toBe(200);
		const body = JSON.parse(response.body);
		expect(body.users).toEqual([]);
	});

	it('should return all users without passwords', async () => {
		// Create multiple users
		await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'user1',
				password: 'Pass123',
				email: 'user1@example.com',
				display_name: 'User One'
			}
		});

		await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'user2',
				password: 'Pass456',
				email: 'user2@example.com',
				display_name: 'User Two'
			}
		});

		const response = await app.inject({
			method: 'GET',
			url: '/api/users'
		});

		expect(response.statusCode).toBe(200);
		const body = JSON.parse(response.body);
		expect(body.users).toHaveLength(2);
		
		// Check passwords are not returned
		body.users.forEach((user: any) => {
			expect(user.password).toBeUndefined();
			expect(user.id).toBeDefined();
			expect(user.username).toBeDefined();
			expect(user.email).toBeDefined();
			expect(user.display_name).toBeDefined();
		});
	});
});

describe('User API - Get User by ID', () => {
	let app: FastifyInstance;
	let userId: number;

	beforeEach(async () => {
		app = await buildTestApp();
		
		// Create a test user
		await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'testuser',
				password: 'SecurePass123',
				email: 'test@example.com',
				display_name: 'Test User'
			}
		});

		// Get the user ID
		const usersResponse = await app.inject({
			method: 'GET',
			url: '/api/users'
		});
		const users = JSON.parse(usersResponse.body).users;
		userId = users[0].id;
	});

	afterEach(async () => {
		await closeTestApp(app);
	});

	it('should return user by valid ID', async () => {
		const response = await app.inject({
			method: 'GET',
			url: `/api/users/${userId}`
		});

		expect(response.statusCode).toBe(200);
		const body = JSON.parse(response.body);
		expect(body.user).toBeDefined();
		expect(body.user.id).toBe(userId);
		expect(body.user.username).toBe('testuser');
		expect(body.user.password).toBeUndefined(); // Password should not be returned
	});

	it('should return 404 for non-existent user ID', async () => {
		const response = await app.inject({
			method: 'GET',
			url: '/api/users/999999'
		});

		expect(response.statusCode).toBe(404);
		const body = JSON.parse(response.body);
		expect(body.error).toContain('User not found');
	});
});

describe('User API - Update User', () => {
	let app: FastifyInstance;
	let userId: number;
	let accessToken: string;

	beforeEach(async () => {
		app = await buildTestApp();
		
		// Create a test user
		await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'testuser',
				password: 'SecurePass123',
				email: 'test@example.com',
				display_name: 'Test User'
			}
		});

		// Login to get access token
		const loginResponse = await app.inject({
			method: 'POST',
			url: '/api/users/login',
			payload: {
				username: 'testuser',
				password: 'SecurePass123'
			}
		});
		const loginBody = JSON.parse(loginResponse.body);
		accessToken = loginBody.accessToken;
		userId = loginBody.user.id;
	});

	afterEach(async () => {
		await closeTestApp(app);
	});

	it('should update user display name', async () => {
		const response = await app.inject({
			method: 'PUT',
			url: `/api/users/${userId}`,
			headers: {
				authorization: `Bearer ${accessToken}`
			},
			payload: {
				display_name: 'Updated Name'
			}
		});

		expect(response.statusCode).toBe(200);
		const body = JSON.parse(response.body);
		expect(body).toHaveProperty('display_name', 'Updated Name');

		// Verify the update
		const getResponse = await app.inject({
			method: 'GET',
			url: `/api/users/${userId}`
		});
		const user = JSON.parse(getResponse.body).user;
		expect(user.display_name).toBe('Updated Name');
	});

	it('should update user password (hashed)', async () => {
		const newPassword = 'NewSecurePass456';
		
		const response = await app.inject({
			method: 'PUT',
			url: `/api/users/${userId}`,
			headers: {
				authorization: `Bearer ${accessToken}`
			},
			payload: {
				password: newPassword
			}
		});

		expect(response.statusCode).toBe(200);

		// Verify login with new password
		const loginResponse = await app.inject({
			method: 'POST',
			url: '/api/users/login',
			payload: {
				username: 'testuser',
				password: newPassword
			}
		});

		expect(loginResponse.statusCode).toBe(200);
	});

	it('should update multiple fields at once', async () => {
		const response = await app.inject({
			method: 'PUT',
			url: `/api/users/${userId}`,
			headers: {
				authorization: `Bearer ${accessToken}`
			},
			payload: {
				username: 'updateduser',
				email: 'updated@example.com',
				display_name: 'Updated User'
			}
		});

		expect(response.statusCode).toBe(200);

		// Verify all updates
		const body = JSON.parse(response.body);
		expect(body.username).toBe('updateduser');
		expect(body.email).toBe('updated@example.com');
		expect(body.display_name).toBe('Updated User');
	});

	it('should fail update with no fields provided', async () => {
		const response = await app.inject({
			method: 'PUT',
			url: `/api/users/${userId}`,
			headers: {
				authorization: `Bearer ${accessToken}`
			},
			payload: {}
		});

		expect(response.statusCode).toBe(400);
		const body = JSON.parse(response.body);
		expect(body.error).toContain('No fields to update');
	});

	it('should fail update for non-existent user', async () => {
		// Try to update a non-existent user with current user's token
		// This should return 403 Forbidden because userId doesn't match the token's userId
		const response = await app.inject({
			method: 'PUT',
			url: '/api/users/999999',
			headers: {
				authorization: `Bearer ${accessToken}`
			},
			payload: {
				display_name: 'Updated Name'
			}
		});

		expect(response.statusCode).toBe(403);
		const body = JSON.parse(response.body);
		expect(body.error).toContain('Forbidden');
	});

	it('should fail update with duplicate username', async () => {
		// Create second user
		await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'user2',
				password: 'Pass123',
				email: 'user2@example.com',
				display_name: 'User Two'
			}
		});

		// Try to update first user with second user's username
		const response = await app.inject({
			method: 'PUT',
			url: `/api/users/${userId}`,
			headers: {
				authorization: `Bearer ${accessToken}`
			},
			payload: {
				username: 'user2'
			}
		});

		expect(response.statusCode).toBe(409);
		const body = JSON.parse(response.body);
		expect(body.error).toContain('already exists');
	});
});

describe('User API - Delete User', () => {
	let app: FastifyInstance;
	let userId: number;
	let accessToken: string;

	beforeEach(async () => {
		app = await buildTestApp();
		
		// Create a test user
		await app.inject({
			method: 'POST',
			url: '/api/users',
			payload: {
				username: 'testuser',
				password: 'SecurePass123',
				email: 'test@example.com',
				display_name: 'Test User'
			}
		});

		// Login to get access token
		const loginResponse = await app.inject({
			method: 'POST',
			url: '/api/users/login',
			payload: {
				username: 'testuser',
				password: 'SecurePass123'
			}
		});
		const loginBody = JSON.parse(loginResponse.body);
		accessToken = loginBody.accessToken;
		userId = loginBody.user.id;
	});

	afterEach(async () => {
		await closeTestApp(app);
	});

	it('should delete user successfully', async () => {
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

		// Verify user is deleted
		const getResponse = await app.inject({
			method: 'GET',
			url: `/api/users/${userId}`
		});
		expect(getResponse.statusCode).toBe(404);
	});

	it('should fail to delete non-existent user', async () => {
		// Try to delete a non-existent user - will fail with 403 because ID doesn't match token
		const response = await app.inject({
			method: 'DELETE',
			url: '/api/users/999999',
			headers: {
				authorization: `Bearer ${accessToken}`
			}
		});

		expect(response.statusCode).toBe(403);
		const body = JSON.parse(response.body);
		expect(body.error).toContain('Forbidden');
	});

	it('should not be able to login after deletion', async () => {
		// Delete the user
		await app.inject({
			method: 'DELETE',
			url: `/api/users/${userId}`,
			headers: {
				authorization: `Bearer ${accessToken}`
			}
		});

		// Try to login
		const loginResponse = await app.inject({
			method: 'POST',
			url: '/api/users/login',
			payload: {
				username: 'testuser',
				password: 'SecurePass123'
			}
		});

		expect(loginResponse.statusCode).toBe(401);
	});
});
