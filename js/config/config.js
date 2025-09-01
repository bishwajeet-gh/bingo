const CONFIG = {
    JSONBIN: {
        API_KEY: '$2a$10$au5QUvO96N2h.LhgE898weycIz9GBuIciW5gEhuSkLrqPLeMw6uVO', // Add your JSONBin API key here
        WINNERS_BIN_ID: '68abdf7eae596e708fd46c8e', // Add your winners bin ID
        GAME_DATA_BIN_ID: '68b150d7d0ea881f4069f0e3', // Add your game data bin ID
        PROGRESS_BIN_ID: '68b17be3ae596e708fdae2a6', // Add your progress bin ID
        BASE_URL: 'https://api.jsonbin.io/v3/b',
        USE_MOCK: false, // Default fallback if toggles bin is unavailable
        TOGGLES_BIN_ID: '68b1ab2343b1c97be92f527f', // Add your feature toggles bin ID (expects { "USE_MOCK": boolean })
        SETTINGS_BIN_ID: '68b543c8d0ea881f406db183', // Add your game settings bin ID
        RETRY: {
            MAX_ATTEMPTS: 3,
            DELAY: 1000, // 1 second between retries
            TIMEOUT: 5000 // 5 seconds timeout for requests
        }
    },
    BINGO: {
        BOARD_SIZE: 5, // Default board size - will be overridden by admin settings
        AVAILABLE_SIZES: [3, 4, 5, 6, 7], // Available grid dimensions
        WIN_PATTERNS: [
            // Default 5x5 patterns - will be generated dynamically based on board size
            // Rows
            [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
            // Columns
            [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
            // Diagonals
            [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]
        ]
    },
    UI: {
        CELL_SELECTED_CLASS: 'selected',
        WINNERS_UPDATE_INTERVAL: 120000 // 30 seconds
    }
};

// Function to generate win patterns for any board size
CONFIG.BINGO.generateWinPatterns = function(size) {
    const patterns = [];
    
    // Generate rows
    for (let row = 0; row < size; row++) {
        const rowPattern = [];
        for (let col = 0; col < size; col++) {
            rowPattern.push(row * size + col);
        }
        patterns.push(rowPattern);
    }
    
    // Generate columns
    for (let col = 0; col < size; col++) {
        const colPattern = [];
        for (let row = 0; row < size; row++) {
            colPattern.push(row * size + col);
        }
        patterns.push(colPattern);
    }
    
    // Generate main diagonal (top-left to bottom-right)
    const mainDiagonal = [];
    for (let i = 0; i < size; i++) {
        mainDiagonal.push(i * size + i);
    }
    patterns.push(mainDiagonal);
    
    // Generate anti-diagonal (top-right to bottom-left)
    const antiDiagonal = [];
    for (let i = 0; i < size; i++) {
        antiDiagonal.push(i * size + (size - 1 - i));
    }
    patterns.push(antiDiagonal);
    
    return patterns;
};

// Runtime override helper for mock usage (used by services and dashboards)
window.isMockEnabled = function () {
    try {
        const v = localStorage.getItem('USE_MOCK');
        if (v === 'true') return true;
        if (v === 'false') return false;
    } catch (e) {
        // ignore storage issues
    }
    return CONFIG.JSONBIN.USE_MOCK;
};

// Function to get current board size from settings
window.getCurrentBoardSize = async function() {
    try {
        const jsonBinService = new JsonBinService();
        const settings = await jsonBinService.getGameSettings();
        return settings?.boardSize || CONFIG.BINGO.BOARD_SIZE;
    } catch (error) {
        console.error('Error getting board size:', error);
        return CONFIG.BINGO.BOARD_SIZE;
    }
};
