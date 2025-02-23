#!/bin/bash

# Directories
PNG_DIR="png"
WEBP_DIR="webp"

# Create webp directory if it doesn't exist
mkdir -p "$WEBP_DIR"

# Initialize gameAssets object
GAME_ASSETS="export const gameAssets = {"

# Convert PNG to WEBP and base64 encode
for FILE in "$PNG_DIR"/*.png; do
    if [[ -f "$FILE" ]]; then
        BASENAME=$(basename "$FILE" .png)
        WEBP_FILE="$WEBP_DIR/$BASENAME.webp"

        # Convert PNG to WEBP
        cwebp "$FILE" -o "$WEBP_FILE" > /dev/null 2>&1

        if [[ $? -eq 0 ]]; then
            # Base64 encode the WEBP file
            BASE64_ENCODED=$(base64 < "$WEBP_FILE" | tr -d '\n')

            # Add to gameAssets object
            GAME_ASSETS+="\n  $BASENAME: \"$BASE64_ENCODED\","
        else
            echo "Error converting $FILE to WEBP."
        fi
    fi
done

# Remove all WEBP files
rm -rf "$WEBP_DIR"

# Finalize gameAssets object
GAME_ASSETS+="\n};"

# Write to a JavaScript file
echo -e "$GAME_ASSETS" > gameAssets.ts

echo "Conversion, base64 encoding, and cleanup completed. gameAssets.ts has been created."
