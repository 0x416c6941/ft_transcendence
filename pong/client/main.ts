/* Flow of the game loop:
1. Client connects → receives a `role` event (left player, right player, or spectator).
2. Client listens for keydown/keyup → sends `input` events to the server.
3. Server runs physics 60 times/sec → sends back `game_state`.
4. Client receives `game_state` and saves it as `snap`.
5. The requestAnimationFrame loop renders the latest `snap` on the Canvas.
*/

// --- socket connection ---
const socket = (window as any).io();
const statusEl = document.getElementById('status') as HTMLElement;


type Snapshot = {
  width: number;
  height: number;
  paddles: { leftY: number; rightY: number };
  ball: { x: number; y: number };
  score: { left: number; right: number };
};

let mySide: 'left' | 'right' | 'spectator' = 'spectator';

// Connection status
socket.on('connect', () => {
  statusEl.textContent = `Connected: ${socket.id}`;
});
socket.on('disconnect', (reason: string) => {
  statusEl.textContent = `Disconnected: ${reason}`;
});
// Server assigns role: left, right, or spectator
socket.on('role', (data: { side: typeof mySide }) => {
  mySide = data.side;
  console.log('my side:', mySide);
});

// --- canvas setup ---
const canvas = document.getElementById('pong') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

// Local snapshot (latest state received from the server)
let snap: Snapshot | null = null;

// Update local snapshot when server broadcasts new game state
socket.on('game_state', (data: Snapshot) => {
  snap = data;
});

// --- input handling ---
const input = { up: false, down: false };

function sendInput() {
  socket.emit('input', input);//send current input state to the server
}
// Key press → update input and notify server
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') { if (!input.up) { input.up = true; sendInput(); } }
  if (e.key === 'ArrowDown') { if (!input.down) { input.down = true; sendInput(); } }
});
// Key release → update input and notify server
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp') { if (input.up) { input.up = false; sendInput(); } }
  if (e.key === 'ArrowDown') { if (input.down) { input.down = false; sendInput(); } }
});

// --- rendering ---
function draw() {
  if (!snap) return;

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

// background
  ctx.fillStyle = '#0f1220';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // center dashed line
  ctx.strokeStyle = '#262b45';
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2, 0);
  ctx.lineTo(WIDTH / 2, HEIGHT);
  ctx.stroke();
  ctx.setLineDash([]);

  // paddles
  const paddleWidth = 10;
  const paddleHeight = 80;

  // left paddle (blue)
  ctx.fillStyle = '#4f7cff';
  ctx.fillRect(0, snap.paddles.leftY, paddleWidth, paddleHeight);

  // right paddle (white)
  ctx.fillStyle = '#e6e8f2';
  ctx.fillRect(WIDTH - paddleWidth, snap.paddles.rightY, paddleWidth, paddleHeight);

  // ball
  const ballSize = 10;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(snap.ball.x, snap.ball.y, ballSize, ballSize);

  // score
  const scoreEl = document.getElementById('score');
  if (scoreEl) scoreEl.textContent = `${snap.score.left} : ${snap.score.right}`;
}

// Main render loop 
function loop() {
  draw();
  requestAnimationFrame(loop);
}
loop();
