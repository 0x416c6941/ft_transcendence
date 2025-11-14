import AbstractView from "./AbstractView.js";
import Router from "../router.js";
import { APP_NAME } from "../app.config.js";
import { auth } from "../auth.js";
import {
	getOverviewStats,
	getLeaderboard,
	getRecentGames,
	getActivity,
	getTournaments,
	getTournamentDetails,
	type OverviewStats,
	type LeaderboardEntry,
	type RecentGame,
	type ActivityData,
	type Tournament
} from "../api/stats.js";
import {
	initBlockchain,
	saveTournamentToBlockchain,
	getTournamentFromBlockchain,
	tournamentExistsOnBlockchain
} from "../blockchain.js";

export default class StatsView extends AbstractView {
	private currentTab: 'overview' | 'leaderboard' | 'recent' | 'activity' | 'tournaments' = 'overview';
	private selectedGame: string = '';
	private stats: OverviewStats | null = null;
	private leaderboard: LeaderboardEntry[] = [];
	private filteredLeaderboard: LeaderboardEntry[] = [];
	private recentGames: RecentGame[] = [];
	private filteredRecentGames: RecentGame[] = [];
	private activityData: ActivityData | null = null;
	private tournaments: Tournament[] = [];
	private searchQuery: string = '';
	private caseSensitive: boolean = false;
	private searchTimeout: number | null = null;
	private recentGamesSearchQuery: string = '';
	private recentGamesCaseSensitive: boolean = false;
	private recentGamesSearchTimeout: number | null = null;
	private blockchainReady: boolean = false;
	private tournamentBlockchainStatus: Map<string, boolean> = new Map();

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
						<button id="tab-tournaments" class="tab-btn px-4 py-2 txt-light-dark-sans font-semibold border-b-2 border-transparent hover:border-neutral-400 transition-colors">
							Tournaments
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
						<!-- Search Bar -->
						<div class="mb-4 flex items-center gap-3">
							<div class="flex-1 relative">
								<input 
									type="text" 
									id="player-search" 
									placeholder="Search players..." 
									class="w-full px-4 py-2 pl-10 txt-light-dark-sans bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
								/>
								<svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
								</svg>
							</div>
							<button 
								id="case-toggle" 
								class="px-3 py-2 txt-light-dark-sans text-sm bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2"
								title="Toggle case sensitivity"
							>
								<span class="font-mono font-bold">Aa</span>
								<span id="case-indicator" class="text-xs opacity-70">insensitive</span>
							</button>
						</div>

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
					</div>						<!-- Recent Games Tab -->
					<div id="content-recent" class="tab-content hidden">
						<!-- Search Bar -->
						<div class="mb-4 flex items-center gap-3">
							<div class="flex-1 relative">
								<input 
									type="text" 
									id="games-search" 
									placeholder="Search players in recent games..." 
									class="w-full px-4 py-2 pl-10 txt-light-dark-sans bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
								/>
								<svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
								</svg>
							</div>
							<button 
								id="games-case-toggle" 
								class="px-3 py-2 txt-light-dark-sans text-sm bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2"
								title="Toggle case sensitivity"
							>
								<span class="font-mono font-bold">Aa</span>
								<span id="games-case-indicator" class="text-xs opacity-70">insensitive</span>
							</button>
						</div>

						<div class="bg-white dark:bg-neutral-800 rounded-lg shadow overflow-hidden">
							<div class="overflow-x-auto">
								<table class="w-full">
									<thead class="bg-neutral-200 dark:bg-neutral-700">
										<tr>
											<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-600" data-sort-games="game">
												Game
											</th>
											<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-600" data-sort-games="player1">
												Player 1
											</th>
											<th class="px-4 py-3 text-center txt-light-dark-sans text-sm font-semibold">VS</th>
											<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-600" data-sort-games="player2">
												Player 2
											</th>
											<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-600" data-sort-games="winner">
												Winner
											</th>
											<th class="px-4 py-3 text-right txt-light-dark-sans text-sm font-semibold cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-600" data-sort-games="duration">
												Duration
											</th>
											<th class="px-4 py-3 text-right txt-light-dark-sans text-sm font-semibold cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-600" data-sort-games="date">
												Date
											</th>
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

						<!-- Tournaments Tab -->
						<div id="content-tournaments" class="tab-content hidden">
							<div class="bg-white dark:bg-neutral-800 rounded-lg shadow overflow-hidden">
								<div class="overflow-x-auto">
									<table class="w-full">
										<thead class="bg-neutral-200 dark:bg-neutral-700">
											<tr>
												<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold">Game Type</th>
												<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold">Players</th>
												<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold">Matches</th>
												<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold">Winner</th>
												<th class="px-4 py-3 text-left txt-light-dark-sans text-sm font-semibold">Duration</th>
												<th class="px-4 py-3 text-right txt-light-dark-sans text-sm font-semibold">Date</th>
												<th class="px-4 py-3 text-center txt-light-dark-sans text-sm font-semibold">Details</th>
											</tr>
										</thead>
										<tbody id="tournaments-body" class="divide-y divide-neutral-200 dark:divide-neutral-700">
											<!-- Dynamic content -->
										</tbody>
									</table>
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

		// Initialize blockchain
		this.blockchainReady = await initBlockchain();
		if (this.blockchainReady) {
			console.log('✅ Blockchain initialized');
		} else {
			console.warn('⚠️ Blockchain not available');
		}

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

		// Setup player search
		const playerSearch = document.getElementById('player-search') as HTMLInputElement;
		if (playerSearch) {
			playerSearch.addEventListener('input', (e) => {
				const target = e.target as HTMLInputElement;
				this.searchQuery = target.value;
				this.debouncedSearch();
			});
		}

		// Setup case sensitivity toggle
		const caseToggle = document.getElementById('case-toggle') as HTMLButtonElement;
		if (caseToggle) {
			caseToggle.addEventListener('click', () => {
				this.caseSensitive = !this.caseSensitive;
				this.updateCaseIndicator();
				this.filterLeaderboard();
				this.renderLeaderboard();
			});
		}

		// Setup recent games search
		const gamesSearch = document.getElementById('games-search') as HTMLInputElement;
		if (gamesSearch) {
			gamesSearch.addEventListener('input', (e) => {
				const target = e.target as HTMLInputElement;
				this.recentGamesSearchQuery = target.value;
				this.debouncedGamesSearch();
			});
		}

		// Setup recent games case sensitivity toggle
		const gamesCaseToggle = document.getElementById('games-case-toggle') as HTMLButtonElement;
		if (gamesCaseToggle) {
			gamesCaseToggle.addEventListener('click', () => {
				this.recentGamesCaseSensitive = !this.recentGamesCaseSensitive;
				this.updateGamesCaseIndicator();
				this.filterRecentGames();
				this.renderRecentGames();
			});
		}

		// Setup sorting for recent games
		const sortGamesHeaders = document.querySelectorAll('[data-sort-games]');
		sortGamesHeaders.forEach(header => {
			header.addEventListener('click', (e) => {
				const target = e.target as HTMLElement;
				const sortBy = target.getAttribute('data-sort-games');
				if (sortBy) {
					this.sortRecentGames(sortBy);
				}
			});
		});

		// Load initial data
		await this.loadCurrentTabData();
	}

	private debouncedSearch(): void {
		// Clear existing timeout
		if (this.searchTimeout !== null) {
			window.clearTimeout(this.searchTimeout);
		}

		// Set new timeout (300ms delay)
		this.searchTimeout = window.setTimeout(() => {
			this.filterLeaderboard();
			this.renderLeaderboard();
		}, 300);
	}

	private filterLeaderboard(): void {
		if (!this.searchQuery.trim()) {
			this.filteredLeaderboard = [...this.leaderboard];
			return;
		}

		const query = this.caseSensitive 
			? this.searchQuery 
			: this.searchQuery.toLowerCase();

		this.filteredLeaderboard = this.leaderboard.filter(entry => {
			const playerName = this.caseSensitive 
				? entry.player_name 
				: entry.player_name.toLowerCase();
			
			return playerName.includes(query);
		});
	}

	private updateCaseIndicator(): void {
		const indicator = document.getElementById('case-indicator');
		const toggle = document.getElementById('case-toggle');
		
		if (indicator) {
			indicator.textContent = this.caseSensitive ? 'sensitive' : 'insensitive';
		}
		
		if (toggle) {
			if (this.caseSensitive) {
				toggle.classList.add('ring-2', 'ring-sky-500');
				toggle.classList.remove('border-neutral-300', 'dark:border-neutral-700');
			} else {
				toggle.classList.remove('ring-2', 'ring-sky-500');
				toggle.classList.add('border-neutral-300', 'dark:border-neutral-700');
			}
		}
	}

	private debouncedGamesSearch(): void {
		// Clear existing timeout
		if (this.recentGamesSearchTimeout !== null) {
			window.clearTimeout(this.recentGamesSearchTimeout);
		}

		// Set new timeout (300ms delay)
		this.recentGamesSearchTimeout = window.setTimeout(() => {
			this.filterRecentGames();
			this.renderRecentGames();
		}, 300);
	}

	private filterRecentGames(): void {
		if (!this.recentGamesSearchQuery.trim()) {
			this.filteredRecentGames = [...this.recentGames];
			return;
		}

		const query = this.recentGamesCaseSensitive 
			? this.recentGamesSearchQuery 
			: this.recentGamesSearchQuery.toLowerCase();

		this.filteredRecentGames = this.recentGames.filter(game => {
			const player1 = this.recentGamesCaseSensitive 
				? game.player1_name 
				: game.player1_name.toLowerCase();
			const player2 = this.recentGamesCaseSensitive 
				? game.player2_name 
				: game.player2_name.toLowerCase();
			
			return player1.includes(query) || player2.includes(query);
		});
	}

	private updateGamesCaseIndicator(): void {
		const indicator = document.getElementById('games-case-indicator');
		const toggle = document.getElementById('games-case-toggle');
		
		if (indicator) {
			indicator.textContent = this.recentGamesCaseSensitive ? 'sensitive' : 'insensitive';
		}
		
		if (toggle) {
			if (this.recentGamesCaseSensitive) {
				toggle.classList.add('ring-2', 'ring-sky-500');
				toggle.classList.remove('border-neutral-300', 'dark:border-neutral-700');
			} else {
				toggle.classList.remove('ring-2', 'ring-sky-500');
				toggle.classList.add('border-neutral-300', 'dark:border-neutral-700');
			}
		}
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
				case 'tournaments':
					await this.loadTournaments();
					break;
			}
		} catch (err: any) {
			this.showError(err.message || 'Failed to load data');
		}
	}

	private async loadOverview(): Promise<void> {
		this.stats = await getOverviewStats(this.selectedGame || undefined);

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
		this.filterLeaderboard();
		this.renderLeaderboard();
	}

	private renderLeaderboard(): void {
		const tbody = document.getElementById('leaderboard-body');
		if (!tbody) return;

		const dataToRender = this.filteredLeaderboard.length > 0 || this.searchQuery.trim() 
			? this.filteredLeaderboard 
			: this.leaderboard;

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

		if (this.searchQuery.trim() && dataToRender.length === 0) {
			tbody.innerHTML = `
				<tr>
					<td colspan="6" class="px-4 py-8 text-center txt-light-dark-sans opacity-70">
						No players found matching "${this.searchQuery}"
					</td>
				</tr>
			`;
			return;
		}

		tbody.innerHTML = dataToRender.map((entry, index) => {
			// Use original index from full leaderboard for ranking
			const originalIndex = this.leaderboard.indexOf(entry);
			const rankEmoji = originalIndex === 0 ? '🥇' : originalIndex === 1 ? '🥈' : originalIndex === 2 ? '🥉' : '';
			
			// Highlight matching text
			let displayName = entry.player_name;
			if (this.searchQuery.trim()) {
				const query = this.caseSensitive ? this.searchQuery : this.searchQuery.toLowerCase();
				const name = this.caseSensitive ? entry.player_name : entry.player_name.toLowerCase();
				const matchIndex = name.indexOf(query);
				
				if (matchIndex !== -1) {
					const before = entry.player_name.substring(0, matchIndex);
					const match = entry.player_name.substring(matchIndex, matchIndex + this.searchQuery.length);
					const after = entry.player_name.substring(matchIndex + this.searchQuery.length);
					displayName = `${before}<span class="bg-yellow-200 dark:bg-yellow-700 px-1 rounded">${match}</span>${after}`;
				}
			}
			
			return `
				<tr class="hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">
					<td class="px-4 py-3 txt-light-dark-sans">
						<span class="text-lg">${rankEmoji}</span> ${originalIndex + 1}
					</td>
					<td class="px-4 py-3 txt-light-dark-sans font-medium">${displayName}</td>
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
			this.filterLeaderboard();
			this.renderLeaderboard();
		}
	}

	private async loadRecentGames(): Promise<void> {
		const data = await getRecentGames(50, this.selectedGame || undefined);
		this.recentGames = data.games;
		this.filterRecentGames();
		this.renderRecentGames();
	}

	private sortRecentGames(sortBy: string): void {
		const sortMap: { [key: string]: (a: RecentGame, b: RecentGame) => number } = {
			game: (a, b) => a.game_name.localeCompare(b.game_name),
			player1: (a, b) => a.player1_name.localeCompare(b.player1_name),
			player2: (a, b) => a.player2_name.localeCompare(b.player2_name),
			winner: (a, b) => {
				if (!a.winner && !b.winner) return 0;
				if (!a.winner) return 1;
				if (!b.winner) return -1;
				return a.winner.localeCompare(b.winner);
			},
			duration: (a, b) => b.duration_minutes - a.duration_minutes,
			date: (a, b) => new Date(b.finished_at).getTime() - new Date(a.finished_at).getTime()
		};

		if (sortMap[sortBy]) {
			this.recentGames.sort(sortMap[sortBy]);
			this.filterRecentGames();
			this.renderRecentGames();
		}
	}

	private renderRecentGames(): void {
		const tbody = document.getElementById('recent-games-body');
		if (!tbody) return;

		const dataToRender = this.filteredRecentGames.length > 0 || this.recentGamesSearchQuery.trim() 
			? this.filteredRecentGames 
			: this.recentGames;

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

		if (this.recentGamesSearchQuery.trim() && dataToRender.length === 0) {
			tbody.innerHTML = `
				<tr>
					<td colspan="7" class="px-4 py-8 text-center txt-light-dark-sans opacity-70">
						No games found matching "${this.recentGamesSearchQuery}"
					</td>
				</tr>
			`;
			return;
		}

		tbody.innerHTML = dataToRender.map(game => {
			const date = new Date(game.finished_at);
			const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			
			// Helper function to highlight matching text
			const highlightMatch = (text: string): string => {
				if (!this.recentGamesSearchQuery.trim()) return text;
				
				const query = this.recentGamesCaseSensitive ? this.recentGamesSearchQuery : this.recentGamesSearchQuery.toLowerCase();
				const checkText = this.recentGamesCaseSensitive ? text : text.toLowerCase();
				const matchIndex = checkText.indexOf(query);
				
				if (matchIndex !== -1) {
					const before = text.substring(0, matchIndex);
					const match = text.substring(matchIndex, matchIndex + this.recentGamesSearchQuery.length);
					const after = text.substring(matchIndex + this.recentGamesSearchQuery.length);
					return `${before}<span class="bg-yellow-200 dark:bg-yellow-700 px-1 rounded">${match}</span>${after}`;
				}
				return text;
			};
			
			const player1Display = highlightMatch(game.player1_name);
			const player2Display = highlightMatch(game.player2_name);
			
			return `
				<tr class="hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">
					<td class="px-4 py-3 txt-light-dark-sans">
						<span class="inline-block px-2 py-1 rounded bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-200 text-sm capitalize">
							${game.game_name}
						</span>
					</td>
					<td class="px-4 py-3 txt-light-dark-sans ${game.winner === game.player1_name ? 'font-bold text-green-600 dark:text-green-400' : ''}">
						${player1Display} ${game.player1_is_user ? '👤' : '🤖'}
					</td>
					<td class="px-4 py-3 txt-light-dark-sans text-center opacity-50">vs</td>
					<td class="px-4 py-3 txt-light-dark-sans ${game.winner === game.player2_name ? 'font-bold text-green-600 dark:text-green-400' : ''}">
						${player2Display} ${game.player2_is_user ? '👤' : '🤖'}
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
		
		this.activityData = await getActivity(days, this.selectedGame || undefined);
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

	private async loadTournaments(): Promise<void> {
		const data = await getTournaments(100, this.selectedGame || undefined);
		this.tournaments = data.tournaments;
		
		// Check blockchain status for each tournament
		if (this.blockchainReady) {
			for (const tournament of this.tournaments) {
				const exists = await tournamentExistsOnBlockchain(tournament.uuid);
				this.tournamentBlockchainStatus.set(tournament.uuid, exists);
			}
		}
		
		this.renderTournaments();
	}

	private renderTournaments(): void {
		const tbody = document.getElementById('tournaments-body');
		if (!tbody) return;

		if (this.tournaments.length === 0) {
			tbody.innerHTML = `
				<tr>
					<td colspan="7" class="px-4 py-8 text-center txt-light-dark-sans opacity-70">
						No tournaments yet
					</td>
				</tr>
			`;
			return;
		}

		tbody.innerHTML = this.tournaments.map(tournament => {
			const startDate = new Date(tournament.started_at);
			const formattedStart = startDate.toLocaleDateString() + ' ' + startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			
			let duration = 'In Progress';
			if (tournament.finished_at) {
				const endDate = new Date(tournament.finished_at);
				const durationMs = endDate.getTime() - startDate.getTime();
				const durationMin = Math.round(durationMs / 60000);
				duration = `${durationMin} min`;
			}

			const gameTypeColor = tournament.game_type.toLowerCase() === 'pong' 
				? 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200'
				: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';

			return `
				<tr class="hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">
					<td class="px-4 py-3 txt-light-dark-sans">
						<span class="inline-block px-2 py-1 rounded ${gameTypeColor} text-sm capitalize font-semibold">
							${tournament.game_type}
						</span>
					</td>
					<td class="px-4 py-3 txt-light-dark-sans">
						<span class="font-medium">${tournament.player_count}</span> players
					</td>
					<td class="px-4 py-3 txt-light-dark-sans">
						${tournament.match_count} ${tournament.match_count === 1 ? 'match' : 'matches'}
					</td>
					<td class="px-4 py-3 txt-light-dark-sans">
						${tournament.winner ? `<span class="font-bold text-green-600 dark:text-green-400">🏆 ${tournament.winner}</span>` : '<span class="opacity-50">-</span>'}
					</td>
					<td class="px-4 py-3 txt-light-dark-sans opacity-70">
						${duration}
					</td>
					<td class="px-4 py-3 txt-light-dark-sans text-right opacity-70 text-sm">
						${formattedStart}
					</td>
					<td class="px-4 py-3 text-center">
						<button 
							data-tournament-uuid="${tournament.uuid}"
							class="blockchain-btn ${this.tournamentBlockchainStatus.get(tournament.uuid) ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} text-white px-3 py-1 rounded text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							${!this.blockchainReady ? 'disabled' : ''}
						>
							${this.tournamentBlockchainStatus.get(tournament.uuid) ? 'Get from Blockchain' : 'Save to Blockchain'}
						</button>
					</td>
				</tr>
			`;
		}).join('');

		// Add event listeners to all blockchain buttons
		const blockchainButtons = document.querySelectorAll('.blockchain-btn');
		blockchainButtons.forEach(button => {
			button.addEventListener('click', async (e) => {
				const target = e.target as HTMLElement;
				const uuid = target.getAttribute('data-tournament-uuid');
				if (uuid) {
					await this.handleBlockchainAction(uuid, target);
				}
			});
		});
	}

	private async handleBlockchainAction(uuid: string, button: HTMLElement): Promise<void> {
		const existsOnChain = this.tournamentBlockchainStatus.get(uuid);
		
		try {
			button.setAttribute('disabled', 'true');
			button.textContent = existsOnChain ? 'Loading...' : 'Saving...';
			
			if (existsOnChain) {
				// Get from blockchain
				const data = await getTournamentFromBlockchain(uuid);
				this.showTournamentOverlay(uuid, data);
				button.textContent = 'Get from Blockchain';
			} else {
				// Save to blockchain
				const tournamentDetails = await getTournamentDetails(uuid);
				await saveTournamentToBlockchain(uuid, tournamentDetails);
				
				// Update status
				this.tournamentBlockchainStatus.set(uuid, true);
				button.classList.remove('bg-blue-600', 'hover:bg-blue-700');
				button.classList.add('bg-green-600', 'hover:bg-green-700');
				button.textContent = 'Get from Blockchain';
			}
		} catch (err: any) {
			this.showError(err.message || 'Blockchain operation failed');
			button.textContent = existsOnChain ? 'Get from Blockchain' : 'Save to Blockchain';
		} finally {
			button.removeAttribute('disabled');
		}
	}

	private showTournamentOverlay(uuid: string, data: any): void {
		// Create overlay
		const overlay = document.createElement('div');
		overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
		overlay.innerHTML = `
			<div class="bg-white dark:bg-neutral-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
				<div class="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
					<h3 class="txt-light-dark-sans text-xl font-bold">🏆 Tournament Data (from Blockchain)</h3>
					<button class="close-overlay text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
						</svg>
					</button>
				</div>
				<div class="p-4 overflow-auto flex-1">
					<pre class="txt-light-dark-sans text-sm bg-neutral-100 dark:bg-neutral-900 p-4 rounded overflow-x-auto">${JSON.stringify(data, null, 2)}</pre>
				</div>
				<div class="p-4 border-t border-neutral-200 dark:border-neutral-700 flex justify-end gap-2">
					<button class="copy-json bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded font-semibold transition-colors">
						Copy JSON
					</button>
					<button class="close-overlay bg-neutral-500 hover:bg-neutral-600 text-white px-4 py-2 rounded font-semibold transition-colors">
						Close
					</button>
				</div>
			</div>
		`;
		
		document.body.appendChild(overlay);
		
		// Add event listeners
		overlay.querySelectorAll('.close-overlay').forEach(btn => {
			btn.addEventListener('click', () => overlay.remove());
		});
		
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) {
				overlay.remove();
			}
		});
		
		const copyBtn = overlay.querySelector('.copy-json');
		if (copyBtn) {
			copyBtn.addEventListener('click', () => {
				navigator.clipboard.writeText(JSON.stringify(data, null, 2));
				copyBtn.textContent = '✓ Copied!';
				setTimeout(() => {
					copyBtn.textContent = 'Copy JSON';
				}, 2000);
			});
		}
	}

	private async printTournamentJSON(uuid: string): Promise<void> {
		try {
			const tournamentDetails = await getTournamentDetails(uuid);
			
			// Print as clean JSON string
			console.log(JSON.stringify({
				[uuid]: tournamentDetails
			}, null, 2));
		} catch (err: any) {
			this.showError(err.message || 'Failed to fetch tournament details');
		}
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
		// Clear search timeouts if they exist
		if (this.searchTimeout !== null) {
			window.clearTimeout(this.searchTimeout);
			this.searchTimeout = null;
		}
		if (this.recentGamesSearchTimeout !== null) {
			window.clearTimeout(this.recentGamesSearchTimeout);
			this.recentGamesSearchTimeout = null;
		}
	}
}
