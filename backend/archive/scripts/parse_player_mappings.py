"""
Parse manual player name mappings from missing_players.txt.

This script reads the missing_players.txt file where you've manually mapped
player names in the format: "Excel Name - Database Name"

Handles names with dashes by splitting on the LAST occurrence of " - "
Outputs to player_mappings.json for use by analysis/import scripts.
"""

import json
import os

def parse_player_mappings(input_file='missing_players.txt', output_file='player_mappings.json'):
    """Parse player name mappings from text file to JSON."""

    print("=" * 80)
    print("PARSING PLAYER NAME MAPPINGS")
    print("=" * 80 + "\n")

    if not os.path.exists(input_file):
        print(f"✗ File not found: {input_file}")
        return

    print(f"Reading: {input_file}\n")

    mappings = {}
    skipped = []
    line_count = 0

    with open(input_file, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            line_count += 1

            # Skip header lines
            if line_count <= 2:
                continue

            # Skip empty lines
            if not line:
                continue

            # Skip lines with just "nan" or "MISSING PLAYERS" or "====..."
            if line.lower() == 'nan' or line == '=' * len(line) or 'MISSING PLAYERS' in line.upper():
                skipped.append((line_num, line, "Header or empty"))
                continue

            # Look for " - " separator (note the spaces around dash)
            if ' - ' not in line:
                skipped.append((line_num, line, "No ' - ' separator found"))
                continue

            # Split on LAST occurrence of " - " to handle names with dashes
            parts = line.rsplit(' - ', 1)

            if len(parts) != 2:
                skipped.append((line_num, line, "Could not split into 2 parts"))
                continue

            excel_name = parts[0].strip()
            db_name = parts[1].strip()

            # Skip if database name is empty
            if not db_name or db_name.lower() == 'nan':
                skipped.append((line_num, line, "Empty database name"))
                continue

            # Add mapping
            mappings[excel_name] = db_name
            print(f"✓ [{line_num}] '{excel_name}' → '{db_name}'")

    # Summary
    print(f"\n{'=' * 80}")
    print("PARSING COMPLETE")
    print(f"{'=' * 80}\n")
    print(f"✅ Successfully parsed: {len(mappings)} mappings")
    print(f"⚠️  Skipped: {len(skipped)} lines")

    if skipped:
        print(f"\n📋 SKIPPED LINES:")
        for line_num, line, reason in skipped[:10]:  # Show first 10
            print(f"  Line {line_num}: {reason}")
            print(f"    Content: {line[:60]}...")
        if len(skipped) > 10:
            print(f"  ... and {len(skipped) - 10} more")

    # Save to JSON
    print(f"\n💾 Saving to: {output_file}")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(mappings, f, indent=2, ensure_ascii=False)

    print(f"✓ Saved {len(mappings)} player name mappings")

    # Show some examples
    print(f"\n📖 EXAMPLE MAPPINGS:")
    for i, (excel_name, db_name) in enumerate(list(mappings.items())[:5], 1):
        print(f"  {i}. '{excel_name}' → '{db_name}'")

    print(f"\n✓ Complete! Use player_mappings.json in your analysis script.")

    return mappings


if __name__ == "__main__":
    parse_player_mappings()
