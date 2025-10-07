/**
 * User API Schemas
 * Contains both data model schemas (for validation) and route schemas (for Swagger documentation)
 */

// ============================================
// DATA MODEL SCHEMAS (for validation)
// ============================================

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

// ============================================
// ROUTE SCHEMAS (for Swagger documentation)
// ============================================

export const registerUserSchema = {
	description: 'Register a new user account',
	tags: ['users'],
	security: [],
	body: {
		$ref: 'CreateUserRequest#'
	},
	response: {
		201: {
			description: 'User created successfully',
			type: 'object',
			properties: {
				message: { type: 'string' },
				username: { type: 'string' }
			}
		},
		400: {
			description: 'Bad request - missing required fields',
			$ref: 'Error#'
		},
		409: {
			description: 'Conflict - username or email already exists',
			$ref: 'Error#'
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};

export const loginUserSchema = {
	description: 'Authenticate user with username and password',
	tags: ['auth'],
	security: [],
	body: {
		$ref: 'LoginRequest#'
	},
	response: {
		200: {
			description: 'Login successful',
			$ref: 'LoginResponse#'
		},
		400: {
			description: 'Bad request - missing required fields',
			$ref: 'Error#'
		},
		401: {
			description: 'Unauthorized - invalid credentials',
			$ref: 'Error#'
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};

export const refreshTokenSchema = {
	description: 'Refresh access token using refresh token',
	tags: ['auth'],
	security: [],
	body: {
		$ref: 'RefreshTokenRequest#'
	},
	response: {
		200: {
			description: 'New access token generated',
			$ref: 'RefreshTokenResponse#'
		},
		400: {
			description: 'Missing refresh token',
			$ref: 'Error#'
		},
		401: {
			description: 'Invalid or expired refresh token',
			$ref: 'Error#'
		}
	}
};

export const getAllUsersSchema = {
	description: 'Retrieve all users (passwords excluded)',
	tags: ['users'],
	response: {
		200: {
			description: 'List of users',
			type: 'object',
			properties: {
				users: {
					type: 'array',
					items: { $ref: 'User#' }
				}
			}
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};

export const getUserByIdSchema = {
	description: 'Retrieve a specific user by ID (password excluded)',
	tags: ['users'],
	params: {
		type: 'object',
		properties: {
			id: { type: 'integer', description: 'User ID' }
		},
		required: ['id']
	},
	response: {
		200: {
			description: 'User details',
			type: 'object',
			properties: {
				user: { $ref: 'User#' }
			}
		},
		404: {
			description: 'User not found',
			$ref: 'Error#'
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};

export const updateUserSchema = {
	description: 'Update user information (authentication required, can only update own profile)',
	tags: ['users'],
	security: [{ bearerAuth: [] }],
	params: {
		type: 'object',
		properties: {
			id: { type: 'integer', description: 'User ID' }
		},
		required: ['id']
	},
	body: {
		$ref: 'UpdateUserRequest#'
	},
	response: {
		200: {
			description: 'User updated successfully',
			type: 'object',
			properties: {
				message: { type: 'string' }
			}
		},
		400: {
			description: 'Bad request - no fields to update',
			$ref: 'Error#'
		},
		401: {
			description: 'Unauthorized',
			$ref: 'Error#'
		},
		403: {
			description: 'Forbidden - can only update own profile',
			$ref: 'Error#'
		},
		404: {
			description: 'User not found',
			$ref: 'Error#'
		},
		409: {
			description: 'Conflict - username or email already exists',
			$ref: 'Error#'
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};

export const deleteUserSchema = {
	description: 'Delete a user by ID',
	tags: ['users'],
	security: [{ bearerAuth: [] }],
	params: {
		type: 'object',
		properties: {
			id: { type: 'integer', description: 'User ID' }
		},
		required: ['id']
	},
	response: {
		200: {
			description: 'User deleted successfully',
			type: 'object',
			properties: {
				message: { type: 'string' }
			}
		},
		401: {
			description: 'Unauthorized - missing or invalid token',
			$ref: 'Error#'
		},
		403: {
			description: 'Forbidden - cannot delete other users',
			$ref: 'Error#'
		},
		404: {
			description: 'User not found',
			$ref: 'Error#'
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};
