/**
 * Utility functions for game input handling
 * Ensures game keyboard listeners don't interfere with UI input elements like chat
 */

/**
 * Check if the active element is an input/textarea that should capture keyboard events
 * Returns true if the event should NOT be processed by the game
 */
export function isUIInputFocused(): boolean {
	const activeElement = document.activeElement;
	
	if (!activeElement) return false;
	
	// Check if active element is an input or textarea
	if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
		return true;
	}
	
	// Check if it's a contenteditable element
	if ((activeElement as HTMLElement).contentEditable === 'true') {
		return true;
	}
	
	return false;
}

/**
 * Check if the chat panel is visible and open
 */
export function isChatPanelOpen(): boolean {
	const chatPanel = document.getElementById('chat-panel');
	if (!chatPanel) return false;
	
	const transform = window.getComputedStyle(chatPanel).transform;
	// If transform is "none" or contains translateX(0), the panel is open
	return transform === 'none' || !transform.includes('translateX(100%)');
}
