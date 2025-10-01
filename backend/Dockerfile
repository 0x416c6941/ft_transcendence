FROM node:24
LABEL ft_transcendence.stage="run"

WORKDIR /backend
COPY ./backend/package.json .
COPY ./backend/tsconfig.json .
COPY ./backend/src ./src

RUN npm install && npm run build

CMD ["npm", "run", "start"]
