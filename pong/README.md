**Transcendence Pong**
```
/server   — Fastify + Socket.IO 
/client   — TypeScript + Canvas + Tailwind
/dist     — compiled frontend code
```
All game physics runs on the server.  
The client:  
-sends only input state (ArrowUp / ArrowDown),  
-receives game state snapshots from the server (game_state),  
-renders the game on Canvas using these snapshots.  
The first connected player controls the left paddle, the second player  controls the right paddle, all other clients join as spectators.  

How to Run
Install dependencies:
```bash
npm install
```
Build the client and server, and Tailwind styles:
```bash
npm run dev
```
Open in browser:
```bash
http://localhost:3000
```
To test 2 players from different machines on the same local network:
```bash
http://<your-local-ip>:3000
```
Find your local IP:
```bash
ifconfig | grep inet
```

