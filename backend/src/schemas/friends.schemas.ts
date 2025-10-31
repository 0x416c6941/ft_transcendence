/**
 * @fileoverview JSON Schemas for "/friends" routes validation.
 */

// Request and response schemas.
export const GenericParamUsernameSchema = {
	$id: 'GenericParamUsername',
	type: 'object',
	properties: {
		username: {
			type: 'string',
			description: 'Username to add or remove as a friend'
		}
	},
	required: ['username']
};

export const ErrorResponseSchema = {
	$id: 'ErrorResponse',
	type: 'object',
	properties: {
		error: {
			type: 'string',
			description: 'Error message'
		}
	}
};

// Routes schemas.
export const GetFriendsSchema = {
	description: 'Get all friends',
	tags: ['users', 'friends'],
	security: [{ cookieAuth: [] }],
	response: {
		200: {
			descrption: "IDs of user's friends",
			type: 'object',
			properties: {
				ids: {
					type: 'array',
					items: {
						type: 'integer'
					}
				}
			},
			required: ['ids']
		},
		401: {
			description: "JWT token is valid, however user's been already removed from the system",
			$ref: 'ErrorResponse#'
		},
		500: {
			description: 'Well, some internal server error. What else could be here?',
			$ref: 'ErrorResponse#'
		}
	}
};
