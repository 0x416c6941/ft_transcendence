/**
 * @fileoverview Module with the `io` socket variable.
 */

import { SOCKET_IO_PATH } from './app.config.js';

/**
 * @var {any} io
 * Socket.IO connection to the server.
 */
export const io: any = (window as any).io(window.location.origin, {
	path: SOCKET_IO_PATH
});
