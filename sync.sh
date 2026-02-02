#!/bin/bash
# Sync game files from root to public folder
# Usage: ./sync.sh [--dry-run]

PROJECT_DIR="/Users/vdat/Desktop/Dat/CODE/5.game"
PUBLIC_DIR="$PROJECT_DIR/public"

# Files/folders to sync (only game content)
SYNC_ITEMS=("games" "common" "index.html")

# Dry run mode
if [ "$1" == "--dry-run" ] || [ "$1" == "-n" ]; then
    echo "🔍 DRY RUN - Showing what would be synced:"
    echo "=========================================="
    for item in "${SYNC_ITEMS[@]}"; do
        if [ -e "$PROJECT_DIR/$item" ]; then
            echo "📁 $item"
            if [ -d "$PROJECT_DIR/$item" ]; then
                find "$PROJECT_DIR/$item" -type f -newer "$PUBLIC_DIR/$item" 2>/dev/null | while read f; do
                    echo "   └─ ${f#$PROJECT_DIR/} (modified)"
                done
            fi
        fi
    done
    echo ""
    echo "Run './sync.sh' without --dry-run to apply changes."
    exit 0
fi

echo "🔄 Syncing game files to public folder..."
echo ""

for item in "${SYNC_ITEMS[@]}"; do
    if [ -e "$PROJECT_DIR/$item" ]; then
        echo "📁 Syncing: $item"
        if [ -d "$PROJECT_DIR/$item" ]; then
            rsync -av --delete "$PROJECT_DIR/$item/" "$PUBLIC_DIR/$item/" > /dev/null
        else
            cp "$PROJECT_DIR/$item" "$PUBLIC_DIR/$item"
        fi
    fi
done

echo ""
echo "✅ Sync complete!"
echo "🌐 Changes are live at: https://datnv.online"
