import AbstractView from "./AbstractView.js";
import Router from "../router.js";
import { APP_NAME } from "../app.config.js";
import { auth } from "../auth.js";
import {
	getOverviewStats,
	getLeaderboard,
	getRecentGames,
	getActivity,
	type OverviewStats,
	type LeaderboardEntry,
	type RecentGame,
	type ActivityData
} from "../api/stats.js";

export default class StatsView extends AbstractView {
	private currentTab: 'overview' | 'leaderboard' | 'recent' | 'activity' = 'overview';
	private selectedGame: string = '';
	private stats: OverviewStats | null = null;
	private leaderboard: LeaderboardEntry[] = [];
	private recentGames: RecentGame[] = [];
	private activityData: ActivityData | null = null;

	constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
		super(router, pathParams, queryParams);
	}

	setDocumentTitle(): void {
		document.title = `${APP_NAME} - Statistics`;
	}

	async getHtml(): Promise<string> {
		return `
			<main class="flex-1 min-h-0 flex flex-col bg-neutral-100 dark:bg-neutral-900 overflow-hidden">
				<div class="container mx-auto p-4 flex flex-col h-full overflow-hidden">
					<div class="flex items-center justify-between mb-6">
						<h1 class="txt-light-dark-sans text-3xl font-bold">📊 Game Statistics</h1>
						<a href="/" data-link class="txt-light-dark-sans text-sm hover:underline">← Back to Home</a>
					</div>

					<!-- Tab Navigation -->
					<div class="flex gap-2 mb-4 border-b border-neutral-300 dark:border-neutral-700">
						<button id="tab-overview" class="tab-btn active px-4 py-2 txt-light-dark-sans font-semibold border-b-2 border-sky-500 transition-colors">
							Overview
						</button>
						<button id="tab-leaderboard" class="tab-btn px-4 py-2 txt-light-dark-sans font-semibold border-b-2 border-transparent hover:border-neutral-400 transition-colors">
							Leaderboard
						</button>
						<button id="tab-recent" class="tab-btn px-4 py-2 txt-light-dark-sans font-semibold border-b-2 border-transparent hover:border-neutral-400 transition-colors">
							Recent Games
						</button>
						<button id="tab-activity" class="tab-btn px-4 py-2 txt-light-dark-sans font-semibold border-b-2 border-transparent hover:border-neutral-400 transition-colors">
							Activity
						</button>
					</div>

					<!-- Game Filter -->
					<div class="mb-4">
						<label class="txt-light-dark-sans text-sm font-medium mr-2">Filter by game:</label>
						<select id="game-filter" class="txt-light-dark-sans bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-1">
							<option value="">All Games</option>
							<option value="pong">Pong</option>
							<option value="tetris">Tetris</option>
						</select>
					</div>

					<!-- Content Area -->
					<div class="flex-1 overflow-auto">
						<!-- Overview Tab -->
						<div id="content-overview" class="tab-content">
							<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
								<div class="stat-card bg-white dark:bg-neutral-800 rounded-lg shadow p-6">
									<div class="text-sm txt-light-dark-sans opacity-70 mb-1">Total Players</div>
									<div id="stat-users" class="text-3xl font-bold txt-light-dark-sans">-</div>
								</div>
								<div class="stat-card bg-white dark:bg-neutral-800 rounded-lg shadow p-6">
									<div class="text-sm txt-light-dark-sans opacity-70 mb-1">Total Games</div>
									<div id="stat-games" class="text-3xl font-bold txt-light-dark-sans">-</div>
								</div>
								<div class="stat-card bg-white dark:bg-neutral-800 rounded-lg shadow p-6">
									<div class="text-sm txt-light-dark-sans opacity-70 mb-1">Games (24h)</div>
									<div id="stat-recent" class="text-3xl font-bold txt-light-dark-sans">-</div>
								</div>
								<div class="stat-card bg-white dark:bg-neutral-800 rounded-lg shadow p-6">
									<div class="text-sm txt-light-dark-sans opacity-70 mb-1">Avg Duration</div>
									<div id="stat-duration" class="text-3xl font-bold txt-light-dark-sans">-</div>
								</div>
							</div>

							<!-- Games by Type Chart -->
							<div class="bg-white dark:bg-neutral-800 rounded-lg shadow p-6">
								<h3 class="txt-light-dark-sans text-xl font-semibold mb-4">Games by Type</h3>
								<div id="games-chart" class="space-y-3">
									<!-- Dynamic content -->
								</div>
							</div>
						</div>

						<!-- Leaderboard Tab -->
						<div id="content-leaderboard" class="tab-content hidden">
							<div class="bg-white dark:bg-neutral-800 rounded-lg shadow overflow-hidden">
								<div class="overflow-x-auto">
									<table class="w-full">
										<thead class="bg-neutral-200 dark:bg-neutral-700">
											<tr>
												<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-600" data-sort="rank">
													Rank
												</th>
												<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-600" data-sort="player">
													Player
												</th>
												<th class="px-4 py-3 text-right txt-light-dark-sans text-sm font-semibold cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-600" data-sort="games">
													Games
												</th>
												<th class="px-4 py-3 text-right txt-light-dark-sans text-sm font-semibold cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-600" data-sort="wins">
													Wins
												</th>
												<th class="px-4 py-3 text-right txt-light-dark-sans text-sm font-semibold cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-600" data-sort="losses">
													Losses
												</th>
												<th class="px-4 py-3 text-right txt-light-dark-sans text-sm font-semibold cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-600" data-sort="winrate">
													Win Rate
												</th>
											</tr>
										</thead>
										<tbody id="leaderboard-body" class="divide-y divide-neutral-200 dark:divide-neutral-700">
											<!-- Dynamic content -->
										</tbody>
									</table>
								</div>
							</div>
						</div>

						<!-- Recent Games Tab -->
						<div id="content-recent" class="tab-content hidden">
							<div class="bg-white dark:bg-neutral-800 rounded-lg shadow overflow-hidden">
								<div class="overflow-x-auto">
									<table class="w-full">
										<thead class="bg-neutral-200 dark:bg-neutral-700">
											<tr>
												<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold">Game</th>
												<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold">Player 1</th>
												<th class="px-4 py-3 text-center txt-light-dark-sans text-sm font-semibold">VS</th>
												<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold">Player 2</th>
												<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold">Winner</th>
												<th class="px-4 py-3 text-right txt-light-dark-sans text-sm font-semibold">Duration</th>
												<th class="px-4 py-3 text-right txt-light-dark-sans text-sm font-semibold">Date</th>
											</tr>
										</thead>
										<tbody id="recent-games-body" class="divide-y divide-neutral-200 dark:divide-neutral-700">
											<!-- Dynamic content -->
										</tbody>
									</table>
								</div>
							</div>
						</div>

						<!-- Activity Tab -->
						<div id="content-activity" class="tab-content hidden">
							<div class="bg-white dark:bg-neutral-800 rounded-lg shadow p-6">
								<div class="flex items-center justify-between mb-4">
									<h3 class="txt-light-dark-sans text-xl font-semibold">Game Activity Over Time</h3>
									<select id="activity-days" class="txt-light-dark-sans bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-1">
										<option value="7">Last 7 Days</option>
										<option value="14">Last 14 Days</option>
										<option value="30">Last 30 Days</option>
										<option value="90">Last 90 Days</option>
									</select>
								</div>
								<div id="activity-chart" class="space-y-2">
									<!-- Dynamic content -->
								</div>
							</div>
						</div>
					</div>

					<div id="error-msg" class="text-red-500 txt-light-dark-sans text-center mt-4" hidden></div>
				</div>
			</main>
		`;
	}

	async setup(): Promise<void> {
		await auth.bootstrap();

		// Setup tab navigation
		const tabButtons = document.querySelectorAll('.tab-btn');
		tabButtons.forEach(btn => {
			btn.addEventListener('click', (e) => {
				const target = e.target as HTMLElement;
				const tabName = target.id.replace('tab-', '') as typeof this.currentTab;
				this.switchTab(tabName);
			});
		});

		// Setup game filter
		const gameFilter = document.getElementById('game-filter') as HTMLSelectElement;
		if (gameFilter) {
			gameFilter.addEventListener('change', () => {
				this.selectedGame = gameFilter.value;
				this.loadCurrentTabData();
			});
		}

		// Setup activity days filter
		const activityDays = document.getElementById('activity-days') as HTMLSelectElement;
		if (activityDays) {
			activityDays.addEventListener('change', () => {
				this.loadActivityData();
			});
		}

		// Setup sorting for leaderboard
		const sortHeaders = document.querySelectorAll('[data-sort]');
		sortHeaders.forEach(header => {
			header.addEventListener('click', (e) => {
				const target = e.target as HTMLElement;
				const sortBy = target.getAttribute('data-sort');
				if (sortBy) {
					this.sortLeaderboard(sortBy);
				}
			});
		});

		// Load initial data
		await this.loadCurrentTabData();
	}

	private async switchTab(tab: typeof this.currentTab): Promise<void> {
		this.currentTab = tab;

		// Update tab buttons
		document.querySelectorAll('.tab-btn').forEach(btn => {
			btn.classList.remove('active', 'border-sky-500');
			btn.classList.add('border-transparent');
		});
		const activeBtn = document.getElementById(`tab-${tab}`);
		if (activeBtn) {
			activeBtn.classList.add('active', 'border-sky-500');
			activeBtn.classList.remove('border-transparent');
		}

		// Show/hide content
		document.querySelectorAll('.tab-content').forEach(content => {
			content.classList.add('hidden');
		});
		const activeContent = document.getElementById(`content-${tab}`);
		if (activeContent) {
			activeContent.classList.remove('hidden');
		}

		// Load data for the tab
		await this.loadCurrentTabData();
	}

	private async loadCurrentTabData(): Promise<void> {
		try {
			switch (this.currentTab) {
				case 'overview':
					await this.loadOverview();
					break;
				case 'leaderboard':
					await this.loadLeaderboard();
					break;
				case 'recent':
					await this.loadRecentGames();
					break;
				case 'activity':
					await this.loadActivityData();
					break;
			}
		} catch (err: any) {
			this.showError(err.message || 'Failed to load data');
		}
	}

	private async loadOverview(): Promise<void> {
		this.stats = await getOverviewStats();

		// Update stat cards
		const statUsers = document.getElementById('stat-users');
		const statGames = document.getElementById('stat-games');
		const statRecent = document.getElementById('stat-recent');
		const statDuration = document.getElementById('stat-duration');

		if (statUsers) statUsers.textContent = this.stats.totalUsers.toLocaleString();
		if (statGames) statGames.textContent = this.stats.totalGames.toLocaleString();
		if (statRecent) statRecent.textContent = this.stats.recentGames.toLocaleString();
		if (statDuration) statDuration.textContent = `${this.stats.avgDuration} min`;

		// Render games chart
		this.renderGamesChart();
	}

	private renderGamesChart(): void {
		if (!this.stats) return;

		const chartDiv = document.getElementById('games-chart');
		if (!chartDiv) return;

		const total = this.stats.gamesByType.reduce((sum, g) => sum + g.count, 0);

		chartDiv.innerHTML = this.stats.gamesByType.map(game => {
			const percentage = total > 0 ? (game.count / total * 100).toFixed(1) : 0;
			return `
				<div>
					<div class="flex justify-between txt-light-dark-sans text-sm mb-1">
						<span class="capitalize font-medium">${game.game_name}</span>
						<span>${game.count} games (${percentage}%)</span>
					</div>
					<div class="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-4">
						<div class="bg-sky-500 h-4 rounded-full transition-all" style="width: ${percentage}%"></div>
					</div>
				</div>
			`;
		}).join('');
	}

	private async loadLeaderboard(): Promise<void> {
		const data = await getLeaderboard(this.selectedGame || undefined);
		this.leaderboard = data.leaderboard;
		this.renderLeaderboard();
	}

	private renderLeaderboard(): void {
		const tbody = document.getElementById('leaderboard-body');
		if (!tbody) return;

		if (this.leaderboard.length === 0) {
			tbody.innerHTML = `
				<tr>
					<td colspan="6" class="px-4 py-8 text-center txt-light-dark-sans opacity-70">
						No data available
					</td>
				</tr>
			`;
			return;
		}

		tbody.innerHTML = this.leaderboard.map((entry, index) => {
			const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
			return `
				<tr class="hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">
					<td class="px-4 py-3 txt-light-dark-sans">
						<span class="text-lg">${rankEmoji}</span> ${index + 1}
					</td>
					<td class="px-4 py-3 txt-light-dark-sans font-medium">${entry.player_name}</td>
					<td class="px-4 py-3 txt-light-dark-sans text-right">${entry.total_games}</td>
					<td class="px-4 py-3 txt-light-dark-sans text-right text-green-600 dark:text-green-400">${entry.wins}</td>
					<td class="px-4 py-3 txt-light-dark-sans text-right text-red-600 dark:text-red-400">${entry.losses}</td>
					<td class="px-4 py-3 txt-light-dark-sans text-right font-semibold">
						<span class="inline-block px-2 py-1 rounded ${
							entry.win_rate >= 60 ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' :
							entry.win_rate >= 40 ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200' :
							'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
						}">
							${entry.win_rate}%
						</span>
					</td>
				</tr>
			`;
		}).join('');
	}

	private sortLeaderboard(sortBy: string): void {
		const sortMap: { [key: string]: (a: LeaderboardEntry, b: LeaderboardEntry) => number } = {
			rank: (a, b) => this.leaderboard.indexOf(a) - this.leaderboard.indexOf(b),
			player: (a, b) => a.player_name.localeCompare(b.player_name),
			games: (a, b) => b.total_games - a.total_games,
			wins: (a, b) => b.wins - a.wins,
			losses: (a, b) => b.losses - a.losses,
			winrate: (a, b) => b.win_rate - a.win_rate
		};

		if (sortMap[sortBy]) {
			this.leaderboard.sort(sortMap[sortBy]);
			this.renderLeaderboard();
		}
	}

	private async loadRecentGames(): Promise<void> {
		const data = await getRecentGames(50, this.selectedGame || undefined);
		this.recentGames = data.games;
		this.renderRecentGames();
	}

	private renderRecentGames(): void {
		const tbody = document.getElementById('recent-games-body');
		if (!tbody) return;

		if (this.recentGames.length === 0) {
			tbody.innerHTML = `
				<tr>
					<td colspan="7" class="px-4 py-8 text-center txt-light-dark-sans opacity-70">
						No games yet
					</td>
				</tr>
			`;
			return;
		}

		tbody.innerHTML = this.recentGames.map(game => {
			const date = new Date(game.finished_at);
			const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			
			return `
				<tr class="hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">
					<td class="px-4 py-3 txt-light-dark-sans">
						<span class="inline-block px-2 py-1 rounded bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-200 text-sm capitalize">
							${game.game_name}
						</span>
					</td>
					<td class="px-4 py-3 txt-light-dark-sans ${game.winner === game.player1_name ? 'font-bold text-green-600 dark:text-green-400' : ''}">
						${game.player1_name} ${game.player1_is_user ? '👤' : '🤖'}
					</td>
					<td class="px-4 py-3 txt-light-dark-sans text-center opacity-50">vs</td>
					<td class="px-4 py-3 txt-light-dark-sans ${game.winner === game.player2_name ? 'font-bold text-green-600 dark:text-green-400' : ''}">
						${game.player2_name} ${game.player2_is_user ? '👤' : '🤖'}
					</td>
					<td class="px-4 py-3 txt-light-dark-sans font-semibold">
						${game.winner ? '🏆 ' + game.winner : 'Draw'}
					</td>
					<td class="px-4 py-3 txt-light-dark-sans text-right opacity-70">
						${game.duration_minutes} min
					</td>
					<td class="px-4 py-3 txt-light-dark-sans text-right opacity-70 text-sm">
						${formattedDate}
					</td>
				</tr>
			`;
		}).join('');
	}

	private async loadActivityData(): Promise<void> {
		const activityDays = document.getElementById('activity-days') as HTMLSelectElement;
		const days = activityDays ? parseInt(activityDays.value) : 7;
		
		this.activityData = await getActivity(days);
		this.renderActivityChart();
	}

	private renderActivityChart(): void {
		if (!this.activityData) return;

		const chartDiv = document.getElementById('activity-chart');
		if (!chartDiv) return;

		if (this.activityData.activity.length === 0) {
			chartDiv.innerHTML = `
				<div class="text-center txt-light-dark-sans opacity-70 py-8">
					No activity data available
				</div>
			`;
			return;
		}

		const maxGames = Math.max(...this.activityData.activity.map(d => d.games_played), 1);

		chartDiv.innerHTML = this.activityData.activity.map(day => {
			const percentage = (day.games_played / maxGames * 100);
			const date = new Date(day.date);
			const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

			return `
				<div>
					<div class="flex justify-between txt-light-dark-sans text-sm mb-1">
						<span class="font-medium">${formattedDate}</span>
						<span>${day.games_played} ${day.games_played === 1 ? 'game' : 'games'}</span>
					</div>
					<div class="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-6">
						<div class="bg-gradient-to-r from-sky-400 to-sky-600 h-6 rounded-full transition-all flex items-center px-2" 
							 style="width: ${Math.max(percentage, 2)}%">
							${day.games_played > 0 ? `<span class="text-white text-xs font-bold">${day.games_played}</span>` : ''}
						</div>
					</div>
				</div>
			`;
		}).join('');
	}

	private showError(message: string): void {
		const errorMsg = document.getElementById('error-msg');
		if (errorMsg) {
			errorMsg.textContent = message;
			errorMsg.hidden = false;
			setTimeout(() => {
				errorMsg.hidden = true;
			}, 5000);
		}
	}

	cleanup(): void {
		// Clean up event listeners if needed
	}
}
