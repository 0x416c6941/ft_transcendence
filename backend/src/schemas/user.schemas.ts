/**
 * User API JSON Schemas
 * These schemas are used for request/response validation and Swagger documentation
 */

export const userSchemas = [
	{
		$id: 'User',
		type: 'object',
		properties: {
			id: { type: 'integer', description: 'User ID' },
			username: { type: 'string', description: 'Unique username' },
			email: { type: 'string', format: 'email', description: 'User email address' },
			display_name: { type: 'string', description: 'Display name' },
			created_at: { type: 'string', format: 'date-time', description: 'Account creation timestamp' }
		}
	},
	{
		$id: 'CreateUserRequest',
		type: 'object',
		required: ['username', 'password', 'email', 'display_name'],
		properties: {
			username: { type: 'string', description: 'Unique username' },
			password: { type: 'string', format: 'password', description: 'User password (will be hashed)' },
			email: { type: 'string', format: 'email', description: 'User email address' },
			display_name: { type: 'string', description: 'Display name' }
		}
	},
	{
		$id: 'UpdateUserRequest',
		type: 'object',
		properties: {
			username: { type: 'string', description: 'Unique username' },
			password: { type: 'string', format: 'password', description: 'User password (will be hashed)' },
			email: { type: 'string', format: 'email', description: 'User email address' },
			display_name: { type: 'string', description: 'Display name' }
		}
	},
	{
		$id: 'LoginRequest',
		type: 'object',
		required: ['username', 'password'],
		properties: {
			username: { type: 'string', description: 'Username' },
			password: { type: 'string', format: 'password', description: 'User password' }
		}
	},
	{
		$id: 'LoginResponse',
		type: 'object',
		properties: {
			message: { type: 'string', description: 'Success message' },
			accessToken: { type: 'string', description: 'JWT access token (expires in 24 hours)' },
			refreshToken: { type: 'string', description: 'JWT refresh token (expires in 7 days)' },
			user: { $ref: 'User#' }
		}
	},
	{
		$id: 'RefreshTokenRequest',
		type: 'object',
		required: ['refreshToken'],
		properties: {
			refreshToken: { type: 'string', description: 'Refresh token to exchange for new tokens' }
		}
	},
	{
		$id: 'RefreshTokenResponse',
		type: 'object',
		properties: {
			accessToken: { type: 'string', description: 'New JWT access token' },
			refreshToken: { type: 'string', description: 'New JWT refresh token' }
		}
	},
	{
		$id: 'Error',
		type: 'object',
		properties: {
			error: { type: 'string', description: 'Error message' }
		}
	}
];
