class BingoGame {
    constructor() {
        this.jsonBinService = new JsonBinService();
        this.currentPlayer = '';
        this.bingoBoard = null;
        this.authorizedUsers = [];
        this.cachedGameData = null;
        this.playerStorageKey = 'bingo_current_player'; // Key for storing current logged in player
        this.lastBingoCount = 0; // Track previous bingo count for celebration
        this.themeStorageKey = 'bingo_theme_preference'; // Key for storing theme preference
        this.initializeGame();
        this.initializeTheme();
    }

    async initializeGame() {
        try {
            this.cachedGameData = await this.jsonBinService.getGameData();
            this.authorizedUsers = this.cachedGameData.users;
            await this.updateWinnersList();
            this.setupEventListeners();
            this.setupUIEnhancements(); // Add UI enhancements

            // Start periodic winners update
            setInterval(() => this.updateWinnersList(), CONFIG.UI.WINNERS_UPDATE_INTERVAL);

            // Check if user is already logged in
            await this.checkExistingLogin();
        } catch (error) {
            console.error('Error initializing game:', error);
        }
    }

    // Initialize theme management
    initializeTheme() {
        // Check for saved theme preference or default to dark mode
        const savedTheme = localStorage.getItem(this.themeStorageKey) || 'dark';
        this.setTheme(savedTheme);
        
        // Setup theme toggle button
        $('#themeToggle').on('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            this.setTheme(newTheme);
        });
    }

    // Set theme and update UI
    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(this.themeStorageKey, theme);
        
        // Update toggle button icon and tooltip
        const toggleBtn = $('#themeToggle');
        const icon = toggleBtn.find('i');
        
        if (theme === 'dark') {
            icon.removeClass('fa-moon').addClass('fa-sun');
            toggleBtn.attr('title', 'Switch to Light Mode');
        } else {
            icon.removeClass('fa-sun').addClass('fa-moon');
            toggleBtn.attr('title', 'Switch to Dark Mode');
        }
    }

    async checkExistingLogin() {
        try {
            // Check if there's a saved player in localStorage
            const savedPlayer = localStorage.getItem(this.playerStorageKey);
            
            if (savedPlayer) {
                // Validate the saved player is still authorized
                const trimmedName = savedPlayer.trim();
                
                // Refresh authorization list before validating
                try {
                    const latestGameData = await this.jsonBinService.getGameData();
                    this.authorizedUsers = Array.isArray(latestGameData.users) ? latestGameData.users : [];
                } catch (_) { /* keep existing authorizedUsers on failure */ }
                
                if (this.validatePlayer(trimmedName)) {
                    // Auto-login the saved player
                    this.currentPlayer = trimmedName;
                    $('#currentPlayer').text(trimmedName);

                    // Use cached game data to setup the board
                    const gameData = this.cachedGameData || await this.jsonBinService.getGameData();
                    await this.setupNewBoard(gameData.tasks);

                    // Update winners list
                    await this.updateWinnersList();
                    
                    console.log(`Auto-logged in user: ${trimmedName}`);
                    return; // Skip showing login modal
                } else {
                    // Saved player is no longer authorized, clear the storage
                    localStorage.removeItem(this.playerStorageKey);
                    console.log(`Saved player '${trimmedName}' is no longer authorized, requiring re-login`);
                }
            }
            
            // No saved player or player not authorized, show login modal
            setTimeout(() => {
                this.showLoginModal();
            }, 500);
            
        } catch (error) {
            console.error('Error checking existing login:', error);
            // On error, show login modal as fallback
            setTimeout(() => {
                this.showLoginModal();
            }, 500);
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
        
        // Wait for the board to fully initialize before updating stats
        // The BingoBoard constructor is async via initializeBoard, so we need to wait
        setTimeout(() => {
            if (this.bingoBoard) {
                const totalCells = this.bingoBoard.boardSize * this.bingoBoard.boardSize;
                const completedCells = this.bingoBoard.selectedCells.size;
                const bingoCount = this.bingoBoard.bingoCount;
                
                // Update all UI elements with current state
                this.updateQuickStats(bingoCount, completedCells, totalCells);
                this.updateProgressBar(completedCells, totalCells);
                this.lastBingoCount = bingoCount;
            }
        }, 100);
    }

    async updateWinnersList() {
        const winnersList = $('#winnersList');
        
        // Don't show loading if we're already showing content
        if (!winnersList.find('.loading-winners').length && !winnersList.find('.no-winners').length) {
            // Winners already loaded, just update
        } else {
            // Clear any existing content and show loading
            winnersList.html(`
                <div class="loading-winners">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading leaderboard...</p>
                </div>
            `);
        }

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

            // Clear loading and show results
            winnersList.empty();

            if (!winners.length) {
                winnersList.html(`
                    <div class="no-winners">
                        <i class="fas fa-medal"></i>
                        <p>No winners yet.</p>
                        <span>Be the first to achieve BINGO!</span>
                    </div>
                `);
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
            winnersList.html(`
                <div class="no-winners">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Unable to load winners.</p>
                    <span>Please try again later.</span>
                </div>
            `);
        }
    }

    setupUIEnhancements() {
        // Initialize progress bar
        this.updateProgressBar(0, 25);
        
        // Add keyboard shortcuts (removed fullscreen)
        $(document).on('keydown', (e) => {
            if (e.key === 'Escape' && $('.celebration-overlay').hasClass('show')) {
                this.hideCelebration();
            }
            // Add theme toggle shortcut (Ctrl/Cmd + Shift + T)
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
                e.preventDefault();
                $('#themeToggle').trigger('click');
            }
        });
    }

    updateProgressBar(completed, total) {
        const percentage = Math.round((completed / total) * 100);
        $('#progressFill').css('width', `${percentage}%`);
        $('#statCompleted').text(completed);
        $('#statProgress').text(`${percentage}%`);
    }

    updateQuickStats(bingoCount, completed, total) {
        $('#statBingos').text(bingoCount);
        $('#statCompleted').text(completed);
        const percentage = Math.round((completed / total) * 100);
        $('#statProgress').text(`${percentage}%`);
        
        // Show stats bar when logged in
        $('#quickStats').fadeIn();
    }

    showCelebration() {
        const overlay = $('#celebrationOverlay'); // Changed from congratulationsOverlay to celebrationOverlay
        overlay.addClass('show');
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            this.hideCelebration();
        }, 3000);
        
        // Add confetti effect (optional)
        this.addConfettiEffect();
    }

    hideCelebration() {
        $('#celebrationOverlay').removeClass('show'); // Changed from congratulationsOverlay to celebrationOverlay
    }

    addConfettiEffect() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffd93d', '#6c5ce7'];
        
        for (let i = 0; i < 30; i++) {
            setTimeout(() => {
                const confetti = $('<div class="confetti-particle"></div>');
                confetti.css({
                    position: 'fixed',
                    left: Math.random() * window.innerWidth + 'px',
                    top: '-10px',
                    width: '8px',
                    height: '8px',
                    backgroundColor: colors[Math.floor(Math.random() * colors.length)],
                    borderRadius: '50%',
                    pointerEvents: 'none',
                    zIndex: 10000,
                    animation: `confetti-fall ${2 + Math.random() * 3}s linear forwards`
                });
                
                $('body').append(confetti);
                
                setTimeout(() => confetti.remove(), 5000);
            }, i * 50);
        }
    }

    setupEventListeners() {
        $('#startGameBtn').on('click', async () => {
            const playerName = $('#playerNameInput').val().trim();
            const loginButton = $('#startGameBtn');
            const originalHtml = loginButton.html();

            // Clear previous error states
            $('#playerNameInput').removeClass('is-invalid');
            $('.login-error').remove();

            if (!playerName) {
                this.showLoginError('Please enter your name.');
                return;
            }

            // Show loading state
            loginButton.prop('disabled', true);
            loginButton.html('<i class="fas fa-spinner fa-spin"></i><span>Validating...</span>');

            try {
                // Validate user against JSONBin
                const validation = await this.jsonBinService.validateUser(playerName);

                if (!validation.isValid) {
                    if (validation.error) {
                        this.showLoginError(validation.error);
                    } else {
                        this.showLoginError(`User "${playerName}" not found. Please contact your administrator to add you to the system.`);
                    }
                    return;
                }

                // User is valid, proceed with login
                this.currentPlayer = playerName;
                $('#currentPlayer').text(playerName);
                
                // Save the current player to localStorage for persistent login
                localStorage.setItem(this.playerStorageKey, playerName);

                // Use cached game data (fallback to fetch if missing)
                const gameData = this.cachedGameData || await this.jsonBinService.getGameData();
                await this.setupNewBoard(gameData.tasks);

                // Update winners list
                await this.updateWinnersList();

                // Hide login modal
                const loginModal = bootstrap.Modal.getInstance(document.getElementById('playerLoginModal'));
                loginModal.hide();

            } catch (error) {
                console.error('Login error:', error);
                this.showLoginError('Unable to validate user. Please check your connection and try again.');
            } finally {
                // Restore button state
                loginButton.prop('disabled', false);
                loginButton.html(originalHtml);
            }
        });

        $('#playerNameInput').on('input', function () {
            $(this).removeClass('is-invalid');
        });

        // Enhanced bingo count update with celebration
        $(document).on('bingoCountUpdated', async (event, bingoCount) => {
            // Update quick stats
            if (this.bingoBoard) {
                const totalCells = this.bingoBoard.boardSize * this.bingoBoard.boardSize;
                const completed = this.bingoBoard.selectedCells.size;
                this.updateQuickStats(bingoCount, completed, totalCells);
                this.updateProgressBar(completed, totalCells);
            }
            
            // Show celebration if new bingo achieved
            if (bingoCount > this.lastBingoCount && bingoCount > 0) {
                this.showCelebration();
            }
            this.lastBingoCount = bingoCount;
            
            await this.updateWinnersList();
        });

        // Enhanced cell update for progress tracking
        $(document).on('cellToggled', (event, data) => {
            if (this.bingoBoard) {
                const totalCells = this.bingoBoard.boardSize * this.bingoBoard.boardSize;
                const completed = this.bingoBoard.selectedCells.size;
                this.updateQuickStats(this.bingoBoard.bingoCount, completed, totalCells);
                this.updateProgressBar(completed, totalCells);
            }
        });

        // Open Note modal when a cell is newly selected
        $(document).on('openNoteForCell', (_, payload) => {
            const { index, title, existing, onComplete } = payload || {};
            if (typeof index !== 'number') return;

            $('#noteModalLabel').text(title || 'Add Notes');
            $('#noteText').val(existing || '');
            $('#saveNoteBtn').data('cell-index', index);
            
            // Store the completion callback
            $('#saveNoteBtn').data('on-complete', onComplete);

            const modalElement = document.getElementById('noteModal');
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
        });

        // Save note from modal to local state
        $('#saveNoteBtn').on('click', () => {
            const index = $('#saveNoteBtn').data('cell-index');
            const text = $('#noteText').val();
            const onComplete = $('#saveNoteBtn').data('on-complete');
            
            if (this.bingoBoard && typeof index === 'number') {
                this.bingoBoard.setNote(index, text);
            }
            
            const modalElement = document.getElementById('noteModal');
            const modal = bootstrap.Modal.getInstance(modalElement);
            if (modal) modal.hide();
            
            // Call completion callback with saved=true
            if (typeof onComplete === 'function') {
                onComplete(true);
            }
        });

        // Handle modal dismissal (Cancel button or X button)
        $('#noteModal').on('hidden.bs.modal', function() {
            const saveBtn = $('#saveNoteBtn');
            const onComplete = saveBtn.data('on-complete');
            
            // Check if modal was closed via save button
            const wasSaved = $(this).data('saved-via-button');
            
            if (!wasSaved && typeof onComplete === 'function') {
                // Modal was dismissed without saving
                onComplete(false);
            }
            
            // Clear the saved flag and callback
            $(this).removeData('saved-via-button');
            saveBtn.removeData('on-complete');
            saveBtn.removeData('cell-index');
        });

        // Mark when save button was clicked
        $('#saveNoteBtn').on('click', () => {
            $('#noteModal').data('saved-via-button', true);
        });

        // Listen for winners list updates (triggered after manual sync)
        $(document).on('winnersUpdated', async () => {
            await this.updateWinnersList();
        });

        // Handle manual sync button click with enhanced feedback
        $('#syncProgress').on('click', async () => {
            const syncButton = $('#syncProgress');
            const originalHtml = syncButton.html();
            
            // Enhanced loading state
            syncButton.prop('disabled', true);
            syncButton.html('<i class="fas fa-sync-alt icon syncing"></i><span>Syncing...</span>');

            // Safety timeout to ensure UI is restored even if something hangs
            const safetyTimer = setTimeout(() => {
                try {
                    syncButton.prop('disabled', false);
                    syncButton.html(originalHtml);
                } catch (_) { /* no-op */ }
            }, 20000); // 20s hard cap

            try {
                const success = await this.bingoBoard.syncToCloud();
                
                // Clear the safety timer since we completed successfully
                clearTimeout(safetyTimer);

                if (success) {
                    syncButton.html('<i class="fas fa-check icon"></i><span>Synced!</span>');
                    syncButton.removeClass('btn-sync').addClass('btn-success');
                } else {
                    syncButton.html('<i class="fas fa-exclamation-triangle icon"></i><span>Sync Failed</span>');
                    syncButton.removeClass('btn-sync').addClass('btn-warning');
                }

                // Reset button after 3 seconds
                setTimeout(() => {
                    syncButton.prop('disabled', false);
                    syncButton.html(originalHtml);
                    syncButton.removeClass('btn-success btn-warning').addClass('btn-sync');
                }, 3000);
                
            } catch (error) {
                console.error('Sync error:', error);
                
                // Clear the safety timer and show error state
                clearTimeout(safetyTimer);
                
                syncButton.html('<i class="fas fa-exclamation-triangle icon"></i><span>Sync Failed</span>');
                syncButton.removeClass('btn-sync').addClass('btn-warning');
                
                // Reset button after 3 seconds
                setTimeout(() => {
                    syncButton.prop('disabled', false);
                    syncButton.html(originalHtml);
                    syncButton.removeClass('btn-warning').addClass('btn-sync');
                }, 3000);
            }
        });

        // Handle reset board button click
        $('#resetBoard').on('click', async () => {
            if (confirm('Are you sure you want to reset your board? This will clear all your progress.')) {
                if (this.bingoBoard) {
                    await this.bingoBoard.resetBoard();
                    // Reset UI stats
                    const totalCells = this.bingoBoard.boardSize * this.bingoBoard.boardSize;
                    this.updateQuickStats(0, 0, totalCells);
                    this.updateProgressBar(0, totalCells);
                    this.lastBingoCount = 0;
                }
            }
        });
        
        // Add logout functionality (optional enhancement)
        this.addLogoutButton();
    }
    
    addLogoutButton() {
        // Add logout option to the welcome text area
        const welcomeText = $('.welcome-text');
        welcomeText.css('cursor', 'pointer');
        welcomeText.attr('title', 'Click to logout and switch user');
        
        welcomeText.on('click', () => {
            if (confirm('Do you want to logout and switch to a different user?')) {
                this.logout();
            }
        });
    }
    
    logout() {
        // Clear the saved player
        localStorage.removeItem(this.playerStorageKey);
        
        // Clear current session
        this.currentPlayer = '';
        $('#currentPlayer').text('Not logged in');
        
        // Clear the board
        if (this.bingoBoard) {
            $('#bingoBoard').empty();
            this.bingoBoard = null;
        }
        
        // Clear the input field
        $('#playerNameInput').val('').removeClass('is-invalid');
        
        // Show login modal
        this.showLoginModal();
    }

    // Helper method to show login errors with better styling
    showLoginError(message) {
        // Remove any existing error messages
        $('.login-error').remove();
        
        // Create and show new error message
        const errorElement = $(`
            <div class="login-error">
                <i class="fas fa-exclamation-triangle"></i>
                ${message}
            </div>
        `);
        
        // Add error after the input group
        $('.login-form .input-group').after(errorElement);
        
        // Add shake animation to draw attention
        errorElement.addClass('shake-animation');
        
        // Add invalid styling to input
        $('#playerNameInput').addClass('is-invalid');
    }
}

// Initialize the game when document is ready
$(document).ready(() => {
    new BingoGame();
});
