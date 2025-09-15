#!/bin/sh
#
# Clean-up script to remove Docker images.
#
# Please note that we go the conservative way without using
# `docker system prune...`, therefore dangling images will not be removed.

NAME_PREFIX="ft_transcendence-team-repo"

IMAGE_IDS=$(docker images --filter reference="${NAME_PREFIX}-*"		\
	--format '{{.ID}}')

# Images.
if [ -n "${IMAGE_IDS}" ]; then
	docker rmi ${IMAGE_IDS}
fi
