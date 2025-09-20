/**
 * @fileoverview App configuration - global constant variables.
 */

import { PathToRegister } from './router.js';

/**
 * @var {string} DIV_ID
 * ID of `div` to draw our SPA on.
 */
export const DIV_ID: string = 'app';

/**
 * @var {readonly PathToRegister[]} PATHS_TO_ROUTE
 * Paths and their views' constructors to handle for our router to.
 */
export const PATHS_TO_ROUTE: PathToRegister[] = [
] as const;

/**
 * @var {string} APP_NAME
 * @brief Application name.
 * @details Used primarily in setting the document's title in views (pages).
 */
export const APP_NAME: string = 'ft_transcendence';
