/**
 * @fileoverview App configuration - global constant variables.
 */

/**
 * @var {readonly string} RESERVED_42_USERNAME_PREFIX
 * We need to reserve some username prefix for users created with 42 OAuth
 * in order to prevent possible collisions and try to ensure successful user creation.
 * @remarks	42 OAuth account may still not be created if user's email
 * 		is already taken.
 */
export const RESERVED_42_USERNAME_PREFIX: string = '42_';

/**
 * @var {readonly string} RESERVED_42_DISPLAY_NAME_PREFIX
 * We need to reserve some display name prefix for users created with 42 OAuth
 * in order to prevent possible collisions and try to ensure successful user creation.
 * @remarks	42 OAuth account may still not be created if user's email
 * 		is already taken.
 */
export const RESERVED_42_DISPLAY_NAME_PREFIX: string = '42_';

/**
 * @var {readonly number} AVATAR_IMAGE_SIZE_LIMIT
 * Maximum allowed size of custom user avatars in bytes.
 */
export const AVATAR_IMAGE_SIZE_LIMIT: number = 5242880;	// 5 MiB.
