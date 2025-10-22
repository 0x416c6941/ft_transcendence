/**
 * @fileoverview App configuration - global constant variables.
 */

import RegisterView from "./views/RegisterView.js";
import ProfileView from "./views/ProfileView.js";
import { PathToRegister } from './router.js';
import HomeView from './views/HomeView.js';
import LoginView from './views/LoginView.js';
// Pong-related views.
import PongView from './views/PongView.js';
import CreateRoomView from './views/CreateRoomView.js';
import JoinRoomView from './views/JoinRoomView.js';
import PongLocalView from './views/PongLocalView.js';
// Tetris-related views.
import TetrisView from './views/TetrisView.js';
import TetrisAIView from './views/TetrisAIView.js';
import TetrisRemoteView from './views/TetrisRemoteView.js';

/**
 * @var {readonly string} DIV_ID
 * ID of `div` to draw our SPA on.
 */
export const DIV_ID: string = "app";

/**
 * @var {readonly PathToRegister[]} PATHS_TO_ROUTE
 * Paths and their views' constructors to handle for our router to.
 */
export const PATHS_TO_ROUTE: PathToRegister[] = [
	{ path: "/", constructor: HomeView },
	{ path: "/pong", constructor: PongView },
	{ path: "/login", constructor: LoginView, guard: 'guest' },
	{ path: "/register", constructor: RegisterView, guard: 'guest' },
	{ path: "/profile", constructor: ProfileView, guard: 'auth' },
	{ path: '/rooms/new', constructor: CreateRoomView },
	{ path: '/rooms/join', constructor: JoinRoomView },
	{ path: '/pong-local', constructor: PongLocalView },
	{ path: '/tetris', constructor: TetrisView },
	{ path: '/tetris-ai', constructor: TetrisAIView },
	{ path: '/tetris-remote', constructor: TetrisRemoteView }
] as const;

/**
 * @var {readonly string} APP_NAME
 * @brief Application name.
 * @details Used primarily in setting the document's title in views (pages).
 */
export const APP_NAME: string = "ft_transcendence";

/**
 * @var {readonly string} SOCKET_IO_PATH
 * On which path to send the connection request on Socket.IO.
 */
// export const SOCKET_IO_PATH: string = '/api/socket.io/';
