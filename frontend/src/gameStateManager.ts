/**
 * Global Game State Manager
 * Tracks when a user is currently playing in any game (local, remote, AI, tournament).
 * This allows other components like ChatPanel to know when to disable certain features.
 */

type GameStatus = 'idle' | 'playing' | 'tournament';

interface GameStateListener {
	(isInGame: boolean): void;
}

class GameStateManager {
	private isInGame: boolean = false;
	private listeners: Set<GameStateListener> = new Set();
	private gameType: string | null = null;

	/**
	 * Subscribe to game state changes
	 */
	public subscribe(listener: GameStateListener): () => void {
		this.listeners.add(listener);
		// Immediately notify with current state
		listener(this.isInGame);
		// Return unsubscribe function
		return () => this.listeners.delete(listener);
	}

	/**
	 * Set the player as being in a game
	 */
	public setInGame(type: string): void {
		this.isInGame = true;
		this.gameType = type;
		this.notifyListeners();
	}

	/**
	 * Set the player as not in a game
	 */
	public setOutOfGame(): void {
		this.isInGame = false;
		this.gameType = null;
		this.notifyListeners();
	}

	/**
	 * Get current game state
	 */
	public getIsInGame(): boolean {
		return this.isInGame;
	}

	/**
	 * Get current game type
	 */
	public getGameType(): string | null {
		return this.gameType;
	}

	private notifyListeners(): void {
		this.listeners.forEach(listener => listener(this.isInGame));
	}
}

export const gameStateManager = new GameStateManager();
