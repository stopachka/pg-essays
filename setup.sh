#!/usr/bin/env bash
# Setup script for pg-essays repository
# This script checks for and installs required dependencies

set -e

echo "==================================="
echo "pg-essays Setup Script"
echo "==================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track what needs to be installed
MISSING_DEPS=()

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check for macOS
is_macos() {
    [[ "$OSTYPE" == "darwin"* ]]
}

# Function to check for Linux
is_linux() {
    [[ "$OSTYPE" == "linux-gnu"* ]]
}

echo "Checking system dependencies..."
echo ""

# Check for bun
if command_exists bun; then
    echo -e "${GREEN}✓${NC} bun is installed ($(bun --version))"
else
    echo -e "${RED}✗${NC} bun is not installed"
    MISSING_DEPS+=("bun")
fi

# Check for pandoc
if command_exists pandoc; then
    echo -e "${GREEN}✓${NC} pandoc is installed ($(pandoc --version | head -n 1))"
else
    echo -e "${RED}✗${NC} pandoc is not installed"
    MISSING_DEPS+=("pandoc")
fi

# Check for ImageMagick (convert command)
if command_exists convert; then
    echo -e "${GREEN}✓${NC} imagemagick is installed ($(convert --version | head -n 1))"
else
    echo -e "${RED}✗${NC} imagemagick is not installed"
    MISSING_DEPS+=("imagemagick")
fi

# Check for poppler (pdfinfo command)
if command_exists pdfinfo; then
    echo -e "${GREEN}✓${NC} poppler is installed"
else
    echo -e "${RED}✗${NC} poppler is not installed"
    MISSING_DEPS+=("poppler")
fi

# Check for pdflatex (part of basictex)
if command_exists pdflatex; then
    echo -e "${GREEN}✓${NC} pdflatex is installed (LaTeX)"
else
    echo -e "${RED}✗${NC} pdflatex is not installed (basictex)"
    MISSING_DEPS+=("basictex")
fi

# Check for tlmgr (TeX Live Manager)
if command_exists tlmgr; then
    echo -e "${GREEN}✓${NC} tlmgr is installed"
    
    # Check for specific LaTeX packages
    echo ""
    echo "Checking LaTeX packages..."
    LATEX_PACKAGES=("tocloft" "fancyhdr" "titlesec")
    MISSING_LATEX_PACKAGES=()
    
    for pkg in "${LATEX_PACKAGES[@]}"; do
        if tlmgr info "$pkg" --only-installed >/dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} LaTeX package '$pkg' is installed"
        else
            echo -e "${RED}✗${NC} LaTeX package '$pkg' is not installed"
            MISSING_LATEX_PACKAGES+=("$pkg")
        fi
    done
else
    echo -e "${YELLOW}!${NC} tlmgr not available (needed for LaTeX packages)"
fi

echo ""
echo "==================================="

# If there are missing dependencies, provide installation instructions
if [ ${#MISSING_DEPS[@]} -ne 0 ] || [ ${#MISSING_LATEX_PACKAGES[@]} -ne 0 ]; then
    echo ""
    echo -e "${YELLOW}Missing dependencies detected!${NC}"
    echo ""
    
    if is_macos; then
        echo "Installation instructions for macOS:"
        echo ""
        
        if [[ " ${MISSING_DEPS[@]} " =~ " bun " ]]; then
            echo "Install bun:"
            echo "  curl -fsSL https://bun.sh/install | bash"
            echo ""
        fi
        
        if [ ${#MISSING_DEPS[@]} -gt 1 ] || [[ ! " ${MISSING_DEPS[@]} " =~ " bun " ]]; then
            if ! command_exists brew; then
                echo -e "${RED}Homebrew is not installed!${NC}"
                echo "Please install Homebrew first:"
                echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
                echo ""
            fi
            
            BREW_PACKAGES=()
            for dep in "${MISSING_DEPS[@]}"; do
                if [ "$dep" != "bun" ]; then
                    BREW_PACKAGES+=("$dep")
                fi
            done
            
            if [ ${#BREW_PACKAGES[@]} -gt 0 ]; then
                echo "Install via Homebrew:"
                echo "  brew install ${BREW_PACKAGES[*]}"
                echo ""
            fi
        fi
        
        if [ ${#MISSING_LATEX_PACKAGES[@]} -ne 0 ]; then
            echo "Install LaTeX packages:"
            echo "  sudo tlmgr install ${MISSING_LATEX_PACKAGES[*]}"
            echo ""
        fi
        
    elif is_linux; then
        echo "Installation instructions for Linux:"
        echo ""
        
        if [[ " ${MISSING_DEPS[@]} " =~ " bun " ]]; then
            echo "Install bun:"
            echo "  curl -fsSL https://bun.sh/install | bash"
            echo ""
        fi
        
        echo "Install other dependencies (Ubuntu/Debian):"
        APT_PACKAGES=()
        for dep in "${MISSING_DEPS[@]}"; do
            case "$dep" in
                pandoc) APT_PACKAGES+=("pandoc") ;;
                imagemagick) APT_PACKAGES+=("imagemagick") ;;
                poppler) APT_PACKAGES+=("poppler-utils") ;;
                basictex) APT_PACKAGES+=("texlive-latex-base" "texlive-latex-extra") ;;
            esac
        done
        
        if [ ${#APT_PACKAGES[@]} -gt 0 ]; then
            echo "  sudo apt-get update"
            echo "  sudo apt-get install ${APT_PACKAGES[*]}"
            echo ""
        fi
        
        if [ ${#MISSING_LATEX_PACKAGES[@]} -ne 0 ]; then
            echo "Install LaTeX packages:"
            echo "  sudo tlmgr install ${MISSING_LATEX_PACKAGES[*]}"
            echo ""
        fi
    else
        echo "Please manually install the missing dependencies for your system."
        echo ""
    fi
    
    echo "After installing system dependencies, run this script again."
    exit 1
fi

# Install npm/bun dependencies
echo ""
echo "Installing JavaScript dependencies..."
if command_exists bun; then
    bun install
    echo -e "${GREEN}✓${NC} Dependencies installed successfully"
else
    echo -e "${RED}✗${NC} Cannot install dependencies: bun not found"
    exit 1
fi

echo ""
echo "==================================="
echo -e "${GREEN}Setup complete!${NC}"
echo "==================================="
echo ""
echo "You can now run the tool:"
echo "  bun run cli.ts --essay progbot    # Build a specific essay"
echo "  bun run cli.ts --book vol1        # Build a specific volume"
echo "  bun run cli.ts --cover vol1       # Check out a cover"
echo "  bun run cli.ts                    # Process all books"
echo ""
