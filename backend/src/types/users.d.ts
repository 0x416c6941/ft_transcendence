/**
 * @fileoverview Custom types used in "/users" routes.
 */

interface CreateUserBody {
	username: string;
	password: string;
	email: string;
	display_name: string;
}

interface UpdateUserBody {
	username?: string;
	password?: string;
	email?: string;
	display_name?: string;
}

interface LoginBody {
	username: string;
	password: string;
}

interface UserParams {
	id: string;
}

interface MakeOrUnmakeAdminBody {
	username: string;
}

interface Oauth42CallbackQuerystring {
	/**
	 * @property {string} code
	 * Code to exchange for 42 access token.
	 */
	code: string;

	/**
	 * @property {string | undefined} state
	 * If present, contains JWT for account linking.
	 */
	state?: string;
}
