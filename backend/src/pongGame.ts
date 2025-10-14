// Pong Game Server Logic
import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';

const WIDTH = 640;
const HEIGHT = 360;
const paddleWidth = 12;
const paddleHeight = 80;
const paddleSpeed = 6;
const ballSize = 10;
const TICK_HZ = 60; // game loop runs 60 times/sec

// Game state types
type Side = 'left' | 'right' | 'spectator';
type InputState = { up: boolean; down: boolean };
type GameState = {
    ball: { x: number; y: number; vx: number; vy: number };
    paddles: { leftY: number; rightY: number };
    score: { left: number; right: number };
};

// Initial game state
const state: GameState = {
    ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 4, vy: 3 },
    paddles: { leftY: HEIGHT / 2 - paddleHeight / 2, rightY: HEIGHT / 2 - paddleHeight / 2 },
    score: { left: 0, right: 0 },
};

// Player tracking
const players = new Map<string, { side: Side; input: InputState }>();

// Helper functions
function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

// Reset ball to center after a goal
function resetBall(direction: 1 | -1): void {
    state.ball.x = WIDTH / 2;
    state.ball.y = HEIGHT / 2;
    state.ball.vx = 4 * direction;
    state.ball.vy = (Math.random() * 2 + 2) * (Math.random() < 0.5 ? -1 : 1);
}

// Update game state - one step of physics
function step(): void {
    // Update paddles based on input
    for (const [, { side, input }] of players) {
        if (side === 'left') {
            if (input.up) state.paddles.leftY -= paddleSpeed;
            if (input.down) state.paddles.leftY += paddleSpeed;
            state.paddles.leftY = clamp(state.paddles.leftY, 0, HEIGHT - paddleHeight);
        } else if (side === 'right') {
            if (input.up) state.paddles.rightY -= paddleSpeed;
            if (input.down) state.paddles.rightY += paddleSpeed;
            state.paddles.rightY = clamp(state.paddles.rightY, 0, HEIGHT - paddleHeight);
        }
    }

    // Move ball
    state.ball.x += state.ball.vx;
    state.ball.y += state.ball.vy;

    // Ball collisions with top/bottom
    if (state.ball.y <= 0 || state.ball.y >= HEIGHT - ballSize) {
        state.ball.vy *= -1;
        state.ball.y = clamp(state.ball.y, 0, HEIGHT - ballSize);
    }

    // Left paddle collision
    if (
        state.ball.x <= paddleWidth &&
        state.ball.y + ballSize >= state.paddles.leftY &&
        state.ball.y <= state.paddles.leftY + paddleHeight
    ) {
        state.ball.vx = Math.abs(state.ball.vx);
        state.ball.x = paddleWidth;
    }

    // Right paddle collision
    if (
        state.ball.x + ballSize >= WIDTH - paddleWidth &&
        state.ball.y + ballSize >= state.paddles.rightY &&
        state.ball.y <= state.paddles.rightY + paddleHeight
    ) {
        state.ball.vx = -Math.abs(state.ball.vx);
        state.ball.x = WIDTH - paddleWidth - ballSize;
    }

    // Goals
    if (state.ball.x < 0) {
        state.score.right += 1;
        resetBall(1);
    } else if (state.ball.x > WIDTH - ballSize) {
        state.score.left += 1;
        resetBall(-1);
    }
}

// Set up Pong game
export function setupPongGame(fastify: FastifyInstance, io: Server): void {

    io.on('connection', (socket: Socket) => {
        const currentSides = Array.from(players.values()).map((p) => p.side);
        const hasLeft = currentSides.indexOf('left') !== -1;
        const hasRight = currentSides.indexOf('right') !== -1;
        const side: Side = hasLeft
            ? hasRight ? 'spectator' : 'right'
            : 'left';

        players.set(socket.id, { side, input: { up: false, down: false } });
        socket.emit('role', { side });

        socket.on('input', (data: Partial<InputState>) => {
            const player = players.get(socket.id);
            if (!player) return;
            if (player.side === 'spectator') return;

            player.input.up = !!data.up;
            player.input.down = !!data.down;
        });

        socket.on('disconnect', (reason: string) => {
            players.delete(socket.id);
        });
    });

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

    fastify.log.info('Pong game server initialized');
}