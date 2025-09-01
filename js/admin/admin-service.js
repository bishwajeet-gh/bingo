class AdminDataService {
    constructor() {
        this.jsonBinService = new JsonBinService();
    }

    async getAllProgress() {
        try {
            if (await this.jsonBinService.isMockEnabled()) {
                // In mock mode, return mock progress data
                return this.jsonBinService.mockProgress;
            }
            return await this.jsonBinService.getAllProgress();
        } catch (e) {
            console.error('Admin getAllProgress error:', e);
            return {};
        }
    }

    async getGameData() {
        try {
            return await this.jsonBinService.getGameData();
        } catch (e) {
            console.error('Admin getGameData error:', e);
            return { tasks: [], users: [] };
        }
    }

    async updateGameData(gameData) {
        try {
            if (await this.jsonBinService.isMockEnabled()) {
                // Update mock data
                this.jsonBinService.mockGameData = gameData;
                return true;
            }

            const response = await this.jsonBinService.fetchWithRetry(
                `${this.jsonBinService.baseUrl}/${CONFIG.JSONBIN.GAME_DATA_BIN_ID}`,
                {
                    method: 'PUT',
                    body: JSON.stringify(gameData)
                }
            );
            return response.ok;
        } catch (e) {
            console.error('Admin updateGameData error:', e);
            return false;
        }
    }

    async updateTasks(tasks) {
        try {
            const gameData = await this.getGameData();
            gameData.tasks = tasks;
            return await this.updateGameData(gameData);
        } catch (e) {
            console.error('Admin updateTasks error:', e);
            return false;
        }
    }

    async updateUsers(users) {
        try {
            const gameData = await this.getGameData();
            gameData.users = users;
            return await this.updateGameData(gameData);
        } catch (e) {
            console.error('Admin updateUsers error:', e);
            return false;
        }
    }

    async getStats() {
        try {
            const [gameData, progress] = await Promise.all([
                this.getGameData(),
                this.getAllProgress()
            ]);

            // Filter out keys with underscores from progress data
            const players = Object.keys(progress || {}).filter(key => !key.includes('_'));
            const totalBingos = players.reduce((sum, player) => {
                return sum + (progress[player]?.bingoCount || 0);
            }, 0);

            return {
                totalTasks: gameData.tasks?.length || 0,
                totalUsers: gameData.users?.length || 0,
                activePlayers: players.length,
                totalBingos: totalBingos
            };
        } catch (e) {
            console.error('Admin getStats error:', e);
            return {
                totalTasks: 0,
                totalUsers: 0,
                activePlayers: 0,
                totalBingos: 0
            };
        }
    }

    parseTextareaInput(text) {
        if (!text || typeof text !== 'string') return [];
        
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
    }
}


