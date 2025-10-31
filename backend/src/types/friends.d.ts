/**
 * @fileoverview Custom types used in "/friends" routes.
 */

/**
 * @interface FriendsDbRecord
 * JS/TS interface of a record from "friends" DB table.
 */
interface FriendsDbRecord {
	/**
	 * @property {number} adder_id
	 * Who added `added_id` as their friend.
	 * Subject.
	 */
	adder_id: number;

	/**
	 * @property {number} added_id
	 * Who was added by `adder_id` as a friend.
	 * Object.
	 */
	added_id: number;

	/**
	 * @property {string} created_at
	 * Date and time (SQL "DATETIME" type)
	 * when `added_id` added `adder_id` as their friend.
	 */
	created_at: string;
}

interface UsernameParams {
	username: string;
}
