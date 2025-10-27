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
		$id: 'RefreshTokenRequest',
		type: 'object',
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
		$id: 'MakeOrUnmakeAdminRequest',
		type: 'object',
		required: ['username'],
		properties: {
			username: { type: 'string', description: 'Username of a user to grant or revoke admin privileges of' }
		}
	},
	{
		$id: 'Oauth42CallbackRequest',
		type: 'object',
		required: ['code'],
		properties: {
			code: { type: 'string', description: 'Code from 42 API to exchange for token' },
			state: { type: 'string', description: 'Our JWT token sent back to us, signaling user wants to link 42 account' }
		}
	},
	{
		$id: 'GenericParamIdUserRequest',
		type: 'object',
		required: ['id'],
		properties: {
			id: { type: 'number', description: 'ID of a user' }
		}
	},
	{
		$id: 'ImageResponse',
		type: 'string',
		format: 'binary'
	},
	{
		$id: 'Error',
		type: 'object',
		properties: {
			error: { type: 'string', description: 'Error message' }
		}
	},
	{
		$id: 'MessageResponse',
		type: 'object',
		properties: { message: { type: 'string', description: 'Human-readable message' } }
	},
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
			$ref: 'MessageResponse#'
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
	description: 'Rotate auth cookies using refresh cookie; sets new access and refresh cookies.',
	tags: ['auth'],
	security: [{ cookieAuth: [] }],
	response: {
		200: {
			description: 'New access and refresh cookies set',
			$ref: 'MessageResponse#'
		},
		400: {
			description: 'Missing refresh cookie',
			$ref: 'Error#'
		},
		401: {
			description: 'Invalid or expired refresh cookie',
			$ref: 'Error#'
		}
	}
};

export const logoutSchema = {
	description: 'Clear auth cookies.',
  	tags: ['auth'],
  	security: [],
  	response: {
    		200: { description: 'Logged out', $ref: 'MessageResponse#' }
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
	security: [{ cookieAuth: [] }],
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
	security: [{ cookieAuth: [] }],
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
	description: 'Delete the current user (authentication required)',
	tags: ['users'],
	security: [{ cookieAuth: [] }],
	response: {
		200: {
			description: 'User deleted successfully',
			type: 'object',
			properties: {
				message: { type: 'string' }
			}
		},
		401: {
			description: 'Unauthorized - missing or invalid cookie',
			$ref: 'Error#'
		},
		404: {
			description: 'Not found - User not found',
			$ref: 'Error#'
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};

export const makeAdminSchema = {
	description: 'Grant admin privileges to a user by username',
	tags: ['users'],
	security: [{ cookieAuth: [] }],
	body: {
		$ref: 'MakeOrUnmakeAdminRequest#'
	},
	response: {
		200: {
			description: 'Successfully made user an admin',
			type: 'object',
			properties: {
				message: { type: 'string' }
			}
		},
		403: {
			description: "Forbidden - request sender isn't an admin",
			$ref: 'Error#'
		},
		404: {
			description: "Not found - provided username doesn't exist",
			$ref: 'Error#'
		},
		409: {
			description: 'Conflict - provided username already is an admin',
			$ref: 'Error#'
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};

export const unmakeAdminSchema = {
	description: 'Revoke admin privileges of a user by username',
	tags: ['users'],
	security: [{ cookieAuth: [] }],
	body: {
		$ref: 'MakeOrUnmakeAdminRequest#'
	},
	response: {
		200: {
			description: 'Successfully unmade user an admin',
			type: 'object',
			properties: {
				message: { type: 'string' }
			}
		},
		403: {
			description: "Forbidden - request sender isn't an admin or is trying to revoke admin privileges of themselves",
			$ref: 'Error#'
		},
		404: {
			description: "Not found - provided username doesn't exist",
			$ref: 'Error#'
		},
		409: {
			description: "Conflict - provided username isn't an admin",
			$ref: 'Error#'
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};

export const oauth42Schema = {
	description: 'Link 42 account to a user or log in with previously linked 42 account',
	tags: ['users'],
	response: {
		302: {
			description: 'Redirection to 42 for login'
		},
		403: {
			description: "Forbidden - User session is valid, however user doesn't exist anymore",
			$ref: 'Error#'
		},
		409: {
			description: 'Conflict - user tries to link a 42 account, yet some 42 account is already linked to them',
			$ref: 'Error#'
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};

export const oauth42CallbackSchema = {
	description: 'Exchange 42 code received from 42 API to 42 access token for the user authorization or account linkage',
	tags: ['users'],
	querystring: {
		$ref: 'Oauth42CallbackRequest#'
	},
	response: {
		200: {
			description: 'Successfully exchanged 42 code to 42 access token and processed user request',
			type: 'object',
			properties: {
				message: { type: 'string' }
			}
		},
		403: {
			description: "Forbidden - User session is valid, however user who wants to link 42 account doesn't exist anymore",
			$ref: 'Error#'
		},
		404: {
			description: "Not found - 42 account was used for login, yet isn't linked to any user",
			$ref: 'Error#'
		},
		409: {
			description: 'Conflict - either user has already linked some 42 account, or this 42 account is linked to someone else',
			$ref: 'Error#'
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};

export const oauth42UnlinkSchema = {
	description: 'Unlink 42 account from a user',
	tags: ['users'],
	params: {
		$ref: 'GenericParamIdUserRequest#'
	},
	response: {
		200: {
			description: 'Successfully unlinked 42 account',
			type: 'object',
			properties: {
				message: { type: 'string' }
			}
		},
		403: {
			description: "Forbidden - user requested to unlink 42 account from soneone else, yet they aren't an admin",
			$ref: 'Error#'
		},
		404: {
			description: "Not found - provided user doesn't any 42 account linked",
			$ref: 'Error#'
		},
		409: {
			description: 'Conflict - User session exists, yet user was removed from the system',
			$ref: 'Error#'
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};

export const getUserAvatarSchema = {
	description: 'Get avatar of a user',
	tags: ['users'],
	params: {
		$ref: 'GenericParamIdUserRequest#'
	},
	response: {
		200: {
			description: 'Avatar of a given user (binary image data)',
			type: 'string',
			format: 'binary'
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};

export const updateUserAvatarSchema = {
	description: 'Update avatar of a user',
	tags: ['users'],
	security: [{ cookieAuth: [] }],
	params: {
		$ref: 'GenericParamIdUserRequest#'
	},
	response: {
		200: {
			description: 'Successfully updated avatar',
			type: 'object',
			properties: {
				message: { type: 'string' }
			}
		},
		400: {
			description: 'Bad request - avatar is either not present, or borked image file',
			$ref: 'Error#'
		},
		403: {
			description: 'Forbidden - user tried to update avatar of another user without sufficient privileges',
			$ref: 'Error#'
		},
		404: {
			description: 'Not found - User session is valid, but user was already deleted from the database',
			$ref: 'Error#'
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};

export const resetUserAvatarSchema = {
	description: "Reset user's avatar to a default one",
	tags: ['users'],
	security: [{ cookieAuth: [] }],
	params: {
		$ref: 'GenericParamIdUserRequest#'
	},
	response: {
		200: {
			description: 'Successfully reset avatar',
			type: 'object',
			properties: {
				message: { type: 'string' }
			}
		},
		404: {
			description: 'Not found - User session is valid, yet user was already removed from the system',
			$ref: 'Error#'
		},
		409: {
			description: "Conflict - user doesn't have any custom avatar",
			$ref: 'Error#'
		},
		500: {
			description: 'Internal server error',
			$ref: 'Error#'
		}
	}
};

export const getCurrentUserSchema = {
  description: 'Get the currently authenticated user from the access cookie',
  tags: ['users'],
  security: [{ cookieAuth: [] }],
  response: {
    200: {
      description: 'Current user details',
      type: 'object',
      properties: {
        user: { $ref: 'User#' }
      }
    },
    401: { description: 'Unauthorized', $ref: 'Error#' }
  }
};
