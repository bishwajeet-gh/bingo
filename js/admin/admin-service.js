class AdminDataService {
    constructor() {
        this.jsonBinService = new JsonBinService();
    }

    async getAllProgress() {
        try {
            if (CONFIG.JSONBIN.USE_MOCK) {
                throw new Error('Admin dashboard requires JSONBin. Set CONFIG.JSONBIN.USE_MOCK = false.');
            }
            return await this.jsonBinService.getAllProgress();
        } catch (e) {
            console.error('Admin getAllProgress error:', e);
            return {};
        }
    }
}


