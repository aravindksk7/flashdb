"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = __importDefault(require("./logger"));
const goldenImages_1 = __importDefault(require("./routes/goldenImages"));
const clones_1 = __importDefault(require("./routes/clones"));
const checkpoints_1 = __importDefault(require("./routes/checkpoints"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
// Middleware
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true
}));
app.use((0, morgan_1.default)('combined', { stream: { write: msg => logger_1.default.info(msg.trim()) } }));
// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});
// API Routes
app.use('/api/golden-images', goldenImages_1.default);
app.use('/api/clones', clones_1.default);
app.use('/api/clones/:cloneId/checkpoints', checkpoints_1.default);
// Swagger/OpenAPI endpoint (can be expanded later)
app.get('/api/docs', (_req, res) => {
    res.json({
        info: {
            title: 'FlashDB API',
            version: '0.1.0',
            description: 'Database Virtualization Tool - REST API'
        },
        endpoints: {
            goldenImages: '/api/golden-images',
            clones: '/api/clones',
            checkpoints: '/api/clones/{cloneId}/checkpoints'
        }
    });
});
// Error handling middleware
app.use((err, _req, res) => {
    logger_1.default.error('Unhandled error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err : undefined
    });
});
// 404 handler
app.use((_req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});
// Start server
app.listen(port, () => {
    logger_1.default.info(`FlashDB API running on http://localhost:${port}`);
    logger_1.default.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger_1.default.info(`FlashDB Module: ${process.env.FLASHDB_MODULE_PATH || 'C:\\flashdb\\src\\FlashDB\\FlashDB.psm1'}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map