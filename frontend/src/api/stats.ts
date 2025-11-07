// API functions for stats endpoints

const BASE_URL = 'https://localhost/api';

export interface OverviewStats {
	totalUsers: number;
	totalGames: number;
	gamesByType: { game_name: string; count: number }[];
	recentGames: number;
	avgDuration: number;
}

export interface LeaderboardEntry {
	player_name: string;
	total_games: number;
	wins: number;
	losses: number;
	win_rate: number;
}

export interface RecentGame {
	id: number;
	game_name: string;
	started_at: string;
	finished_at: string;
	player1_name: string;
	player1_is_user: boolean;
	player2_name: string;
	player2_is_user: boolean;
	winner: string;
	duration_minutes: number;
}

export interface PlayerStats {
	username: string;
	total_games: number;
	wins: number;
	losses: number;
	win_rate: number;
	statsByGame: {
		game_name: string;
		games_played: number;
		wins: number;
		win_rate: number;
	}[];
}

export interface ActivityData {
	activity: { date: string; games_played: number }[];
	days: number;
}

export async function getOverviewStats(game?: string): Promise<OverviewStats> {
	const params = new URLSearchParams();
	if (game) params.append('game', game);

	const url = `${BASE_URL}/stats/overview${params.toString() ? '?' + params : ''}`;
	const response = await fetch(url, {
		method: 'GET',
		credentials: 'include'
	});

	if (!response.ok) {
		throw new Error('Failed to fetch overview stats');
	}

	return response.json();
}

export async function getLeaderboard(game?: string, limit: number = 50): Promise<{ leaderboard: LeaderboardEntry[] }> {
	const params = new URLSearchParams();
	if (game) params.append('game', game);
	params.append('limit', limit.toString());

	const response = await fetch(`${BASE_URL}/stats/leaderboard?${params}`, {
		method: 'GET',
		credentials: 'include'
	});

	if (!response.ok) {
		throw new Error('Failed to fetch leaderboard');
	}

	return response.json();
}

export async function getRecentGames(limit: number = 20, game?: string): Promise<{ games: RecentGame[] }> {
	const params = new URLSearchParams();
	params.append('limit', limit.toString());
	if (game) params.append('game', game);

	const response = await fetch(`${BASE_URL}/stats/recent-games?${params}`, {
		method: 'GET',
		credentials: 'include'
	});

	if (!response.ok) {
		throw new Error('Failed to fetch recent games');
	}

	return response.json();
}

export async function getPlayerStats(username: string): Promise<PlayerStats> {
	const response = await fetch(`${BASE_URL}/stats/player/${encodeURIComponent(username)}`, {
		method: 'GET',
		credentials: 'include'
	});

	if (!response.ok) {
		if (response.status === 404) {
			throw new Error('Player not found');
		}
		throw new Error('Failed to fetch player stats');
	}

	return response.json();
}

export async function getActivity(days: number = 7): Promise<ActivityData> {
	const response = await fetch(`${BASE_URL}/stats/activity?days=${days}`, {
		method: 'GET',
		credentials: 'include'
	});

	if (!response.ok) {
		throw new Error('Failed to fetch activity data');
	}

	return response.json();
}
