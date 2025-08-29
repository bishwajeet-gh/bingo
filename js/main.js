class BingoGame {
    constructor() {
        this.jsonBinService = new JsonBinService();
        this.currentPlayer = '';
        this.bingoBoard = null;
        this.authorizedUsers = [];
        this.cachedGameData = null;
        this.initializeGame();
    }

    async initializeGame() {
        try {
            this.cachedGameData = await this.jsonBinService.getGameData();
            this.authorizedUsers = this.cachedGameData.users;
            await this.updateWinnersList();
            this.setupEventListeners();

            // Start periodic winners update
            setInterval(() => this.updateWinnersList(), CONFIG.UI.WINNERS_UPDATE_INTERVAL);

            // Show login modal after a short delay to ensure Bootstrap is fully loaded
            setTimeout(() => {
                this.showLoginModal();
            }, 500);
        } catch (error) {
            console.error('Error initializing game:', error);
        }
    }

    showLoginModal() {
        const modalElement = document.getElementById('playerLoginModal');
        if (!modalElement) {
            console.error('Login modal element not found');
            return;
        }

        let loginModal = bootstrap.Modal.getInstance(modalElement);
        if (!loginModal) {
            loginModal = new bootstrap.Modal(modalElement, {
                backdrop: 'static',
                keyboard: false
            });
        }
        loginModal.show();
    }

    validatePlayer(name) {
        const trimmed = name.trim();
        if (!trimmed) return false;
        if (!Array.isArray(this.authorizedUsers) || this.authorizedUsers.length === 0) {
            return true;
        }
        return this.authorizedUsers.some(user =>
            (user).toLowerCase() === trimmed.toLowerCase()
        );
    }

    async setupNewBoard(tasks) {
        $('#bingoBoard').empty();
        this.bingoBoard = new BingoBoard(tasks, this.currentPlayer);
    }

    async updateWinnersList() {
        const winnersList = $('#winnersList');
        winnersList.empty();

        try {
            const response = await this.jsonBinService.getWinners();
            const winners = (response && Array.isArray(response.winners)) ? [...response.winners] : [];

            // In mock mode, merge localStorage progress so winners display without cloud writes
            if (CONFIG.JSONBIN.USE_MOCK) {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('bingo_state_')) {
                        const name = key.replace('bingo_state_', '');
                        try {
                            const state = JSON.parse(localStorage.getItem(key));
                            const count = state && typeof state.bingoCount === 'number' ? state.bingoCount : 0;
                            if (count > 0) {
                                const existing = winners.find(w => w.name === name);
                                if (existing) {
                                    if (count > existing.score) existing.score = count;
                                } else {
                                    winners.push({ name, score: count });
                                }
                            }
                        } catch (_) { /* ignore broken entries */ }
                    }
                }
            }

            if (!winners.length) {
                winnersList.html('<div class="no-winners">No winners yet. Be the first!</div>');
                return;
            }

            winners
                .sort((a, b) => b.score - a.score)
                .forEach(winner => {
                    winnersList.append(`
                        <div class="winner-item">
                            <span class="winner-name">${winner.name}</span>
                            <span class="winner-score">${winner.score} BINGOs</span>
                        </div>
                    `);
                });
        } catch (error) {
            console.error('Error updating winners list:', error);
            winnersList.html('<div class="no-winners">Unable to load winners. Please try again later.</div>');
        }
    }

    // Removed unused updateWinner method

    setupEventListeners() {
        $('#startGameBtn').on('click', async () => {
            const playerName = $('#playerNameInput').val().trim();

            // Refresh game data and authorized users right before validation
            try {
                const latestGameData = await this.jsonBinService.getGameData();
                this.authorizedUsers = Array.isArray(latestGameData.users) ? latestGameData.users : [];
            } catch (_) { /* keep existing authorizedUsers on failure */ }

            if (this.validatePlayer(playerName)) {
                this.currentPlayer = playerName;
                $('#currentPlayer').text(playerName);

                // Use cached game data (fallback to fetch if missing)
                const gameData = this.cachedGameData || await this.jsonBinService.getGameData();
                await this.setupNewBoard(gameData.tasks);

                // Update winners list
                await this.updateWinnersList();

                // Hide login modal
                const loginModal = bootstrap.Modal.getInstance(document.getElementById('playerLoginModal'));
                loginModal.hide();
            } else {
                // Show error styles
                $('#playerNameInput').addClass('is-invalid');

                // Show error modal
                setTimeout(() => {
                    const errorModal = new bootstrap.Modal(document.getElementById('errorModal'));
                    errorModal.show();
                }, 500);
            }
        });

        $('#playerNameInput').on('input', function () {
            $(this).removeClass('is-invalid');
        });

        // Do not auto-save to cloud on bingo updates; just refresh the winners list view
        $(document).on('bingoCountUpdated', async () => {
            await this.updateWinnersList();
        });

        // Open Note modal when a cell is newly selected
        $(document).on('openNoteForCell', (_, payload) => {
            const { index, title, existing } = payload || {};
            if (typeof index !== 'number') return;

            $('#noteModalLabel').text(title || 'Add Notes');
            $('#noteText').val(existing || '');
            $('#saveNoteBtn').data('cell-index', index);

            const modalElement = document.getElementById('noteModal');
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
        });

        // Save note from modal to local state
        $('#saveNoteBtn').on('click', () => {
            const index = $('#saveNoteBtn').data('cell-index');
            const text = $('#noteText').val();
            if (this.bingoBoard && typeof index === 'number') {
                this.bingoBoard.setNote(index, text);
            }
            const modalElement = document.getElementById('noteModal');
            const modal = bootstrap.Modal.getInstance(modalElement);
            if (modal) modal.hide();
        });

        // Listen for winners list updates (triggered after manual sync)
        $(document).on('winnersUpdated', async () => {
            await this.updateWinnersList();
        });

        // Handle manual sync button click
        $('#syncProgress').on('click', async () => {
            const syncButton = $('#syncProgress');
            syncButton.prop('disabled', true);
            syncButton.find('.icon').addClass('syncing');

            // Safety timeout to ensure UI is restored even if something hangs
            const originalText = syncButton.html();
            const safetyTimer = setTimeout(() => {
                try {
                    syncButton.find('.icon').removeClass('syncing');
                    syncButton.prop('disabled', false);
                    syncButton.html(originalText);
                } catch (_) { /* no-op */ }
            }, 20000); // 20s hard cap

            try {
                const success = await this.bingoBoard.syncToCloud();

                if (success) {
                    syncButton.html('<span class="icon">✓</span> Progress Synced!');
                } else {
                    syncButton.html('<span class="icon">⚠️</span> Sync Failed');
                }

                setTimeout(() => {
                    syncButton.prop('disabled', false);
                    syncButton.html(originalText);
                }, 3000);
            } catch (error) {
                console.error('Sync error:', error);
                syncButton.html('<span class="icon">⚠️</span> Sync Failed');
                setTimeout(() => {
                    syncButton.prop('disabled', false);
                    syncButton.html('<span class="icon">↻</span> Sync Progress');
                }, 3000);
            } finally {
                clearTimeout(safetyTimer);
                syncButton.find('.icon').removeClass('syncing');
            }
        });

        // Handle reset board button click
        $('#resetBoard').on('click', async () => {
            if (confirm('Are you sure you want to reset your board? This will clear all your progress.')) {
                if (this.bingoBoard) {
                    await this.bingoBoard.resetBoard();
                }
            }
        });
    }
}

// Initialize the game when document is ready
$(document).ready(() => {
    new BingoGame();
});
