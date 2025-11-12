import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';
import { validateNickname } from '../utils/validators.js';

export default class Pong3DAIView extends AbstractView {
    private canvas: HTMLCanvasElement | null = null;
    private engine: any = null;
    private scene: any = null;
    private socket: any = null;
    private snap: Snapshot | null = null;
    private input = { up: false, down: false };
    private gameActive: boolean = false;
    private winner: 'player' | 'ai' | null = null;
    private gameEnded: boolean = false;
    private isAuthenticated: boolean = false;
    
    // 3D objects
    private playerPaddle: any = null;
    private aiPaddle: any = null;
    private ball: any = null;
    private playerScoreText: any = null;
    private aiScoreText: any = null;
    private playerNameText: any = null;
    private aiNameText: any = null;
    private camera: any = null;

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
    }

    async getHtml(): Promise<string> {
        return `
      <main class="h-screen flex flex-col items-center justify-center bg-neutral-900 overflow-hidden">
        <div class="w-full max-w-[860px] mx-auto flex flex-col items-center justify-center">
          <h1 class="text-2xl font-bold text-white mb-3">3D Pong vs AI</h1>

          <div class="bg-[#0f1220] rounded-lg border-2 border-neutral-700 shadow-lg p-3 mb-3">
            <canvas id="pong3d" width="640" height="360" class="rounded"></canvas>
          </div>

          <!-- Alias Input Overlay -->
          <div id="alias-overlay" class="hidden fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center">
            <div class="bg-neutral-700 p-8 rounded-xl shadow-2xl max-w-md w-full mx-4 border-2 border-neutral-600">
              <h2 class="text-2xl font-bold text-white mb-6 text-center">Enter Your Name</h2>
              
              <div class="space-y-4">
                <div>
                  <label for="player-alias" class="block text-sm font-semibold text-gray-300 mb-2">
                    Player Name
                  </label>
                  <input 
                    id="player-alias" 
                    type="text" 
                    placeholder="Enter your name..." 
                    maxlength="20"
                    class="w-full px-4 py-3 rounded-lg bg-neutral-800 text-white border-2 border-neutral-600 
                           focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder-gray-400"
                  />
                </div>
                
                <p id="alias-error" class="text-red-400 text-sm font-semibold hidden">
                  Name must contain at least one non-whitespace character
                </p>
                
                <div class="flex gap-3 mt-6">
                  <button 
                    id="save-alias-btn" 
                    class="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 
                           text-white font-bold rounded-lg shadow-lg transition-colors opacity-50 cursor-not-allowed"
                    disabled>
                    SAVE
                  </button>
                  <button 
                    id="cancel-alias-btn" 
                    class="flex-1 px-6 py-3 bg-neutral-600 hover:bg-neutral-700 
                           text-white font-bold rounded-lg shadow-lg transition-colors">
                    CANCEL
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="flex flex-row items-center justify-center gap-4 mb-3">
            <button id="start-button" class="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-lg transition-colors font-medium">
              Start Game
            </button>
            <button id="back-button" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-lg transition-colors font-medium">
              Back to Home
            </button>
          </div>

          <div class="text-white text-sm text-center">
            <p>Player: Arrow Up/Down</p>
            <p>AI controls the right paddle</p>
            <p class="text-gray-400 mt-2">3D View - Powered by Babylon.js</p>
          </div>
        </div>
      </main>
    `;
    }

    setDocumentTitle(): void {
        document.title = `${APP_NAME} - 3D Pong vs AI`;
    }

    private handleBackClick = (): void => {
        this.router.navigate('/');
    };

    private handleStartClick = (): void => {
        if (this.isAuthenticated) {
            this.socket?.emit('start_ai_game', {});
        } else {
            const overlay = document.getElementById('alias-overlay');
            overlay?.classList.remove('hidden');
            (document.getElementById('player-alias') as HTMLInputElement)?.focus();
        }
    };

    private handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
        let changed = false;
        if (e.key === 'ArrowUp' && !this.input.up) { this.input.up = true; changed = true; }
        if (e.key === 'ArrowDown' && !this.input.down) { this.input.down = true; changed = true; }
        if (changed) this.sendInput();
    };

    private handleKeyUp = (e: KeyboardEvent): void => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
        let changed = false;
        if (e.key === 'ArrowUp' && this.input.up) { this.input.up = false; changed = true; }
        if (e.key === 'ArrowDown' && this.input.down) { this.input.down = false; changed = true; }
        if (changed) this.sendInput();
    };

    private setupOverlayButtons(): void {
        const overlay = document.getElementById('alias-overlay');
        const aliasInput = document.getElementById('player-alias') as HTMLInputElement;
        const errorMsg = document.getElementById('alias-error');
        const saveBtn = document.getElementById('save-alias-btn') as HTMLButtonElement;

        const handleValidation = () => {
            const result = validateNickname(aliasInput.value);
            if (result.status) {
                errorMsg?.classList.add('hidden');
                saveBtn.disabled = false;
                saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                errorMsg!.textContent = result.err_msg;
                errorMsg?.classList.remove('hidden');
                saveBtn.disabled = true;
                saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        };

        aliasInput?.addEventListener('input', handleValidation);
        
        saveBtn?.addEventListener('click', () => {
            handleValidation();
            if (saveBtn.disabled) return;

            overlay?.classList.add('hidden');
            this.socket?.emit('start_ai_game', { playerAlias: aliasInput.value.trim() });
        });

        document.getElementById('cancel-alias-btn')?.addEventListener('click', () => {
            overlay?.classList.add('hidden');
        });

        handleValidation();
    }

    private async loadBabylonJS(): Promise<void> {
        return new Promise((resolve, reject) => {
            if ((window as any).BABYLON) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.babylonjs.com/babylon.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Babylon.js'));
            document.head.appendChild(script);
        });
    }

    private async initBabylon3D(): Promise<void> {
        await this.loadBabylonJS();

        const BABYLON = (window as any).BABYLON;
        
        this.canvas = document.getElementById('pong3d') as HTMLCanvasElement;
        
        if (!this.canvas) {
            console.error('Canvas element not found!');
            return;
        }
        
        this.engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
        this.scene = new BABYLON.Scene(this.engine);
        
        // Force resize after engine creation
        this.engine.resize();
        
        // Set background to dark
        this.scene.clearColor = new BABYLON.Color4(0.05, 0.05, 0.1, 1);

        // Create camera - positioned to see entire 640x360 field from the side
        this.camera = new BABYLON.ArcRotateCamera(
            "camera",
            -Math.PI / 2,         // Horizontal angle (side view, rotated 90 degrees)
            Math.PI / 4,          // Vertical angle (45 degrees)
            600,                  // Distance - far enough to see 640x360 field
            new BABYLON.Vector3(320, 0, 180), // Look at center of field
            this.scene
        );
        this.camera.attachControl(this.canvas, true);
        this.camera.lowerRadiusLimit = 400;
        this.camera.upperRadiusLimit = 1000;
        
        // Lights
        const light1 = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), this.scene);
        light1.intensity = 0.6;
        
        const light2 = new BABYLON.PointLight("light2", new BABYLON.Vector3(320, 200, 180), this.scene);
        light2.intensity = 0.8;
        light2.diffuse = new BABYLON.Color3(1, 1, 1);

        // Create the playing field (640x360 in 2D, using as X-Z plane)
        const ground = BABYLON.MeshBuilder.CreateGround("ground", {
            width: 640,
            height: 360
        }, this.scene);
        ground.position = new BABYLON.Vector3(320, -5, 180);
        // No rotation needed - ground aligns correctly with X-Z plane
        
        const groundMaterial = new BABYLON.StandardMaterial("groundMat", this.scene);
        groundMaterial.diffuseColor = new BABYLON.Color3(0.1, 0.12, 0.15);
        groundMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        ground.material = groundMaterial;

        // Add grid lines
        const centerLine = BABYLON.MeshBuilder.CreateBox("centerLine", {
            width: 4,
            height: 2,
            depth: 360
        }, this.scene);
        centerLine.position = new BABYLON.Vector3(320, -3, 180);
        const centerLineMat = new BABYLON.StandardMaterial("centerLineMat", this.scene);
        centerLineMat.diffuseColor = new BABYLON.Color3(0.2, 0.25, 0.35);
        centerLineMat.emissiveColor = new BABYLON.Color3(0.1, 0.15, 0.2);
        centerLine.material = centerLineMat;

        // Create borders
        const borderMaterial = new BABYLON.StandardMaterial("borderMat", this.scene);
        borderMaterial.diffuseColor = new BABYLON.Color3(0.15, 0.2, 0.3);
        borderMaterial.emissiveColor = new BABYLON.Color3(0.05, 0.1, 0.15);

        const topBorder = BABYLON.MeshBuilder.CreateBox("topBorder", {
            width: 640,
            height: 10,
            depth: 4
        }, this.scene);
        topBorder.position = new BABYLON.Vector3(320, 0, 2);
        topBorder.material = borderMaterial;

        const bottomBorder = BABYLON.MeshBuilder.CreateBox("bottomBorder", {
            width: 640,
            height: 10,
            depth: 4
        }, this.scene);
        bottomBorder.position = new BABYLON.Vector3(320, 0, 358);
        bottomBorder.material = borderMaterial;

        // Create player paddle (left side, blue)
        this.playerPaddle = BABYLON.MeshBuilder.CreateBox("playerPaddle", {
            width: 12,
            height: 20,
            depth: 80
        }, this.scene);
        this.playerPaddle.position = new BABYLON.Vector3(6, 10, 140);
        
        const playerMaterial = new BABYLON.StandardMaterial("playerMat", this.scene);
        playerMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.5, 1);
        playerMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.3, 0.6);
        playerMaterial.specularColor = new BABYLON.Color3(1, 1, 1);
        this.playerPaddle.material = playerMaterial;

        // Create AI paddle (right side, red)
        this.aiPaddle = BABYLON.MeshBuilder.CreateBox("aiPaddle", {
            width: 12,
            height: 20,
            depth: 80
        }, this.scene);
        this.aiPaddle.position = new BABYLON.Vector3(634, 10, 140);
        
        const aiMaterial = new BABYLON.StandardMaterial("aiMat", this.scene);
        aiMaterial.diffuseColor = new BABYLON.Color3(1, 0.2, 0.3);
        aiMaterial.emissiveColor = new BABYLON.Color3(0.6, 0.1, 0.2);
        aiMaterial.specularColor = new BABYLON.Color3(1, 1, 1);
        this.aiPaddle.material = aiMaterial;

        // Create ball
        this.ball = BABYLON.MeshBuilder.CreateSphere("ball", {
            diameter: 10,
            segments: 16
        }, this.scene);
        this.ball.position = new BABYLON.Vector3(320, 5, 180);
        
        const ballMaterial = new BABYLON.StandardMaterial("ballMat", this.scene);
        ballMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
        ballMaterial.emissiveColor = new BABYLON.Color3(0.8, 0.8, 0.8);
        ballMaterial.specularColor = new BABYLON.Color3(1, 1, 1);
        this.ball.material = ballMaterial;

        // Add glow effect to ball
        const glowLayer = new BABYLON.GlowLayer("glow", this.scene);
        glowLayer.addIncludedOnlyMesh(this.ball);
        glowLayer.intensity = 0.8;

        // Create GUI for text overlays
        const advancedTexture = (window as any).BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

        // Player score - subtle styling
        this.playerScoreText = new (window as any).BABYLON.GUI.TextBlock();
        this.playerScoreText.text = "0";
        this.playerScoreText.color = "#3b82f6";
        this.playerScoreText.fontSize = 32;
        this.playerScoreText.alpha = 0.4;
        this.playerScoreText.left = -100;
        this.playerScoreText.top = 30;
        advancedTexture.addControl(this.playerScoreText);

        // AI score - subtle styling
        this.aiScoreText = new (window as any).BABYLON.GUI.TextBlock();
        this.aiScoreText.text = "0";
        this.aiScoreText.color = "#ef4444";
        this.aiScoreText.fontSize = 32;
        this.aiScoreText.alpha = 0.4;
        this.aiScoreText.left = 100;
        this.aiScoreText.top = 30;
        advancedTexture.addControl(this.aiScoreText);

        // Player name - subtle styling
        this.playerNameText = new (window as any).BABYLON.GUI.TextBlock();
        this.playerNameText.text = "";
        this.playerNameText.color = "white";
        this.playerNameText.fontSize = 14;
        this.playerNameText.alpha = 0.3;
        this.playerNameText.left = -200;
        this.playerNameText.top = 50;
        advancedTexture.addControl(this.playerNameText);

        // AI name - subtle styling
        this.aiNameText = new (window as any).BABYLON.GUI.TextBlock();
        this.aiNameText.text = "AI";
        this.aiNameText.color = "white";
        this.aiNameText.fontSize = 14;
        this.aiNameText.alpha = 0.3;
        this.aiNameText.left = 200;
        this.aiNameText.top = 50;
        advancedTexture.addControl(this.aiNameText);

        // Start render loop
        this.engine.runRenderLoop(() => {
            if (this.scene) {
                this.update3DObjects();
                this.scene.render();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.engine?.resize();
        });
    }

    private update3DObjects(): void {
        if (!this.snap) return;

        // Update paddle positions (Y in 2D becomes Z in 3D, inverted)
        if (this.playerPaddle) {
            this.playerPaddle.position.z = 360 - (this.snap.paddles.playerY + 40); // Invert Y axis
        }

        if (this.aiPaddle) {
            this.aiPaddle.position.z = 360 - (this.snap.paddles.aiY + 40); // Invert Y axis
        }

        // Update ball position
        if (this.ball) {
            this.ball.position.x = this.snap.ball.x + 5; // +5 to center
            this.ball.position.z = 360 - (this.snap.ball.y + 5); // Invert Y axis
            
            // Add subtle floating animation
            this.ball.position.y = 5 + Math.sin(Date.now() * 0.005) * 2;
        }

        // Update scores
        if (this.playerScoreText) {
            this.playerScoreText.text = this.snap.score.player.toString();
        }
        if (this.aiScoreText) {
            this.aiScoreText.text = this.snap.score.ai.toString();
        }

        // Update player name
        if (this.playerNameText && this.snap.playerAlias) {
            this.playerNameText.text = this.snap.playerAlias;
        }
    }

    async setup(): Promise<void> {
        // Load Babylon.js and initialize GUI
        await this.loadBabylonJS();
        const script = document.createElement('script');
        script.src = 'https://cdn.babylonjs.com/gui/babylon.gui.min.js';
        document.head.appendChild(script);
        await new Promise(resolve => script.onload = resolve);

        // Initialize 3D scene
        await this.initBabylon3D();

        this.socket = (window as any).io(window.location.origin + '/pong-ai', {
            path: '/api/socket.io/',
            withCredentials: true
        });

        document.getElementById('back-button')?.addEventListener('click', this.handleBackClick);
        document.getElementById('start-button')?.addEventListener('click', this.handleStartClick);

        this.socket.on('connect', () => {
            this.socket.emit('create_ai_room');
        });

        this.socket.on('auth_status', ({ isAuthenticated }: { isAuthenticated: boolean; displayName: string | null }) => {
            this.isAuthenticated = isAuthenticated;
        });

        this.socket.on('ai_room_created', () => {
            this.updateStartButton();
        });

        this.socket.on('game_stopped', () => {
            this.snap = null;
            this.gameActive = false;
            this.winner = null;
            this.gameEnded = false;
            this.updateStartButton();
        });

        this.socket.on('game_end', ({ winner }: { winner: 'player' | 'ai' }) => {
            this.winner = winner;
            this.gameActive = false;
            this.gameEnded = true;
            this.updateStartButton();
            this.showWinnerOverlay();
        });

        this.socket.on('game_state', (data: Snapshot) => {
            this.snap = data;
            this.gameActive = true;
            if (this.gameEnded) {
                this.gameEnded = false;
                this.winner = null;
            }
            this.updateStartButton();
        });

        this.socket.on('validation_error', ({ message }: { message: string }) => {
            const errorMsg = document.getElementById('alias-error');
            const overlay = document.getElementById('alias-overlay');
            if (errorMsg && overlay) {
                errorMsg.textContent = `Server error: ${message}`;
                errorMsg.classList.remove('hidden');
                overlay.classList.remove('hidden');
                (document.getElementById('player-alias') as HTMLInputElement)?.focus();
            }
        });

        this.setupOverlayButtons();

        // keyboard
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
    }

    cleanup(): void {
        // keyboard
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);

        // UI
        document.getElementById('back-button')?.removeEventListener('click', this.handleBackClick);
        document.getElementById('start-button')?.removeEventListener('click', this.handleStartClick);

        // sockets
        if (this.socket) {
            this.socket.off('connect');
            this.socket.off('auth_status');
            this.socket.off('ai_room_created');
            this.socket.off('game_state');
            this.socket.off('game_stopped');
            this.socket.off('game_end');
            this.socket.emit('leave_ai_room');
            this.socket.disconnect();
            this.socket = null;
        }

        // Babylon.js cleanup
        if (this.scene) {
            this.scene.dispose();
            this.scene = null;
        }
        if (this.engine) {
            this.engine.dispose();
            this.engine = null;
        }
    }

    // Send input to server
    private sendInput(): void {
        if (!this.gameActive) return;
        if (!this.socket || !this.socket.connected) return;
        this.socket?.emit('input', { ...this.input });
    }

    private updateStartButton(): void {
        const startButton = document.getElementById('start-button') as HTMLButtonElement;
        if (!startButton) return;

        if (this.gameActive) {
            startButton.style.display = 'none';
            return;
        }

        startButton.style.display = 'block';
        startButton.textContent = 'Start Game';
    }

    private showWinnerOverlay(): void {
        if (!this.winner || !this.snap) return;

        const BABYLON = (window as any).BABYLON;
        
        // Use 2D fullscreen UI overlay for clean, readable text
        const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("winnerUI");
        
        // Semi-transparent background
        const rect = new BABYLON.GUI.Rectangle();
        rect.width = "600px";
        rect.height = "200px";
        rect.background = "rgba(0, 0, 0, 0.85)";
        rect.cornerRadius = 20;
        rect.thickness = 3;
        rect.color = this.winner === 'player' ? "#3b82f6" : "#ef4444";
        advancedTexture.addControl(rect);

        // Winner text
        const text = new BABYLON.GUI.TextBlock();
        const winnerName = this.winner === 'player' ? this.snap.playerAlias : 'AI';
        text.text = `${winnerName} WINS!`;
        text.color = "white";
        text.fontSize = 56;
        text.fontWeight = "bold";
        rect.addControl(text);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            advancedTexture.dispose();
        }, 5000);
    }
}

type Snapshot = {
    width: number;
    height: number;
    paddles: { playerY: number; aiY: number };
    ball: { x: number; y: number };
    score: { player: number; ai: number };
    playerAlias: string;
};
