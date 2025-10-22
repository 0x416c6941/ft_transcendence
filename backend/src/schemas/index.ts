/**
 * Central export for all API schemas
 */

export { userSchemas } from './user.schemas.js';
export * from './game.schemas.js';

// Export all schemas as a single array for easy registration
import { userSchemas } from './user.schemas.js';
import {
	gameSchema,
	createGameRequestSchema,
	updateGameRequestSchema,
	gameIdParamSchema
} from './game.schemas.js';

export const gameSchemas = [
	gameSchema,
	createGameRequestSchema,
	updateGameRequestSchema,
	gameIdParamSchema
];

export const allSchemas = [
	...userSchemas,
	...gameSchemas
];
