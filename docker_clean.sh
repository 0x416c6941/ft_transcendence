#!/bin/sh
#
# Clean-up script to remove all created Docker images, volumes and networks.

NAME_PREFIX="ft_transcendence-team-repo"
LABEL_PREFIX="ft_transcendence"

IMAGE_IDS=$(docker images --filter label="${LABEL_PREFIX}.stage=run"		\
	--format '{{.ID}}')
BUILD_IMAGE_IDS=$(docker images --filter label="${LABEL_PREFIX}.stage=build"	\
	--format '{{.ID}}')
VOLUME_NAMES=$(docker volume ls --filter name="${NAME_PREFIX}_*"		\
	--format '{{.Name}}')
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
# Volumes.
if [ -n "${VOLUME_NAMES}" ]; then
	docker volume rm ${VOLUME_NAMES}
fi
# Networks.
if [ -n "${NETWORK_IDS}" ]; then
	docker network rm ${NETWORK_IDS}
fi
