class BingoBoard {
    constructor(tasks, playerName) {
        this.playerName = playerName;
        this.storageKey = `bingo_state_${playerName}`;
        this.tasks = tasks;
        this.selectedCells = new Set();
        this.bingoCount = 0;
        this.lastBingoCount = 0; // Track previous bingo count for celebration
        this.notesByIndex = {}; // { [index]: string }
        this.boardSize = CONFIG.BINGO.BOARD_SIZE; // Initialize with default
        this.winPatterns = CONFIG.BINGO.WIN_PATTERNS; // Initialize with default

        // Initialize board immediately with default state
        this.initializeBoard(tasks);
    }

    // Calculate dynamic cell size based on board size
    calculateCellSize() {
        const baseSize = {
            gap: 0.15, // rem - reduced from 0.25
            padding: 0.3, // rem - reduced from 0.5
            fontSize: {
                min: 0.55, // rem - reduced from 0.65
                max: 0.85   // rem - reduced from 1.2
            },
            cellPadding: {
                min: 0.2,  // rem - reduced from 0.3
                max: 0.5   // rem - reduced from 0.7
            },
            borderRadius: {
                min: 0.3,  // rem - reduced from 0.4
                max: 0.6   // rem - reduced from 0.8
            }
        };

        // More aggressive scale factor for smaller cells
        const scaleFactor = Math.max(0.5, Math.min(1.0, 4.5 / this.boardSize));
        
        return {
            gap: `${baseSize.gap * scaleFactor}rem`,
            padding: `${baseSize.padding * scaleFactor}rem`,
            fontSize: `clamp(${baseSize.fontSize.min * scaleFactor}rem, ${0.8 + (scaleFactor - 1) * 0.3}vw, ${baseSize.fontSize.max * scaleFactor}rem)`,
            cellPadding: `${Math.max(baseSize.cellPadding.min, baseSize.cellPadding.max * scaleFactor)}rem`,
            borderRadius: `${Math.max(baseSize.borderRadius.min, baseSize.borderRadius.max * scaleFactor)}rem`,
            lineClamp: this.boardSize <= 5 ? 2 : (this.boardSize <= 7 ? 1 : 1) // More aggressive line clamping
        };
    }

    // Apply dynamic styles to the board
    applyDynamicStyles() {
        const cellSize = this.calculateCellSize();
        const boardElement = document.querySelector('.bingo-board');
        const cellElements = document.querySelectorAll('.bingo-cell');

        if (boardElement) {
            boardElement.style.gap = cellSize.gap;
            boardElement.style.padding = cellSize.padding;
            
            // More compact board sizing
            const containerPadding = 550; // Reduced from 600
            const availableSpace = `min(95%, calc(100vh - 120px), calc(100vw - ${containerPadding}px))`;
            
            // Smaller minimum size based on board size
            const minSize = Math.max(280, 320 - (this.boardSize - 5) * 15);
            
            boardElement.style.maxWidth = availableSpace;
            boardElement.style.maxHeight = availableSpace;
            boardElement.style.minWidth = `${minSize}px`;
            boardElement.style.minHeight = `${minSize}px`;
        }

        cellElements.forEach(cell => {
            cell.style.fontSize = cellSize.fontSize;
            cell.style.padding = cellSize.cellPadding;
            cell.style.borderRadius = cellSize.borderRadius;
            cell.style.webkitLineClamp = cellSize.lineClamp;
            cell.style.lineHeight = '1.1'; // Tighter line height for more compact text
            cell.style.borderWidth = this.boardSize > 7 ? '1px' : '2px'; // Thinner borders for larger grids
        });
    }

    async initializeBoard(tasks) {
        // Get the current board size from settings
        this.boardSize = await window.getCurrentBoardSize();
        this.winPatterns = CONFIG.BINGO.generateWinPatterns(this.boardSize);

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
            // Check if saved state matches current board size
            const savedBoardSize = savedState.boardSize || 5;
            if (savedBoardSize !== this.boardSize) {
                // Board size changed, reset the board
                console.log(`Board size changed from ${savedBoardSize} to ${this.boardSize}, resetting board`);
                this.tasks = this.shuffleArray([...tasks]).slice(0, this.boardSize * this.boardSize);
                this.selectedCells = new Set();
                this.bingoCount = 0;
                this.notesByIndex = {};
            } else {
                this.tasks = savedState.tasks;
                this.selectedCells = new Set(savedState.selectedCells);
                this.bingoCount = savedState.bingoCount;
                this.notesByIndex = savedState.notesByIndex || {};
            }

            // Update local storage with the most recent state
            await this.saveState();

            // Update winners if we have a cloud state
            if (cloudState && this.bingoCount > 0) {
                $(document).trigger('bingoCountUpdated', [this.bingoCount]);
            }
        } else {
            this.tasks = this.shuffleArray([...tasks]).slice(0, this.boardSize * this.boardSize);
            this.selectedCells = new Set();
            this.bingoCount = 0;
            this.notesByIndex = {};
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
                notesByIndex: this.notesByIndex,
                boardSize: this.boardSize, // Save board size with state
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

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    render() {
        $('#bingoBoard').empty();
        const board = $('<div>')
            .addClass('bingo-board')
            .attr('data-board-size', this.boardSize) // Add data attribute for CSS styling
            .css('grid-template-columns', `repeat(${this.boardSize}, 1fr)`);
            
        const totalCells = this.boardSize * this.boardSize;
        for (let i = 0; i < totalCells; i++) {
            const cell = $('<div>')
                .addClass('bingo-cell')
                .attr('data-index', i)
                .text(this.tasks[i] || `Cell ${i + 1}`)
                .on('click', () => this.toggleCell(i));

            if (this.selectedCells.has(i)) {
                cell.addClass(CONFIG.UI.CELL_SELECTED_CLASS);
            }

            board.append(cell);
        }
        $('#bingoBoard').append(board);

        // Apply dynamic styles after rendering
        this.applyDynamicStyles();

        return board;
    }

    updateUI() {
        const selectedCount = this.selectedCells.size;
        const totalCells = this.boardSize * this.boardSize;
        const percentage = Math.round((selectedCount / totalCells) * 100);
        
        // Update completion status
        const completionStatus = document.getElementById('completionStatus');
        if (completionStatus) {
            completionStatus.textContent = `${selectedCount} of ${totalCells} squares completed`;
        }
        
        // Update progress bar
        const progressFill = document.getElementById('progressFill');
        const progressPercent = document.getElementById('progressPercent');
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
        if (progressPercent) {
            progressPercent.textContent = `${percentage}%`;
        }
        
        // Update quick stats
        const statCompleted = document.getElementById('statCompleted');
        const statProgress = document.getElementById('statProgress');
        if (statCompleted) {
            statCompleted.textContent = `${selectedCount}/${totalCells}`;
        }
        if (statProgress) {
            statProgress.textContent = `${percentage}%`;
        }
        
        // Check for bingos and update stats
        const bingos = this.checkForBingo();
        const statBingos = document.getElementById('statBingos');
        if (statBingos) {
            statBingos.textContent = bingos.length;
        }
        
        // Trigger events for the main game to handle
        const bingoBoard = document.getElementById('bingoBoard');
        if (bingoBoard) {
            bingoBoard.dispatchEvent(new CustomEvent('progressUpdate', {
                detail: {
                    selectedCount,
                    totalCells,
                    percentage,
                    bingos: bingos.length
                }
            }));
        }
        
        // Check for new bingos and celebrate
        if (bingos.length > this.lastBingoCount) {
            this.celebrateBingo();
            this.lastBingoCount = bingos.length;
        }
    }

    toggleCell(index) {
        const cell = $(`.bingo-cell[data-index="${index}"]`);
        const wasSelected = this.selectedCells.has(index);
        
        if (wasSelected) {
            // Deselecting a cell - immediate action
            this.selectedCells.delete(index);
            cell.removeClass(CONFIG.UI.CELL_SELECTED_CLASS);
            
            // Update UI and save immediately for deselection
            this.updateCompletionStatus();
            this.checkBingo();
            this.triggerUIUpdates(wasSelected, false);
            this.saveState();
        } else {
            // Selecting a cell - show modal first, mark cell after modal interaction
            const title = this.tasks[index] || `Cell ${index + 1}`;
            $(document).trigger('openNoteForCell', [{ 
                index, 
                title, 
                existing: this.notesByIndex[index] || '',
                onComplete: (saved) => this.completeCellSelection(index, saved)
            }]);
        }
    }

    // New method to complete cell selection after modal interaction
    completeCellSelection(index, saved) {
        if (!saved) {
            // Modal was dismissed without saving - don't select the cell
            return;
        }

        const cell = $(`.bingo-cell[data-index="${index}"]`);
        
        // Now mark the cell as selected
        this.selectedCells.add(index);
        cell.addClass(CONFIG.UI.CELL_SELECTED_CLASS);
        
        // Add selection animation
        cell.addClass('cell-select-animation');
        setTimeout(() => cell.removeClass('cell-select-animation'), 300);

        // Update UI and save state
        this.updateCompletionStatus();
        this.checkBingo();
        this.triggerUIUpdates(false, true);
        this.saveState();
    }

    // Helper method to update completion status
    updateCompletionStatus() {
        const totalCells = this.boardSize * this.boardSize;
        const completedCells = this.selectedCells.size;
        $('#completionStatus').text(`${completedCells} of ${totalCells} squares completed`);
    }

    // Helper method to trigger UI updates
    triggerUIUpdates(wasSelected, newlySelected) {
        const totalCells = this.boardSize * this.boardSize;
        const completedCells = this.selectedCells.size;
        
        $(document).trigger('cellToggled', {
            completed: completedCells,
            total: totalCells,
            bingoCount: this.bingoCount,
            wasSelected,
            newlySelected
        });
    }

    checkForBingo() {
        let bingoPatterns = [];
        this.winPatterns.forEach((pattern, index) => {
            if (pattern.every(cellIndex => this.selectedCells.has(cellIndex))) {
                bingoPatterns.push(index);
            }
        });
        return bingoPatterns;
    }

    celebrateBingo() {
        // Show celebration overlay
        const overlay = document.getElementById('celebrationOverlay');
        if (overlay) {
            overlay.classList.add('show');
            
            // Create confetti effect
            this.createConfetti();
            
            // Hide overlay after 3 seconds
            setTimeout(() => {
                overlay.classList.remove('show');
            }, 3000);
        }
        
        // Add celebration animation to the board
        const board = document.getElementById('bingoBoard');
        if (board) {
            board.classList.add('celebration-glow');
            setTimeout(() => {
                board.classList.remove('celebration-glow');
            }, 2000);
        }
    }
    
    createConfetti() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];
        const confettiCount = 50;
        
        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.style.cssText = `
                position: fixed;
                width: 10px;
                height: 10px;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                left: ${Math.random() * 100}vw;
                top: -10px;
                z-index: 10001;
                border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
                animation: confetti-fall ${2 + Math.random() * 3}s linear forwards;
                transform: rotate(${Math.random() * 360}deg);
            `;
            
            document.body.appendChild(confetti);
            
            // Remove confetti after animation
            setTimeout(() => {
                if (confetti.parentNode) {
                    confetti.parentNode.removeChild(confetti);
                }
            }, 5000);
        }
    }

    checkBingo() {
        let bingoCount = 0;
        this.winPatterns.forEach(pattern => {
            if (pattern.every(index => this.selectedCells.has(index))) {
                bingoCount++;
            }
        });
        this.bingoCount = bingoCount;
        $(document).trigger('bingoCountUpdated', [bingoCount]);
    }

    async resetBoard() {
        // Get current board size in case it changed
        this.boardSize = await window.getCurrentBoardSize();
        this.winPatterns = CONFIG.BINGO.generateWinPatterns(this.boardSize);
        
        // Clear all selected cells
        this.selectedCells.clear();
        this.bingoCount = 0;
        this.notesByIndex = {};

        // Re-shuffle tasks for a fresh board with correct size
        const totalCells = this.boardSize * this.boardSize;
        this.tasks = this.shuffleArray([...this.tasks]).slice(0, totalCells);

        // Re-render the board
        this.render();
        this.updateUI();

        // Save the reset state locally
        await this.saveState();

        // Sync the reset to the cloud to ensure complete reset
        try {
            const jsonBinService = new JsonBinService();
            
            // Remove the user's progress from cloud
            const allProgress = await jsonBinService.getAllProgress();
            if (allProgress[this.playerName]) {
                delete allProgress[this.playerName];
                
                // Save updated progress (without this user)
                const response = await jsonBinService.fetchWithRetry(
                    `${jsonBinService.baseUrl}/${CONFIG.JSONBIN.PROGRESS_BIN_ID}`,
                    {
                        method: 'PUT',
                        body: JSON.stringify(allProgress)
                    }
                );
            }
            
            // Remove user from winners list if they were there
            const { winners } = await jsonBinService.getWinners();
            const updatedWinners = winners.filter(w => w.name !== this.playerName);
            if (updatedWinners.length !== winners.length) {
                await jsonBinService.updateWinners({ winners: updatedWinners });
            }
        } catch (error) {
            console.error('Error syncing board reset to cloud:', error);
        }

        // Trigger winners update to reflect the reset
        $(document).trigger('winnersUpdated');
    }

    setNote(index, text) {
        if (typeof index !== 'number') return;
        if (text && text.trim().length > 0) {
            this.notesByIndex[index] = text.trim();
        } else {
            delete this.notesByIndex[index];
        }
        this.saveState();
    }

    getNote(index) {
        return this.notesByIndex[index] || '';
    }
}
