// Game-related JSON schemas for request/response validation

// Base schemas
export const gameSchema = {
	$id: 'Game',
	type: 'object',
	properties: {
		id: { type: 'integer', description: 'Unique game ID' },
		started_at: { type: 'string', format: 'date-time', description: 'When the game started' },
		finished_at: { type: ['string', 'null'], format: 'date-time', description: 'When the game finished' },
		player1_name: { type: 'string', description: 'Name/alias of player 1' },
		player1_is_user: { type: 'boolean', description: 'Whether player 1 is a registered user' },
		player2_name: { type: 'string', description: 'Name/alias of player 2' },
		player2_is_user: { type: 'boolean', description: 'Whether player 2 is a registered user' },
		winner: { type: ['string', 'null'], description: 'Name of the winner' },
		data: { type: ['string', 'null'], description: 'JSON string with game statistics' }
	}
};

export const createGameRequestSchema = {
	$id: 'CreateGameRequest',
	type: 'object',
	required: ['player1_name', 'player1_is_user', 'player2_name', 'player2_is_user'],
	properties: {
		started_at: { type: 'string', format: 'date-time', description: 'When the game started (optional, defaults to current timestamp)' },
		finished_at: { type: 'string', format: 'date-time', description: 'When the game finished (optional)' },
		player1_name: { type: 'string', description: 'Name/alias of player 1' },
		player1_is_user: { type: 'boolean', description: 'Whether player 1 is a registered user' },
		player2_name: { type: 'string', description: 'Name/alias of player 2' },
		player2_is_user: { type: 'boolean', description: 'Whether player 2 is a registered user' },
		winner: { type: 'string', description: 'Name of the winner (optional)' },
		data: { type: 'string', description: 'JSON string with game statistics (optional)' }
	}
};

export const updateGameRequestSchema = {
	$id: 'UpdateGameRequest',
	type: 'object',
	properties: {
		finished_at: { type: 'string', format: 'date-time', description: 'When the game finished' },
		player1_name: { type: 'string', description: 'Name/alias of player 1' },
		player1_is_user: { type: 'boolean', description: 'Whether player 1 is a registered user' },
		player2_name: { type: 'string', description: 'Name/alias of player 2' },
		player2_is_user: { type: 'boolean', description: 'Whether player 2 is a registered user' },
		winner: { type: 'string', description: 'Name of the winner' },
		data: { type: 'string', description: 'JSON string with game statistics' }
	}
};

export const gameIdParamSchema = {
	$id: 'GameIdParam',
	type: 'object',
	required: ['id'],
	properties: {
		id: { type: 'string', pattern: '^[0-9]+$', description: 'Game ID' }
	}
};

// Route schemas
export const createGameSchema = {
	description: 'Create a new game record (only gamemaster can create)',
	tags: ['games'],
	security: [{ bearerAuth: [] }],
	body: {
		$ref: 'CreateGameRequest#'
	},
	response: {
		201: {
			description: 'Game record created successfully',
			type: 'object',
			properties: {
				message: { type: 'string' },
				gameId: { type: 'integer' }
			}
		},
		403: {
			description: 'Forbidden - only gamemaster can create game records',
			type: 'object',
			properties: {
				error: { type: 'string' }
			}
		},
		500: {
			description: 'Internal server error',
			type: 'object',
			properties: {
				error: { type: 'string' }
			}
		}
	}
};

export const getAllGamesSchema = {
	description: 'Get all game records (requires authentication)',
	tags: ['games'],
	security: [{ bearerAuth: [] }],
	response: {
		200: {
			description: 'List of all games',
			type: 'array',
			items: {
				$ref: 'Game#'
			}
		},
		500: {
			description: 'Internal server error',
			type: 'object',
			properties: {
				error: { type: 'string' }
			}
		}
	}
};

export const getGameByIdSchema = {
	description: 'Get a single game record by ID (requires authentication)',
	tags: ['games'],
	security: [{ bearerAuth: [] }],
	params: {
		$ref: 'GameIdParam#'
	},
	response: {
		200: {
			description: 'Game found',
			$ref: 'Game#'
		},
		404: {
			description: 'Game not found',
			type: 'object',
			properties: {
				error: { type: 'string' }
			}
		},
		500: {
			description: 'Internal server error',
			type: 'object',
			properties: {
				error: { type: 'string' }
			}
		}
	}
};

export const updateGameSchema = {
	description: 'Update a game record (only admins can update)',
	tags: ['games'],
	security: [{ bearerAuth: [] }],
	params: {
		$ref: 'GameIdParam#'
	},
	body: {
		$ref: 'UpdateGameRequest#'
	},
	response: {
		200: {
			description: 'Game updated successfully',
			type: 'object',
			properties: {
				message: { type: 'string' }
			}
		},
		400: {
			description: 'Bad request - no fields to update',
			type: 'object',
			properties: {
				error: { type: 'string' }
			}
		},
		403: {
			description: 'Forbidden - only admins can update game records',
			type: 'object',
			properties: {
				error: { type: 'string' }
			}
		},
		404: {
			description: 'Game not found',
			type: 'object',
			properties: {
				error: { type: 'string' }
			}
		},
		500: {
			description: 'Internal server error',
			type: 'object',
			properties: {
				error: { type: 'string' }
			}
		}
	}
};

export const deleteGameSchema = {
	description: 'Delete a game record (only admins can delete)',
	tags: ['games'],
	security: [{ bearerAuth: [] }],
	params: {
		$ref: 'GameIdParam#'
	},
	response: {
		200: {
			description: 'Game deleted successfully',
			type: 'object',
			properties: {
				message: { type: 'string' }
			}
		},
		403: {
			description: 'Forbidden - only admins can delete game records',
			type: 'object',
			properties: {
				error: { type: 'string' }
			}
		},
		404: {
			description: 'Game not found',
			type: 'object',
			properties: {
				error: { type: 'string' }
			}
		},
		500: {
			description: 'Internal server error',
			type: 'object',
			properties: {
				error: { type: 'string' }
			}
		}
	}
};
