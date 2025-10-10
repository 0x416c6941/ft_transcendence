/* Flow of the server:
1. Start Fastify HTTP server → serves static files from /client (index.html, styles, scripts).
2. Initialize Socket.IO → handles realtime connections from players.
3. On connect:
   - Assign player role: first = left, second = right, rest = spectators.
   - Send role info back to client.
4. On input event from client → update that player’s paddle state.
5. Game loop runs 60 times/sec:
   - Update paddles, ball, collisions, scoring.
   - Reset ball after a goal.
   - Broadcast updated game_state to all clients.
6. On disconnect → remove player from the players map.
*/

import Fastify from 'fastify';               // HTTP server
import fastifyStatic from '@fastify/static'; // Plugin for serving static files (HTML/CSS/JS)
import fastifyCors from '@fastify/cors';     // Plugin for CORS (allow browser requests)
import { Server as IOServer } from 'socket.io'; // Socket.IO — realtime connections (WebSocket)
import { fileURLToPath } from 'url';         // Converts import.meta.url to a file path
import { dirname, resolve } from 'path';     // Work with paths (get directory, join paths)
import 'dotenv/config';                      // Loads environment variables from .env

const PORT = Number(process.env.PORT) || 3000;
const WIDTH = 800;
const HEIGHT = 480;
const paddleWidth = 10;
const paddleHeight = 80;
const paddleSpeed = 6;
const ballSize = 10;
const TICK_HZ = 60; // game loop runs 60 times/sec (physics + snapshots)

// -------- Fastify (HTTP + static files)
const app = Fastify({ logger: true });
await app.register(fastifyCors, { origin: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

await app.register(fastifyStatic, {
  root: resolve(__dirname, '../client'),
  prefix: '/',
});

app.get('/', async (_req, reply) => reply.sendFile('index.html'));

// -------- Game types/state
type Side = 'left' | 'right' | 'spectator';
type InputState = { up: boolean; down: boolean };
type GameState = {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { leftY: number; rightY: number };
  score: { left: number; right: number };
};

// initial game state
const state: GameState = {
  ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 4, vy: 3 },
  paddles: { leftY: HEIGHT / 2 - paddleHeight / 2, rightY: HEIGHT / 2 - paddleHeight / 2 },
  score: { left: 0, right: 0 },
};

// list of players: socket.id -> { side, input }
const players = new Map<string, { side: Side; input: InputState }>();

// -------- Socket.IO
const io = new IOServer(app.server, { cors: { origin: true } });

io.on('connection', (socket) => {
  // assign a side: first "left", then "right", rest = spectators
  const currentSides = Array.from(players.values()).map((p) => p.side);//occupied roles
  const side: Side = currentSides.includes('left')
    ? currentSides.includes('right') ? 'spectator' : 'right'
    : 'left';

  players.set(socket.id, { side, input: { up: false, down: false } });
  app.log.info({ id: socket.id, side }, 'socket connected');
  socket.emit('role', { side });// tell the client its role (left, right, spectator)

// handle player input
  socket.on('input', (data: Partial<InputState>) => {
    const p = players.get(socket.id);
    if (!p) return;
    if (p.side === 'spectator') return;
    p.input.up = !!data.up;
    p.input.down = !!data.down;
  });

  // remove player when they disconnect
  socket.on('disconnect', (reason) => {
    app.log.info({ id: socket.id, reason }, 'socket disconnected');
    players.delete(socket.id);
  });
});

// -------- Game loop
function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

// reset ball to center (after a goal)
function resetBall(direction: 1 | -1) {
  state.ball.x = WIDTH / 2;
  state.ball.y = HEIGHT / 2;
  state.ball.vx = 4 * direction;
  state.ball.vy = (Math.random() * 2 + 2) * (Math.random() < 0.5 ? -1 : 1);
}

// one game step: called each tick
function step() {
  // update paddles based on input
  for (const [, { side, input }] of players) {
    if (side === 'left') {
      if (input.up) state.paddles.leftY -= paddleSpeed;
      if (input.down) state.paddles.leftY += paddleSpeed;
      state.paddles.leftY = clamp(state.paddles.leftY, 0, HEIGHT - paddleHeight);//не даёт ракетке выйти за поле
    } else if (side === 'right') {
      if (input.up) state.paddles.rightY -= paddleSpeed;
      if (input.down) state.paddles.rightY += paddleSpeed;
      state.paddles.rightY = clamp(state.paddles.rightY, 0, HEIGHT - paddleHeight);
    }
  }

  // ball move
  state.ball.x += state.ball.vx;
  state.ball.y += state.ball.vy;

  // top/bottom bounce
  if (state.ball.y <= 0 || state.ball.y >= HEIGHT - ballSize) {
    state.ball.vy *= -1;
    state.ball.y = clamp(state.ball.y, 0, HEIGHT - ballSize);
  }

  // left paddle collision
  if (
    state.ball.x <= paddleWidth &&
    state.ball.y + ballSize >= state.paddles.leftY &&
    state.ball.y <= state.paddles.leftY + paddleHeight
  ) {
    state.ball.vx = Math.abs(state.ball.vx); // вправо
    state.ball.x = paddleWidth;
  }

  // right paddle collision
  if (
    state.ball.x + ballSize >= WIDTH - paddleWidth &&
    state.ball.y + ballSize >= state.paddles.rightY &&
    state.ball.y <= state.paddles.rightY + paddleHeight
  ) {
    state.ball.vx = -Math.abs(state.ball.vx); // влево
    state.ball.x = WIDTH - paddleWidth - ballSize;
  }

  // goals
  if (state.ball.x < 0) {
    state.score.right += 1;
    resetBall(1);
  } else if (state.ball.x > WIDTH - ballSize) {
    state.score.left += 1;
    resetBall(-1);
  }
}

// single loop: run physics + send snapshots
setInterval(() => {
  step();
  const snapshot = {
    width: WIDTH,
    height: HEIGHT,
    paddles: state.paddles,
    ball: { x: state.ball.x, y: state.ball.y },
    score: state.score,
  };
  io.emit('game_state', snapshot);
}, 1000 / TICK_HZ);

// -------- Start server
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`HTTP + Socket.IO on http://localhost:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

