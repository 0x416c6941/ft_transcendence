/**
 * @fileoverview App configuration - global constant variables.
 */

import RegisterView from "./views/RegisterView.js";
import ProfileView from "./views/ProfileView.js";
import { PathToRegister } from './router.js';
import HomeView from './views/HomeView.js';
import LoginView from './views/LoginView.js';
import ErrorView from './views/ErrorView.js';
import FriendsView from './views/FriendsView.js';
// Pong-related views.
import PongRoomsView from './views/PongRoomsView.js';
import PongTournamentView from './views/PongTournamentView.js';
import PongLocalView from './views/PongLocalView.js';
import PongAIView from './views/PongAIView.js';
import Pong3DAIView from './views/Pong3DAIView.js';
import PongRemoteView from './views/PongRemoteView.js';
// Tetris-related views.
import TetrisView from './views/TetrisView.js';
import TetrisAIView from './views/TetrisAIView.js';
import TetrisRemoteView from './views/TetrisRemoteView.js';
import TetrisRoomsView from './views/TetrisRoomsView.js';
import TetrisTournamentView from './views/TetrisTournamentView.js';
import StatsView from './views/StatsView.js';

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
	{ path: "/login", constructor: LoginView, guard: 'guest' },
	{ path: "/register", constructor: RegisterView, guard: 'guest' },
	{ path: "/profile", constructor: ProfileView, guard: 'auth' },
	// Tournament room functionality
	{ path: '/tournament-room', constructor: PongRoomsView, guard: 'auth' },
	{ path: '/tournament-lobby/:roomId', constructor: PongTournamentView, guard: 'auth' },
	{ path: '/pong-remote/:roomId', constructor: PongRemoteView, guard: 'auth' },
	{ path: '/pong-local', constructor: PongLocalView },
	{ path: '/pong-ai', constructor: PongAIView },
	{ path: '/pong-3d-ai', constructor: Pong3DAIView },
	{ path: '/tetris', constructor: TetrisView },
	{ path: '/tetris-ai', constructor: TetrisAIView },
	{ path: '/tetris-remote', constructor: TetrisRemoteView, guard: 'auth' },
	{ path: '/tetris-tournament-room', constructor: TetrisRoomsView, guard: 'auth' },
	{ path: '/tetris-tournament/:roomId', constructor: TetrisTournamentView, guard: 'auth' },
	{ path: '/error/', constructor: ErrorView },
	{ path: '/friends', constructor: FriendsView, guard: 'auth' },
	{ path: '/stats', constructor: StatsView, guard: 'auth' },
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
