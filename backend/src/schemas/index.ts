/**
 * Central export for all API schemas
 */

export { userSchemas } from './user.schemas.js';

// Export all schemas as a single array for easy registration
import { userSchemas } from './user.schemas.js';

export const allSchemas = [
	...userSchemas
];
