class JsonBinService {
    constructor() {
        this.mockWinners = { winners: [] };
        this.mockGameData = {
            tasks: CONFIG.JSONBIN.USE_MOCK ? [
                "🤝 Helped unblock a teammate",
                "💡 Shared useful knowledge in standup",
                "✍️ Improved documentation clarity",
                "👥 Participated actively in refinement",
                "🎯 Delivered constructive PR feedback",
                "🐛 Reported issue with clear steps",
                "✅ Verified fix before deployment",
                "🔍 Found edge case in testing",
                "📝 Updated test documentation",
                "🎯 Achieved zero-defect delivery",
                "⚡ Suggested workflow improvement",
                "📊 Updated task status promptly",
                "🎉 Completed work ahead of time",
                "🔄 Shared valuable retro feedback",
                "📈 Helped improve team metrics",
                "📚 Learned new tool/technique",
                "🤓 Shared learning with team",
                "💪 Stepped out of comfort zone",
                "🌱 Applied feedback effectively",
                "🎓 Mentored/supported others",
                "🎯 Met sprint commitment",
                "🚀 Contributed to team goals",
                "💬 Raised risks early",
                "🌟 Received peer recognition",
                "🤝 Supported cross-team effort"
            ] : [],
            users: CONFIG.JSONBIN.USE_MOCK ? [
                "Bishwajeet", "Senthil", "Gomathi", "Srini",
                "Kadhambari", "Sangeetha", "Roocha", "Janani"
            ] : []
        };
        this.mockProgress = {};
        this.baseUrl = CONFIG.JSONBIN.BASE_URL;
        this.headers = {
            'Content-Type': 'application/json',
            'X-Master-Key': CONFIG.JSONBIN.API_KEY,
            'X-Bin-Meta': 'false',
            'versioning': 'false'
        };
        this.togglesCache = null;
    }
    async getToggles() {
        if (!CONFIG.JSONBIN.TOGGLES_BIN_ID) return { USE_MOCK: CONFIG.JSONBIN.USE_MOCK };
        if (this.togglesCache) return this.togglesCache;
        try {
            const response = await this.fetchWithRetry(`${this.baseUrl}/${CONFIG.JSONBIN.TOGGLES_BIN_ID}/latest`, { method: 'GET' });
            const data = await response.json();
            const record = (data && data.record) ? data.record : data; // handle both shapes
            this.togglesCache = record || {};
            return this.togglesCache;
        } catch (e) {
            console.warn('Toggles fetch failed, using CONFIG fallback');
            return { USE_MOCK: CONFIG.JSONBIN.USE_MOCK };
        }
    }

    async isMockEnabled() {
        const toggles = await this.getToggles();
        return !!toggles.USE_MOCK;
    }

    async fetchWithRetry(url, options, attempt = 1) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.JSONBIN.RETRY.TIMEOUT);

            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                mode: 'cors',
                headers: {
                    ...this.headers,
                    ...options.headers
                }
            });

            clearTimeout(timeoutId);

            if (response.status === 429 && attempt < CONFIG.JSONBIN.RETRY.MAX_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.JSONBIN.RETRY.DELAY));
                return this.fetchWithRetry(url, options, attempt + 1);
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return response;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out');
            }
            if (attempt < CONFIG.JSONBIN.RETRY.MAX_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.JSONBIN.RETRY.DELAY));
                return this.fetchWithRetry(url, options, attempt + 1);
            }
            throw error;
        }
    }

    async getWinners() {
        if (await this.isMockEnabled()) {
            return this.mockWinners;
        }

        try {
            const response = await this.fetchWithRetry(`${this.baseUrl}/${CONFIG.JSONBIN.WINNERS_BIN_ID}/latest`, {
                method: 'GET'
            });
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching winners:', error);
            return { winners: [] };
        }
    }

    async getGameData() {
        if (await this.isMockEnabled()) {
            return this.mockGameData;
        }

        try {
            const response = await this.fetchWithRetry(`${this.baseUrl}/${CONFIG.JSONBIN.GAME_DATA_BIN_ID}/latest`, {
                method: 'GET'
            });
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching game data:', error);
            return { tasks: [], users: [] };
        }
    }

    async updateWinners(winners) {
        if (await this.isMockEnabled()) {
            this.mockWinners = winners;
            return;
        }

        try {
            await this.fetchWithRetry(`${this.baseUrl}/${CONFIG.JSONBIN.WINNERS_BIN_ID}`, {
                method: 'PUT',
                body: JSON.stringify(winners)
            });
        } catch (error) {
            console.error('Error updating winners:', error);
            throw error;
        }
    }

    async savePlayerProgress(playerName, progress) {
        if (await this.isMockEnabled()) {
            this.mockProgress[playerName] = progress;
            return true;
        }

        try {
            const allProgress = await this.getAllProgress();
            const playerProgress = {
                ...allProgress,
                [playerName]: {
                    ...progress,
                    lastUpdated: new Date().toISOString()
                }
            };

            const response = await this.fetchWithRetry(`${this.baseUrl}/${CONFIG.JSONBIN.PROGRESS_BIN_ID}`, {
                method: 'PUT',
                body: JSON.stringify(playerProgress)
            });

            return response.ok;
        } catch (error) {
            console.error('Error saving player progress:', error);
            return false;
        }
    }

    async getPlayerProgress(playerName) {
        if (await this.isMockEnabled()) {
            return this.mockProgress[playerName] || null;
        }

        try {
            const allProgress = await this.getAllProgress();
            return allProgress[playerName] || null;
        } catch (error) {
            console.error('Error getting player progress:', error);
            return null;
        }
    }

    async getAllProgress() {
        if (await this.isMockEnabled()) {
            return this.mockProgress;
        }

        try {
            const response = await this.fetchWithRetry(`${this.baseUrl}/${CONFIG.JSONBIN.PROGRESS_BIN_ID}/latest`, {
                method: 'GET'
            });
            const data = await response.json();
            return data || {};
        } catch (error) {
            console.error('Error getting all progress:', error);
            return {};
        }
    }
}
