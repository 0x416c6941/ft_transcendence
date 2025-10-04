#!/bin/sh
#
# Script to prepare keys for NGINX and Fastify HTTPS server.

. ./.env

NGINX_CN="${SERVICE_NAME_PREFIX} ${NGINX_SERVICE_NAME}"
BACKEND_CA_CN="${SERVICE_NAME_PREFIX} ${BACKEND_SERVICE_NAME} CA"
BACKEND_CA_KEY_OUT_FILENAME="${SERVICE_NAME_PREFIX}-${BACKEND_SERVICE_NAME}-ca.key"
BACKEND_CSR_OUT_FILENAME="${SERVICE_NAME_PREFIX}-${BACKEND_SERVICE_NAME}.csr"

# Creating a directory for keys and certificates, if doesn't exist yet.
if [ ! -d "${SECRETS_DIR}" ]; then
	mkdir -p "${SECRETS_DIR}"
fi
# Keys and certificates for NGINX.
echo "NGINX:"
openssl req -newkey rsa:2048 -nodes -new -x509 -sha256 -days 365	\
	-subj "/CN=${NGINX_CN}"						\
	-keyout "${SECRETS_DIR}/${SECRET_NGINX_KEY_FILENAME}"		\
	-out "${SECRETS_DIR}/${SECRET_NGINX_CRT_FILENAME}"
# Certificate Authority (CA) for NGINX
# to "trust" our Fastify SSL key + certificate.
echo "CA:"
openssl req -newkey rsa:4096 -nodes -new -x509 -sha256 -days 3650	\
	-subj "/CN=${BACKEND_CA_CN}"					\
	-keyout "${SECRETS_DIR}/${BACKEND_CA_KEY_OUT_FILENAME}"		\
	-out "${SECRETS_DIR}/${SECRET_BACKEND_CA_CRT_FILENAME}"
# Keys and CSR (Certificate Signing Request) for Fastify.
echo "Backend:"
openssl genrsa -out "${SECRETS_DIR}/${SECRET_BACKEND_KEY_FILENAME}" 2048
openssl req -new -key "${SECRETS_DIR}/${SECRET_BACKEND_KEY_FILENAME}"	\
	-out "${SECRETS_DIR}/${BACKEND_CSR_OUT_FILENAME}"		\
	-subj "/CN=${BACKEND_SERVICE_NAME}"
# Signing CSR with CA.
openssl x509 -req -in "${SECRETS_DIR}/${BACKEND_CSR_OUT_FILENAME}"		\
	-CA "${SECRETS_DIR}/${SECRET_BACKEND_CA_CRT_FILENAME}"			\
	-CAkey "${SECRETS_DIR}/${BACKEND_CA_KEY_OUT_FILENAME}" -CAcreateserial	\
	-out "${SECRETS_DIR}/${SECRET_BACKEND_CRT_FILENAME}" -days 365 -sha256
