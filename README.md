# ft\_transcendence
This is the last project of the 42's Common Core, a webapp running Pong games and tournaments.  
Additionally, users can also play Tetris and chat with other players.  
Game results are persisted in a database, tournaments can also be saved to blockchain.  
A total of 12 major modules (10 major + 4 minor) have been implemented.  
They are listed below.


## Install
To run the app:

1. Clone the repo
1. Run `./prep_keys.sh` and append your 42's OAuth API keys to `./secrets/`
1. `make` will start everything for you

The app will be running at `https://localhost:1488`.

### Caveat emptor
You **need** to have 42's OAuth API keys.  
Code's architecture is quite monolithic and the backend server will **NOT** be able to start without them.


## Modules
### Major (10)
- Add another game with user history and matchmaking
- Implement Two-Factor Authentication (2FA) and JWT
- Implementing a remote authentication
- Introduce an AI opponent
- Live chat
- Remote players
- Standard user management
- Store the score of a tournament in the Blockchain
- Use a framework to build the backend
- Use advanced 3D techniques

### Minor (4)
- Expanding browser compatibility
- Use a database for the backend
- Use a framework or a toolkit to build the frontend
- User and game stats dashboards
