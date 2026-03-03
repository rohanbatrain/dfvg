import axios from 'axios';

let API_BASE_URL = 'http://192.168.1.4:8000';

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
});

let connectionErrorCallback: (() => void) | null = null;

export const setConnectionErrorCallback = (callback: () => void) => {
    connectionErrorCallback = callback;
};

export const setApiBaseUrl = (url: string) => {
    API_BASE_URL = url;
    api.defaults.baseURL = url;
    console.log('API Base URL set to:', url);
};

api.interceptors.response.use(
    response => response,
    error => {
        if (!error.response) {
            console.log('Network error detected');
            if (connectionErrorCallback) connectionErrorCallback();
        }
        return Promise.reject(error);
    }
);

// ── DFVG API ──────────────────────────────────────────────────────

export const dfvgApi = {
    // Health & Info
    health: () => api.get('/health'),
    networkInfo: () => api.get('/network-info'),

    // Scanning
    scan: (path: string) => api.post(`/scan?path=${encodeURIComponent(path)}`),

    // Jobs
    createJob: (input_path: string, mode: string, ingest_source?: string) =>
        api.post('/jobs', { input_path, mode, ingest_source }),
    getJob: (jobId: string) => api.get(`/jobs/${jobId}`),

    // Run History & Verification
    getRuns: (projectPath: string) =>
        api.get(`/runs?project_path=${encodeURIComponent(projectPath)}`),
    verify: (projectPath: string) =>
        api.post(`/verify?project_path=${encodeURIComponent(projectPath)}`),
    cleanup: (projectPath: string) =>
        api.post('/cleanup', { project_path: projectPath }),

    // Thumbnails
    getThumbnailUrl: (projectPath: string, filename: string) =>
        `${API_BASE_URL}/thumbnails/${encodeURIComponent(projectPath)}/${encodeURIComponent(filename)}`,

    // Ingestion
    ingestPlan: (source: string, destination: string) =>
        api.post('/ingest/plan', { source_path: source, destination_path: destination }),
    ingestExecute: (plan: any) =>
        api.post('/ingest/execute', plan),
};

export default api;
