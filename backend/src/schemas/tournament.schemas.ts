// Tournament-related JSON schemas for request/response validation

// Base schemas
export const tournamentSchema = {
	$id: 'Tournament',
	type: 'object',
	properties: {
		id: { type: 'integer', description: 'Unique tournament ID' },
		uuid: { type: 'string', format: 'uuid', description: 'UUID for tournament identification' },
		started_at: { type: 'string', format: 'date-time', description: 'When the tournament started' },
		finished_at: { type: ['string', 'null'], format: 'date-time', description: 'When the tournament finished' },
		player_count: { type: 'integer', description: 'Number of players who participated' },
		winner: { type: ['string', 'null'], description: 'Name of the tournament winner' },
		game_type: { type: 'string', description: 'Type of game (e.g., "Pong", "Tetris")' },
		match_count: { type: 'integer', description: 'Number of matches played in the tournament' }
	}
};

export const tournamentDetailsSchema = {
	$id: 'TournamentDetails',
	type: 'object',
	properties: {
		id: { type: 'integer', description: 'Unique tournament ID' },
		uuid: { type: 'string', format: 'uuid', description: 'UUID for tournament identification' },
		started_at: { type: 'string', format: 'date-time', description: 'When the tournament started' },
		finished_at: { type: ['string', 'null'], format: 'date-time', description: 'When the tournament finished' },
		player_count: { type: 'integer', description: 'Number of players who participated' },
		winner: { type: ['string', 'null'], description: 'Name of the tournament winner' },
		game_type: { type: 'string', description: 'Type of game (e.g., "Pong", "Tetris")' },
		games: {
			type: 'array',
			description: 'All games played in this tournament',
			items: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					game_name: { type: 'string' },
					started_at: { type: 'string', format: 'date-time' },
					finished_at: { type: ['string', 'null'], format: 'date-time' },
					player1_name: { type: 'string' },
					player1_is_user: { type: 'boolean' },
					player2_name: { type: 'string' },
					player2_is_user: { type: 'boolean' },
					winner: { type: ['string', 'null'] },
					data: {
						type: ['object', 'null'],
						description: 'Game statistics and metadata (e.g., scores, reason for end)',
						properties: {
							reason: { 
								type: 'string', 
								description: 'How the game ended (e.g., "game_over", "player_left")' 
							},
							forfeit_by: { 
								type: 'string', 
								description: 'Name of player who forfeited (if applicable)' 
							}
						}
					}
				}
			}
		}
	}
};

export const tournamentUuidParamSchema = {
	$id: 'TournamentUuidParam',
	type: 'object',
	required: ['uuid'],
	properties: {
		uuid: { 
			type: 'string', 
			pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
			description: 'Tournament UUID' 
		}
	}
};

export const tournamentsQuerySchema = {
	$id: 'TournamentsQuery',
	type: 'object',
	properties: {
		game: { 
			type: 'string', 
			description: 'Filter by game type (e.g., "Pong", "Tetris")' 
		},
		limit: { 
			type: 'string', 
			pattern: '^[0-9]+$',
			description: 'Maximum number of tournaments to return (default: 50)' 
		}
	}
};

// Route schemas
export const getTournamentsSchema = {
	description: 'Get all tournament records with optional filters',
	tags: ['tournaments'],
	querystring: {
		$ref: 'TournamentsQuery#'
	},
	response: {
		200: {
			description: 'List of tournaments',
			type: 'object',
			properties: {
				tournaments: {
					type: 'array',
					items: {
						$ref: 'Tournament#'
					}
				}
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

export const getTournamentByUuidSchema = {
	description: 'Get detailed tournament information including all matches',
	tags: ['tournaments'],
	params: {
		$ref: 'TournamentUuidParam#'
	},
	response: {
		200: {
			description: 'Tournament details with all games',
			$ref: 'TournamentDetails#'
		},
		404: {
			description: 'Tournament not found',
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
