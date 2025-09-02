$(async function () {
    const service = new AdminDataService();
    let currentGameData = null;

    // Initialize the dashboard
    async function initializeDashboard() {
        await Promise.all([
            loadCurrentData(),
            loadPlayerProgress(),
            setupEventListeners()
        ]);
    }

    // Load current game data and populate forms
    async function loadCurrentData() {
        try {
            currentGameData = await service.getGameData();
            
            // Populate tasks textarea
            const tasksText = (currentGameData.tasks || []).join('\n');
            $('#tasksTextarea').val(tasksText);
            
            // Populate users textarea  
            const usersText = (currentGameData.users || []).join('\n');
            $('#usersTextarea').val(usersText);
            
            // Load current grid size
            await loadCurrentGridSize();
            
            // Update stats
            await updateStats();
            
        } catch (error) {
            console.error('Error loading current data:', error);
            showNotification('Error loading current configuration', 'error');
        }
    }

    // Load current grid size setting
    async function loadCurrentGridSize() {
        try {
            const jsonBinService = new JsonBinService();
            const settings = await jsonBinService.getGameSettings();
            const currentSize = settings?.boardSize || CONFIG.BINGO.BOARD_SIZE;
            $('#gridSizeSelect').val(currentSize);
        } catch (error) {
            console.error('Error loading grid size:', error);
        }
    }

    // Update statistics display
    async function updateStats() {
        try {
            const stats = await service.getStats();
            
            $('#totalTasksCount').text(stats.totalTasks);
            $('#totalUsersCount').text(stats.totalUsers);
            $('#activePlayersCount').text(stats.activePlayers);
            $('#totalBingosCount').text(stats.totalBingos);
            
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    // Load and display player progress
    async function loadPlayerProgress() {
        const tableBody = $('#playerProgressTable');
        tableBody.html(`
            <tr>
                <td colspan="5" class="text-center text-muted py-4">
                    <i class="fas fa-spinner fa-spin"></i> Loading player data...
                </td>
            </tr>
        `);

        try {
            const progress = await service.getAllProgress();
            // Filter out keys that contain underscores
            const players = Object.keys(progress || {})
                .filter(key => !key.includes('_'))
                .sort((a, b) => a.localeCompare(b));

            if (!players.length) {
                tableBody.html(`
                    <tr>
                        <td colspan="5" class="text-center text-muted py-4">
                            <i class="fas fa-users-slash"></i> No player data available
                        </td>
                    </tr>
                `);
                return;
            }

            tableBody.empty();
            players.forEach(playerName => {
                const playerData = progress[playerName] || {};
                const bingoCount = playerData.bingoCount || 0;
                const completedCells = Array.isArray(playerData.selectedCells) ? playerData.selectedCells.length : 0;
                const lastActive = playerData.lastSynced ? 
                    new Date(playerData.lastSynced).toLocaleString() : 
                    'Never';
                
                const notesCount = playerData.notesByIndex ? 
                    Object.keys(playerData.notesByIndex).length : 0;

                const row = $(`
                    <tr data-player="${playerName}">
                        <td>
                            <div class="d-flex align-items-center">
                                <div class="status-dot me-2"></div>
                                <strong>${playerName}</strong>
                            </div>
                        </td>
                        <td>
                            <span class="badge-custom">${bingoCount}</span>
                        </td>
                        <td>
                            <small class="text-muted">${lastActive}</small>
                        </td>
                        <td>
                            ${notesCount > 0 ? 
                                `<button class="btn btn-sm btn-outline-primary view-notes-btn" data-player="${playerName}">
                                    <i class="fas fa-sticky-note"></i> ${notesCount} notes
                                </button>` : 
                                `<span class="text-muted">No notes</span>`
                            }
                        </td>
                    </tr>
                `);

                tableBody.append(row);
            });

        } catch (error) {
            console.error('Error loading player progress:', error);
            tableBody.html(`
                <tr>
                    <td colspan="5" class="text-center text-danger py-4">
                        <i class="fas fa-exclamation-triangle"></i> Error loading player data
                    </td>
                </tr>
            `);
        }
    }

    // Add validation function for grid size vs tasks compatibility
    function validateGridSizeWithTasks(gridSize, tasksCount) {
        const requiredCells = gridSize * gridSize;
        
        if (tasksCount < requiredCells) {
            return {
                isValid: false,
                message: `Grid size ${gridSize}×${gridSize} requires ${requiredCells} tasks, but only ${tasksCount} tasks are available. Please add ${requiredCells - tasksCount} more tasks or choose a smaller grid size.`,
                severity: 'error'
            };
        }
        
        if (tasksCount < requiredCells * 1.5) {
            return {
                isValid: true,
                message: `Grid size ${gridSize}×${gridSize} works with ${tasksCount} tasks, but consider adding more tasks for better variety in board shuffling.`,
                severity: 'warning'
            };
        }
        
        return {
            isValid: true,
            message: `Grid size ${gridSize}×${gridSize} is compatible with ${tasksCount} tasks.`,
            severity: 'success'
        };
    }

    // Setup all event listeners
    async function setupEventListeners() {
        // Grid size save button
        $('#saveGridSize').on('click', async function() {
            const button = $(this);
            const originalText = button.html();
            const selectedSize = parseInt($('#gridSizeSelect').val());
            
            button.prop('disabled', true).html('<span class="loading-spinner"></span> Validating...');
            
            try {
                // Get current tasks count for validation
                const gameData = await service.getGameData();
                const tasksCount = gameData.tasks ? gameData.tasks.length : 0;
                
                // Validate grid size compatibility with tasks
                const validation = validateGridSizeWithTasks(selectedSize, tasksCount);
                
                if (!validation.isValid) {
                    showNotification(validation.message, validation.severity);
                    return;
                }
                
                // Show warning if applicable
                if (validation.severity === 'warning') {
                    showNotification(validation.message, validation.severity);
                }
                
                button.html('<span class="loading-spinner"></span> Saving...');
                
                const jsonBinService = new JsonBinService();
                const success = await jsonBinService.updateGameSettings({ boardSize: selectedSize });
                
                if (success) {
                    showNotification(`Grid size updated to ${selectedSize}×${selectedSize}`, 'success');
                } else {
                    showNotification('Failed to save grid size', 'error');
                }
            } catch (error) {
                console.error('Error saving grid size:', error);
                showNotification('Error saving grid size', 'error');
            } finally {
                button.prop('disabled', false).html(originalText);
            }
        });

        // Save tasks button
        $('#saveTasks').on('click', async function() {
            const button = $(this);
            const originalText = button.html();
            const tasksText = $('#tasksTextarea').val();
            
            button.prop('disabled', true).html('<span class="loading-spinner"></span> Validating...');
            
            try {
                const tasks = service.parseTextareaInput(tasksText);
                
                if (tasks.length === 0) {
                    showNotification('Please enter at least one task', 'warning');
                    return;
                }
                
                // Get current grid size for validation
                const jsonBinService = new JsonBinService();
                const settings = await jsonBinService.getGameSettings();
                const currentGridSize = settings?.boardSize || CONFIG.BINGO.BOARD_SIZE;
                
                // Validate tasks compatibility with current grid size
                const validation = validateGridSizeWithTasks(currentGridSize, tasks.length);
                
                if (!validation.isValid) {
                    showNotification(validation.message, validation.severity);
                    return;
                }
                
                // Show warning if applicable
                if (validation.severity === 'warning') {
                    showNotification(validation.message, validation.severity);
                }
                
                button.html('<span class="loading-spinner"></span> Saving...');
                
                const success = await service.updateTasks(tasks);
                
                if (success) {
                    showNotification(`Successfully saved ${tasks.length} tasks`, 'success');
                    await updateStats();
                } else {
                    showNotification('Failed to save tasks', 'error');
                }
            } catch (error) {
                console.error('Error saving tasks:', error);
                showNotification('Error saving tasks', 'error');
            } finally {
                button.prop('disabled', false).html(originalText);
            }
        });

        // Save users button
        $('#saveUsers').on('click', async function() {
            const button = $(this);
            const originalText = button.html();
            const usersText = $('#usersTextarea').val();
            
            button.prop('disabled', true).html('<span class="loading-spinner"></span> Saving...');
            
            try {
                const users = service.parseTextareaInput(usersText);
                
                if (users.length === 0) {
                    showNotification('Please enter at least one authorized user', 'warning');
                    return;
                }
                
                const success = await service.updateUsers(users);
                
                if (success) {
                    showNotification(`Successfully saved ${users.length} authorized users`, 'success');
                    await updateStats();
                } else {
                    showNotification('Failed to save users', 'error');
                }
            } catch (error) {
                console.error('Error saving users:', error);
                showNotification('Error saving users', 'error');
            } finally {
                button.prop('disabled', false).html(originalText);
            }
        });

        // Toggle mock mode button
        $('#toggleMock').on('click', async function() {
            const button = $(this);
            const jsonBinService = new JsonBinService();
            
            try {
                const currentMode = await jsonBinService.isMockEnabled();
                const newMode = !currentMode;
                
                if (!CONFIG.JSONBIN.TOGGLES_BIN_ID) {
                    showNotification('Missing TOGGLES_BIN_ID in configuration', 'error');
                    return;
                }
                
                await jsonBinService.fetchWithRetry(
                    `${CONFIG.JSONBIN.BASE_URL}/${CONFIG.JSONBIN.TOGGLES_BIN_ID}`,
                    { 
                        method: 'PUT', 
                        body: JSON.stringify({ USE_MOCK: newMode }) 
                    }
                );
                
                jsonBinService.togglesCache = { USE_MOCK: newMode };
                
                const modeText = newMode ? 'MOCK' : 'LIVE';
                button.html(`<i class="fas fa-toggle-${newMode ? 'on' : 'off'}"></i> Using ${modeText}`);
                
                showNotification(`Switched to ${modeText} mode`, 'success');
                
                // Reload data after mode change
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
                
            } catch (error) {
                console.error('Error toggling mode:', error);
                showNotification('Failed to toggle mode', 'error');
            }
        });

        // Refresh data button
        $('#refreshAdmin').on('click', async function() {
            const button = $(this);
            const originalText = button.html();
            
            button.prop('disabled', true).html('<span class="loading-spinner"></span> Refreshing...');
            
            try {
                await Promise.all([
                    loadCurrentData(),
                    loadPlayerProgress()
                ]);
                showNotification('Data refreshed successfully', 'success');
            } catch (error) {
                console.error('Error refreshing data:', error);
                showNotification('Error refreshing data', 'error');
            } finally {
                button.prop('disabled', false).html(originalText);
            }
        });

        // Initialize mock toggle button state
        await updateMockToggleButton();
        
        // View notes button event handler
        $(document).on('click', '.view-notes-btn', async function() {
            const playerName = $(this).data('player');
            await showPlayerNotesModal(playerName);
        });
    }

    // Show player notes in a modal
    async function showPlayerNotesModal(playerName) {
        try {
            const progress = await service.getAllProgress();
            const playerData = progress[playerName];
            
            if (!playerData || !playerData.notesByIndex) {
                showNotification('No notes found for this player', 'info');
                return;
            }
            
            const tasks = currentGameData.tasks || [];
            const notes = playerData.notesByIndex;
            const noteEntries = Object.entries(notes);
            
            let notesHtml = '';
            if (noteEntries.length === 0) {
                notesHtml = '<div class="text-muted text-center py-4">No notes available</div>';
            } else {
                notesHtml = noteEntries.map(([cellIndex, noteText]) => {
                    const taskTitle = tasks[parseInt(cellIndex)] || `Task #${parseInt(cellIndex) + 1}`;
                    return `
                        <div class="note-item mb-3 p-3 border rounded">
                            <div class="note-header mb-2">
                                <strong class="text-primary">Cell ${parseInt(cellIndex) + 1}:</strong>
                                <span class="text-muted">${taskTitle}</span>
                            </div>
                            <div class="note-content">
                                ${noteText.replace(/\n/g, '<br>')}
                            </div>
                        </div>
                    `;
                }).join('');
            }
            
            // Create and show modal
            const modalHtml = `
                <div class="modal fade" id="playerNotesModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">
                                    <i class="fas fa-sticky-note text-primary"></i>
                                    Notes for ${playerName}
                                </h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
                                ${notesHtml}
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Remove existing modal if any
            $('#playerNotesModal').remove();
            
            // Add modal to page and show it
            $('body').append(modalHtml);
            const modal = new bootstrap.Modal(document.getElementById('playerNotesModal'));
            modal.show();
            
            // Clean up modal after it's hidden
            $('#playerNotesModal').on('hidden.bs.modal', function() {
                $(this).remove();
            });
            
        } catch (error) {
            console.error('Error loading player notes:', error);
            showNotification('Error loading player notes', 'error');
        }
    }

    // Update the mock toggle button display
    async function updateMockToggleButton() {
        try {
            const jsonBinService = new JsonBinService();
            const isMock = await jsonBinService.isMockEnabled();
            const button = $('#toggleMock');
            const modeText = isMock ? 'MOCK' : 'LIVE';
            
            button.html(`<i class="fas fa-toggle-${isMock ? 'on' : 'off'}"></i> Using ${modeText}`);
        } catch (error) {
            console.error('Error updating mock toggle button:', error);
        }
    }

    // Show notification to user
    function showNotification(message, type = 'info') {
        // Create notification element
        const alertClass = type === 'success' ? 'alert-success' : 
                          type === 'error' ? 'alert-danger' : 
                          type === 'warning' ? 'alert-warning' : 'alert-info';
        
        const icon = type === 'success' ? 'fa-check-circle' : 
                     type === 'error' ? 'fa-exclamation-circle' : 
                     type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
        
        const notification = $(`
            <div class="alert ${alertClass} alert-dismissible fade show position-fixed" 
                 style="top: 2rem; right: 2rem; z-index: 9999; min-width: 300px;">
                <i class="fas ${icon} me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `);
        
        $('body').append(notification);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            notification.alert('close');
        }, 5000);
    }

    // Initialize the dashboard
    await initializeDashboard();
});


