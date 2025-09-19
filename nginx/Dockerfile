# Building frontend.
FROM node:24 AS build

WORKDIR /build

COPY ./package.json .
COPY ./frontend/ ./frontend

# Running multiple commands in one "RUN" instruction
# to avoid adding redundant layers.
RUN npm install && npm run build:frontend


# NGINX image itself.
FROM nginx:1.28

RUN rm -f /etc/nginx/default.conf		\
	&& mkdir -p /etc/nginx/templates
COPY ./nginx/server.conf /etc/nginx/templates/server.conf.template

COPY --from=build /build/frontend/public/ /web
COPY --from=build /build/frontend/dist/ /web/dist
