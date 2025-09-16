/**
 * @interface ViewCssHref
 * A mapping between a view and its corresponding stylesheet.
 */
interface ViewCssHref {
	/**
	 * @property {string}
	 * The name of the view (e.g., "Home", "Posts").
	 */
	view: string;

	/**
	 * @property {string} href
	 * @brief The URL path to the stylesheet for the view.
	 */
	href: string;
}

/**
 * @var {readonly ViewCssHref[]} CSS_HREFS
 * An array of all view-to-stylesheet mappings.
 * Acts as a registry, connecting each view name to its associated CSS file.
 */
export const CSS_HREFS: ViewCssHref[] = [
	{ view: "Home", href: "/assets/styles/main.css" }
] as const;
