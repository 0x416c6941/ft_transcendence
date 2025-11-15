/**
 * Central export for all API schemas
 */

export { userSchemas } from './user.schemas.js';
export * from './game.schemas.js';
export * from './friends.schemas.js';
export * from './tournament.schemas.js';

// Export all schemas as a single array for easy registration
import { userSchemas } from './user.schemas.js';
import {
	gameSchema,
	updateGameRequestSchema,
	gameIdParamSchema
} from './game.schemas.js';
import {
	GenericParamUsernameSchema,
	ErrorResponseSchema
} from './friends.schemas.js';
import {
	tournamentSchema,
	tournamentDetailsSchema,
	tournamentUuidParamSchema,
	tournamentsQuerySchema
} from './tournament.schemas.js';

export const gameSchemas = [
	gameSchema,
	updateGameRequestSchema,
	gameIdParamSchema
];

export const friendsSchemas = [
	GenericParamUsernameSchema,
	ErrorResponseSchema
];

export const tournamentSchemas = [
	tournamentSchema,
	tournamentDetailsSchema,
	tournamentUuidParamSchema,
	tournamentsQuerySchema
];

export const allSchemas = [
	...userSchemas,
	...gameSchemas,
	...friendsSchemas,
	...tournamentSchemas
];
