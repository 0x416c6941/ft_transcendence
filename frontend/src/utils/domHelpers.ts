/**
 * DOM Helper Utilities - Safe DOM manipulation to prevent XSS
 * 
 * These utilities provide safe alternatives to innerHTML by using
 * textContent (which auto-escapes HTML) and DOM methods.
 */

/**
 * Safely clear all children from a container
 * Safer than innerHTML = ''
 */
export function clearElement(element: HTMLElement): void {
	element.textContent = '';
}

/**
 * Safely create an element with text content
 * textContent automatically escapes all HTML characters
 */
export function createElementWithText(
	tag: string,
	className: string,
	text: string
): HTMLElement {
	const el = document.createElement(tag);
	if (className) el.className = className;
	el.textContent = text; // SAFE: auto-escapes HTML
	return el;
}

/**
 * Create an element with multiple child elements or text nodes
 */
export function createElementWithChildren(
	tag: string,
	className: string,
	children: (HTMLElement | string)[]
): HTMLElement {
	const el = document.createElement(tag);
	if (className) el.className = className;
	
	children.forEach(child => {
		if (typeof child === 'string') {
			el.appendChild(document.createTextNode(child));
		} else {
			el.appendChild(child);
		}
	});
	
	return el;
}

/**
 * Batch append elements to a container efficiently using DocumentFragment
 */
export function appendChildren(
	container: HTMLElement,
	children: HTMLElement[]
): void {
	const fragment = document.createDocumentFragment();
	children.forEach(child => fragment.appendChild(child));
	container.appendChild(fragment);
}
