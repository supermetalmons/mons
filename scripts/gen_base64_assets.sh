#!/bin/bash

# Directory
PNG_DIR="png"

# Initialize gameAssets object
GAME_ASSETS="export const gameAssets = {"

# Base64 encode PNGs
for FILE in "$PNG_DIR"/*.png; do
    if [[ -f "$FILE" ]]; then
        BASENAME=$(basename "$FILE" .png)
        
        # Base64 encode the PNG file
        BASE64_ENCODED=$(base64 < "$FILE" | tr -d '\n')

        # Add to gameAssets object
        GAME_ASSETS+="\n  $BASENAME: \"$BASE64_ENCODED\","
    fi
done

# Finalize gameAssets object
GAME_ASSETS+="\n};"

# Write to a JavaScript file
echo -e "$GAME_ASSETS" > gameAssets.ts

echo "Base64 encoding completed. gameAssets.ts has been created."
