/**
 * @fileoverview Custom types used in "/users" routes.
 */

/**
 * @interface SqliteRunResult
 * Type for `run()` result of SQLite,
 * since SQLite doesn't provide type bindings for it.
 */
interface SqliteRunResult {
	/**
	 * @property {any} lastID
	 * ID of the last changed row.
	 * @remarks Information is valid ONLY
	 * 	if the query was a successful INSERT statement.
	 */
	lastID: any;

	/**
	 * @property {number} changes
	 * Amount of changes after the query.
	 * @remarks Information is valid ONLY
	 * 	if the query was a successful UPDATE or DELETE statement.
	 */
	changes: number;
}

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
