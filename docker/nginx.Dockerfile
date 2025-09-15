FROM nginx:1.28

RUN rm -f /etc/nginx/default.conf
RUN mkdir -p /etc/nginx/templates
COPY ./nginx/server.conf /etc/nginx/templates/server.conf.template

COPY ./frontend/public/ /web
