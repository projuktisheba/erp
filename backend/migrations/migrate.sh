#!/bin/bash
# ===================================================
# Database Migration Tool (Intuitive UX & Secure Edition)
# ===================================================

set -e

# --- Colors & Formatting ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

MIGRATIONS_DIR="./"
SEEDS_DIR="./test"

# --- Helper Functions ---
pause_for_enter() {
    echo -e "\n${CYAN}Press [Enter] to return to the menu...${NC}"
    read -r
}

print_header() {
    clear
    echo -e "${BLUE}${BOLD}==================================================${NC}"
    echo -e "${BLUE}${BOLD}        Database Migration & Seeding Tool         ${NC}"
    echo -e "${BLUE}${BOLD}==================================================${NC}\n"
}

mask_url() {
    # Uses regex to find the text between "://" + "username:" and the "@" symbol, replacing it with *******
    echo "$1" | sed -E 's/(:\/\/[^:]+:)[^@]+(@)/\1*******\2/'
}

# --- Initialization & Connection ---
print_header

echo -e "Select your Database System:"
echo -e "  ${CYAN}1)${NC} PostgreSQL (Default)"
echo -e "  ${CYAN}2)${NC} MySQL"
echo -ne "\nOption ${CYAN}[1/2]${NC}: "
read -r DBMS_CHOICE

# Default to 1 (Postgres) if the user just hits Enter
if [ -z "$DBMS_CHOICE" ] || [ "$DBMS_CHOICE" = "1" ]; then
    DBMS_PREFIX="POSTGRES"
    SCHEME="postgres"
elif [ "$DBMS_CHOICE" = "2" ]; then
    DBMS_PREFIX="MYSQL"
    SCHEME="mysql"
else
    echo -e "${RED}‚ùå Invalid selection, exiting.${NC}"
    exit 1
fi

# Smarter .env discovery
ENV_FILE=""
for file in "./../.env" "./.env" "../.env"; do
    if [ -f "$file" ]; then
        ENV_FILE="$file"
        break
    fi
done

DB_URL=""

if [ -n "$ENV_FILE" ]; then
    echo -e "${CYAN}Ì¥ç Found configuration at $ENV_FILE...${NC}"

    get_env() { grep "^$1=" "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r'; }

    # 1. Try to get direct URL
    DB_URL=$(get_env "${DBMS_PREFIX}_URL")

    # 2. If no direct URL, build it from components
    if [ -z "$DB_URL" ]; then
        DB_NAME=$(get_env "${DBMS_PREFIX}_DBNAME")
        DB_USER=$(get_env "${DBMS_PREFIX}_DBUSER")
        DB_PASS=$(get_env "${DBMS_PREFIX}_DBPASSWORD")
        DB_HOST=$(get_env "${DBMS_PREFIX}_DBHOST")
        DB_PORT=$(get_env "${DBMS_PREFIX}_DBPORT")

        if [ -n "$DB_NAME" ] && [ -n "$DB_USER" ] && [ -n "$DB_PASS" ] && [ -n "$DB_HOST" ] && [ -n "$DB_PORT" ]; then
            if [ "$DBMS_PREFIX" = "POSTGRES" ]; then
                DB_URL="${SCHEME}://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=disable"
            else
                DB_URL="${SCHEME}://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
            fi
        fi
    fi
else
    echo -e "${YELLOW}‚ö†Ô∏è No .env file found in standard locations.${NC}"
fi

# Fallback for manual entry
if [ -z "$DB_URL" ]; then
    echo -e "${YELLOW}‚ö†Ô∏è Could not auto-build connection string.${NC}"
    echo -ne "Enter your ${DBMS_PREFIX} DB URL (e.g., ${SCHEME}://user:pass@host:port/dbname): "
    read -r -s DB_URL # -s hides the input while typing for extra security
    echo "" # Add newline since -s swallows the enter key
    [ -z "$DB_URL" ] && echo -e "${RED}‚ùå DB URL cannot be empty!${NC}" && exit 1
else
    echo -e "${GREEN}‚úÖ Database connection string loaded!${NC}"
fi

# Generate the safe URL for display purposes
MASKED_URL=$(mask_url "$DB_URL")

echo -e "${CYAN}Ì¥ç Testing connection to: ${YELLOW}${MASKED_URL}${NC} ..."

# Note: We use the REAL DB_URL here to connect, not the masked one!
if ! psql "$DB_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${RED}‚ùå Failed to connect to database! Please check your credentials.${NC}"
    exit 1
fi
echo -e "${GREEN}‚úÖ Connection successful!${NC}\n"

# Setup table
psql "$DB_URL" -c "
CREATE TABLE IF NOT EXISTS migration_history (
    id SERIAL PRIMARY KEY,
    filename TEXT UNIQUE NOT NULL,
    direction TEXT NOT NULL,
    applied_at TIMESTAMP DEFAULT now()
);" > /dev/null

echo -ne "${YELLOW}Enable auto-confirm (skip Y/n prompts for each file)? [y/N]: ${NC}"
read -r CONFIRM_INPUT
if [[ "$CONFIRM_INPUT" =~ ^[Yy]$ ]]; then
    GLOBAL_CONFIRM=true
else
    GLOBAL_CONFIRM=false
fi

# --- Main Menu Loop ---
while true; do
    print_header
    echo -e "  ${CYAN}1.${NC} Ì¥º Run all UP migrations"
    echo -e "  ${CYAN}2.${NC} Ì¥Ω Run all DOWN migrations"
    echo -e "  ${CYAN}3.${NC} ÌæØ Execute by Serial Number (List view)"
    echo -e "  ${CYAN}4.${NC} Ìº± Seed Database (Run ./test/*.sql)"
    echo -e "  ${CYAN}5.${NC} Ì≥ä List all database tables"
    echo -e "  ${CYAN}6.${NC} Ìª†Ô∏è  Open Interactive SQL Shell (Custom Queries)"
    echo -e "  ${RED}0.${NC} Ì±ã Exit"
    echo -e "--------------------------------------------------"
    echo -ne "Select an option: "
    read -r OPTION

    echo "" # Add a blank line for readability

    case $OPTION in
        1)
            echo -e "${BLUE}Ì¥π Running UP migrations...${NC}"
            for file in $(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*_*.up.sql" | sort); do
                BASENAME=$(basename "$file")
                APPLIED=$(psql "$DB_URL" -tAc "SELECT 1 FROM migration_history WHERE filename='$BASENAME';")
                
                if [ "$APPLIED" = "1" ]; then
                    echo -e "${YELLOW}‚è≠  Skipping $BASENAME (already applied)${NC}"
                    continue
                fi

                if [ "$GLOBAL_CONFIRM" = false ]; then
                    echo -ne "Apply $BASENAME? [y/N]: "
                    read -r CONFIRM
                    [[ ! "$CONFIRM" =~ ^[Yy]$ ]] && continue
                fi

                echo -e "${CYAN}‚û°  Applying $BASENAME...${NC}"
                psql "$DB_URL" -f "$file" > /dev/null
                psql "$DB_URL" -c "INSERT INTO migration_history(filename,direction) VALUES('$BASENAME','UP');" > /dev/null
            done
            echo -e "${GREEN}‚úÖ UP migrations complete!${NC}"
            pause_for_enter
            ;;

        2)
            echo -e "${BLUE}Ì¥π Running DOWN migrations...${NC}"
            for file in $(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*_*.down.sql" | sort -r); do
                BASENAME=$(basename "$file")
                UP_FILE=$(echo "$BASENAME" | sed 's/.down.sql/.up.sql/')
                APPLIED=$(psql "$DB_URL" -tAc "SELECT 1 FROM migration_history WHERE filename='$UP_FILE';")
                
                if [ "$APPLIED" != "1" ]; then
                    echo -e "${YELLOW}‚è≠  Skipping $BASENAME (UP version was not applied)${NC}"
                    continue
                fi

                if [ "$GLOBAL_CONFIRM" = false ]; then
                    echo -ne "${RED}Revert $BASENAME? [y/N]: ${NC}"
                    read -r CONFIRM
                    [[ ! "$CONFIRM" =~ ^[Yy]$ ]] && continue
                fi

                echo -e "${CYAN}‚û°  Reverting $BASENAME...${NC}"
                psql "$DB_URL" -f "$file" > /dev/null
                psql "$DB_URL" -c "DELETE FROM migration_history WHERE filename='$UP_FILE';" > /dev/null
            done
            echo -e "${GREEN}‚úÖ DOWN migrations complete!${NC}"
            pause_for_enter
            ;;

        3)
            echo -e "${BLUE}Ì≥ã Migration Status List${NC}"
            echo -e "--------------------------------------------------"
            
            FILE_LIST=()
            INDEX=1

            for file in $(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*_*.up.sql" | sort); do FILE_LIST+=("$file|UP"); done
            for file in $(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*_*.down.sql" | sort -r); do FILE_LIST+=("$file|DOWN"); done

            for item in "${FILE_LIST[@]}"; do
                FILE=$(echo "$item" | cut -d '|' -f1)
                TYPE=$(echo "$item" | cut -d '|' -f2)
                BASENAME=$(basename "$FILE")

                if [ "$TYPE" = "UP" ]; then
                    APPLIED=$(psql "$DB_URL" -tAc "SELECT 1 FROM migration_history WHERE filename='$BASENAME';")
                    STATUS=$([ "$APPLIED" = "1" ] && echo -e "${GREEN}‚úÖ Applied${NC}" || echo -e "${YELLOW}‚è≥ Pending${NC}")
                else
                    UP_FILE=$(echo "$BASENAME" | sed 's/.down.sql/.up.sql/')
                    APPLIED=$(psql "$DB_URL" -tAc "SELECT 1 FROM migration_history WHERE filename='$UP_FILE';")
                    STATUS=$([ "$APPLIED" = "1" ] && echo -e "${CYAN}ÔøΩÔøΩ Revertable${NC}" || echo -e "${RED}‚õî Blocked${NC}")
                fi
                
                # Align output
                printf "  ${CYAN}%2d)${NC} %-35s [%-4s] - %s\n" "$INDEX" "$BASENAME" "$TYPE" "$STATUS"
                INDEX=$((INDEX+1))
            done

            echo -e "--------------------------------------------------"
            echo -ne "Enter serial numbers to execute (e.g., 1 3 5) or press Enter to cancel: "
            read -r SELECTED

            for num in $SELECTED; do
                IDX=$((num-1))
                ITEM="${FILE_LIST[$IDX]}"
                FILE=$(echo "$ITEM" | cut -d '|' -f1)
                TYPE=$(echo "$ITEM" | cut -d '|' -f2)

                if [ -z "$FILE" ]; then
                    echo -e "${RED}‚ùå Invalid selection: $num${NC}"
                    continue
                fi

                BASENAME=$(basename "$FILE")

                if [ "$TYPE" = "UP" ]; then
                    APPLIED=$(psql "$DB_URL" -tAc "SELECT 1 FROM migration_history WHERE filename='$BASENAME';")
                    if [ "$APPLIED" = "1" ]; then
                        echo -e "${YELLOW}‚è≠  Skipping $BASENAME (already applied)${NC}"
                        continue
                    fi
                    echo -e "${CYAN}‚û°  Applying $BASENAME...${NC}"
                    psql "$DB_URL" -f "$FILE" > /dev/null
                    psql "$DB_URL" -c "INSERT INTO migration_history(filename,direction) VALUES('$BASENAME','UP');" > /dev/null
                else
                    UP_FILE=$(echo "$BASENAME" | sed 's/.down.sql/.up.sql/')
                    APPLIED=$(psql "$DB_URL" -tAc "SELECT 1 FROM migration_history WHERE filename='$UP_FILE';")
                    if [ "$APPLIED" != "1" ]; then
                        echo -e "${YELLOW}‚è≠  Skipping $BASENAME (cannot revert, UP not applied)${NC}"
                        continue
                    fi
                    echo -e "${CYAN}‚û°  Reverting $BASENAME...${NC}"
                    psql "$DB_URL" -f "$FILE" > /dev/null
                    psql "$DB_URL" -c "DELETE FROM migration_history WHERE filename='$UP_FILE';" > /dev/null
                fi
            done
            echo -e "${GREEN}‚úÖ Selected operations finished!${NC}"
            pause_for_enter
            ;;

        4)
            echo -e "${BLUE}Ìº± Running database seeds...${NC}"
            if [ ! -d "$SEEDS_DIR" ] || [ -z "$(find "$SEEDS_DIR" -maxdepth 1 -name "*.sql" -print -quit 2>/dev/null)" ]; then
                echo -e "${YELLOW}‚ö†Ô∏è No .sql seed files found in $SEEDS_DIR!${NC}"
            else
                for file in $(find "$SEEDS_DIR" -maxdepth 1 -name "*.sql" | sort); do
                    BASENAME=$(basename "$file")
                    if [ "$GLOBAL_CONFIRM" = false ]; then
                        echo -ne "Execute seed $BASENAME? [y/N]: "
                        read -r CONFIRM
                        [[ ! "$CONFIRM" =~ ^[Yy]$ ]] && continue
                    fi
                    echo -e "${CYAN}‚û°  Seeding $BASENAME...${NC}"
                    psql "$DB_URL" -f "$file" > /dev/null
                done
                echo -e "${GREEN}‚úÖ Seeding process completed!${NC}"
            fi
            pause_for_enter
            ;;

        5)
            echo -e "${BLUE}Ì≥ä Listing database tables...${NC}"
            echo -e "--------------------------------------------------"
            if [ "$DBMS_PREFIX" = "POSTGRES" ]; then
                psql "$DB_URL" -c "\dt"
            else
                # Fallback query if someone adapts the script's connection layer for MySQL later
                psql "$DB_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' OR table_schema = DATABASE();"
            fi
            pause_for_enter
            ;;

        6)
            echo -e "${BLUE}Ìª†Ô∏è  Opening Interactive SQL Shell...${NC}"
            if [ "$DBMS_PREFIX" = "POSTGRES" ]; then
                echo -e "${YELLOW}Tip: Type '\\q' to exit and return to the menu.${NC}"
                echo -e "--------------------------------------------------"
                psql "$DB_URL"
            else
                echo -e "${YELLOW}Tip: Type 'exit' to exit and return to the menu.${NC}"
                echo -e "--------------------------------------------------"
                mysql "$DB_URL"
            fi
            echo -e "\n${GREEN}‚úÖ Shell closed.${NC}"
            pause_for_enter
            ;;

        0)
            echo -e "${GREEN}Ì±ã Exiting...${NC}"
            exit 0
            ;;

        *)
            echo -e "${RED}‚ùå Invalid option!${NC}"
            sleep 1
            ;;
    esac
done
