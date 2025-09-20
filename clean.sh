#!/bin/sh
#
# Clean-up script to remove Docker images and networks.
#
# Please note that we go the conservative way without using
# `docker system prune...`, therefore dangling images will not be removed.

NAME_PREFIX="ft_transcendence-team-repo"

IMAGE_IDS=$(docker images --filter reference="${NAME_PREFIX}-*"			\
	--format '{{.ID}}')
BUILD_IMAGE_IDS=$(docker images --filter label="ft_transcendence.stage=build"	\
	--format '{{.ID}}')
NETWORK_IDS=$(docker network ls --filter name="${NAME_PREFIX}_*"		\
	--format '{{.ID}}')

# Images.
if [ -n "${IMAGE_IDS}" ]; then
	docker rmi ${IMAGE_IDS}
fi
# Build images.
if [ -n "${BUILD_IMAGE_IDS}" ]; then
	docker rmi ${BUILD_IMAGE_IDS}
fi
# Networks.
if [ -n "${NETWORK_IDS}" ]; then
	docker network rm ${NETWORK_IDS}
fi
