/**
 * @fileoverview App configuration - global constant variables.
 */

import { PathToRegister } from "./router.js";
import HomeView from "./views/HomeView.js";
import LoginView from "./views/LoginView.js";
import PongView from "./views/PongView.js";
import RegisterView from "./views/RegisterView.js";

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
  { path: "/login", constructor: LoginView },
  { path: "/pong", constructor: PongView },
  { path: "/register", constructor: RegisterView },
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
