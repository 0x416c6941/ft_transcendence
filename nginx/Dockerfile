# Building frontend.
FROM node:24 AS build
LABEL ft_transcendence.stage="build"

WORKDIR /build

COPY ./frontend/public/ ./public
COPY ./frontend/package.json .
COPY ./frontend/tsconfig.json .
COPY ./frontend/src ./src

RUN npm install && npm run build


# NGINX image itself.
FROM nginx:1.28

RUN rm -f /etc/nginx/default.conf		\
	&& mkdir -p /etc/nginx/templates
COPY ./nginx/server.conf /etc/nginx/templates/server.conf.template

COPY --from=build /build/public/ /web
COPY --from=build /build/dist/ /web/dist
