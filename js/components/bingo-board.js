class BingoBoard {
    constructor(tasks, playerName) {
        this.playerName = playerName;
        this.storageKey = `bingo_state_${playerName}`;
        this.tasks = tasks;
        this.selectedCells = new Set();
        this.bingoCount = 0;

        // Initialize board immediately with default state
        this.initializeBoard(tasks);
    }

    async initializeBoard(tasks) {
        // Try to load existing state from JSONBin first
        const jsonBinService = new JsonBinService();
        const cloudState = await jsonBinService.getPlayerProgress(this.playerName);

        // Get local state
        const localState = localStorage.getItem(this.storageKey);
        const parsedLocalState = localState ? JSON.parse(localState) : null;

        // Compare timestamps and use the most recent state
        let savedState = null;
        if (cloudState && parsedLocalState) {
            const cloudDate = new Date(cloudState.lastSynced);
            const localDate = new Date(parsedLocalState.lastSynced);
            savedState = cloudDate > localDate ? cloudState : parsedLocalState;
        } else {
            savedState = cloudState || parsedLocalState;
        }

        if (savedState) {
            this.tasks = savedState.tasks;
            this.selectedCells = new Set(savedState.selectedCells);
            this.bingoCount = savedState.bingoCount;

            // Update local storage with the most recent state
            localStorage.setItem(this.storageKey, JSON.stringify(savedState));

            // Update winners if we have a cloud state
            if (cloudState && this.bingoCount > 0) {
                $(document).trigger('bingoCountUpdated', [this.bingoCount]);
            }
        } else {
            this.tasks = this.shuffleArray([...tasks]);
            this.selectedCells = new Set();
            this.bingoCount = 0;
            await this.saveState();
        }

        // Re-render the board with the loaded state
        this.render();
        this.updateUI();

        // Removed UI update for last sync time (element not present)
    }

    async saveState() {
        try {
            const state = {
                tasks: this.tasks,
                selectedCells: Array.from(this.selectedCells),
                bingoCount: this.bingoCount,
                lastSynced: new Date().toISOString()
            };

            // Save only to localStorage
            localStorage.setItem(this.storageKey, JSON.stringify(state));
            return true;
        } catch (error) {
            console.error('Error saving state:', error);
            return false;
        }
    }

    async syncToCloud() {
        try {
            const state = JSON.parse(localStorage.getItem(this.storageKey));
            if (!state) return false;

            const jsonBinService = new JsonBinService();

            // First sync the board state
            state.lastSynced = new Date().toISOString();
            const progressSaved = await jsonBinService.savePlayerProgress(this.playerName, state);

            // Then sync the winners if we have any bingos
            if (progressSaved && this.bingoCount > 0) {
                const { winners } = await jsonBinService.getWinners();
                const existingWinner = winners.find(w => w.name === this.playerName);

                if (existingWinner) {
                    if (this.bingoCount > existingWinner.score) {
                        existingWinner.score = this.bingoCount;
                        await jsonBinService.updateWinners({ winners });
                    }
                } else {
                    winners.push({ name: this.playerName, score: this.bingoCount });
                    await jsonBinService.updateWinners({ winners });
                }

                // Update winners list in UI
                $(document).trigger('winnersUpdated');
            }

            // Update local storage with synced timestamp
            localStorage.setItem(this.storageKey, JSON.stringify(state));

            return progressSaved;
        } catch (error) {
            console.error('Error syncing to cloud:', error);
            $(document).trigger('progressSaved', [false]);
            return false;
        }
    }

    // Removed unused loadState method

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    render() {
        $('#bingoBoard').empty();
        const board = $('<div>').addClass('bingo-board');
        for (let i = 0; i < CONFIG.BINGO.BOARD_SIZE * CONFIG.BINGO.BOARD_SIZE; i++) {
            const cell = $('<div>')
                .addClass('bingo-cell')
                .attr('data-index', i)
                .text(this.tasks[i])
                .on('click', () => this.toggleCell(i));

            if (this.selectedCells.has(i)) {
                cell.addClass(CONFIG.UI.CELL_SELECTED_CLASS);
            }

            board.append(cell);
        }
        $('#bingoBoard').append(board);
        return board;
    }

    updateUI() {
        // Update completion status
        const totalCells = CONFIG.BINGO.BOARD_SIZE * CONFIG.BINGO.BOARD_SIZE;
        const completedCells = this.selectedCells.size;
        $('#completionStatus').text(`${completedCells} of ${totalCells} squares completed`);

        // Update cells
        this.selectedCells.forEach(index => {
            $(`.bingo-cell[data-index="${index}"]`).addClass(CONFIG.UI.CELL_SELECTED_CLASS);
        });
    }

    toggleCell(index) {
        const cell = $(`.bingo-cell[data-index="${index}"]`);
        if (this.selectedCells.has(index)) {
            this.selectedCells.delete(index);
            cell.removeClass(CONFIG.UI.CELL_SELECTED_CLASS);
        } else {
            this.selectedCells.add(index);
            cell.addClass(CONFIG.UI.CELL_SELECTED_CLASS);
        }

        // Update completion status
        const totalCells = CONFIG.BINGO.BOARD_SIZE * CONFIG.BINGO.BOARD_SIZE;
        const completedCells = this.selectedCells.size;
        $('#completionStatus').text(`${completedCells} of ${totalCells} squares completed`);

        this.checkBingo();
        this.saveState(); // Only saves to localStorage
    }

    checkBingo() {
        let bingoCount = 0;
        CONFIG.BINGO.WIN_PATTERNS.forEach(pattern => {
            if (pattern.every(index => this.selectedCells.has(index))) {
                bingoCount++;
            }
        });
        this.bingoCount = bingoCount;
        $(document).trigger('bingoCountUpdated', [bingoCount]);
    }

    async resetBoard() {
        // Clear all selected cells
        this.selectedCells.clear();
        this.bingoCount = 0;

        // Re-shuffle tasks for a fresh board
        this.tasks = this.shuffleArray([...this.tasks]);

        // Re-render the board
        this.render();
        this.updateUI();

        // Save the reset state
        await this.saveState();

        // Trigger winners update to reflect the reset
        $(document).trigger('winnersUpdated');
    }
}
