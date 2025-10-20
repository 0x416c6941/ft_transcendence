/**
 * @fileoverview Augment the `FastifyInstance` type with our custom decorators.
 */

import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';

/**
 * @interface Oauth42Config
 * 42 OAuth credentials to be augmented to the `FastifyInstance`
 * as part of `OurFastifyConfig`.
 */
interface Oauth42Config {
	/**
	 * @property {string} uid
	 * "Client ID you received from 42 when you registered".
	 */
	uid: string;

	/**
	 * @property {string} secret
	 * "Client secret you received from 42 when you registered".
	 */
	secret: string;
}

/**
 * @interface AvatarPathsConfig
 * Paths to where to store user avatars and also the default avatar,
 * if user didn't provide they own avatar.
 */
interface AvatarPathsConfig {
	/**
	 * @property {string} avatarsPath
	 * Directory where user avatars (and the default avatar) are stored.
	 */
	avatarsPath: string;

	/**
	 * @property {string} defaultAvatarPath
	 * Default avatar to use if user doesn't have custom avatar.
	 */
	defaultAvatarPath: string;
}

/**
 * @interface OurFastifyConfig
 * Config to be augmented to the `FastifyInstance`.
 */
interface OurFastifyConfig {
	oauth42: Oauth42Config;
	avatarsPath: AvatarPathsConfig;
}

declare module 'fastify' {
	export interface FastifyInstance {
		/**
		 * @property {Server} io
		 * Socket.IO instance.
		 */
		io: Server;

		/**
		 * @property {sqlite3.Database} sqlite
		 * SQLite database to work with.
		 */
		sqlite: sqlite3.Database;

		config: OurFastifyConfig;
	}
}
