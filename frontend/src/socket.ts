/**
 * @fileoverview Module with the `io` socket variable.
 */

// Define the path directly to avoid circular dependencies
const SOCKET_PATH = '/api/socket.io/';

/**
 * @var {any} io
 * Socket.IO connection to the server.
 * Configured with autoConnect: false - will be connected with auth token in main.ts
 */
export const io: any = (window as any).io(window.location.origin, {
	path: SOCKET_PATH,
	autoConnect: false
});
