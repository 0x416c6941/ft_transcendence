#!/bin/bash
#
# Script to inject required keys.

. ./.env

# Define the files and their content.
declare -A secrets=(
	["${SECRETS_DIR}/${SECRET_BLOCKCHAIN_PRIVATE_KEY_FILENAME}"]="56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027"
)

# Remove any existing secrets directory/file and create fresh.
rm -rf secrets
mkdir secrets

# Check each file and create if missing.
for file in "${!secrets[@]}"; do
	if [ ! -f "$file" ]; then
		echo "Creating missing file: $file"
		echo "${secrets[$file]}" > "$file"
	else
		echo "File already exists: $file"
	fi
done
