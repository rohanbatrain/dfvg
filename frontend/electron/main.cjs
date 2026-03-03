const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');

// ── Configuration ─────────────────────────────────────────────────
const IS_DEV = !app.isPackaged;
const APP_NAME = 'DFVG';
const LOG_FILE = path.join(app.getPath('logs'), 'dfvg-main.log');

let mainWindow = null;
let apiProcess = null;
let apiPort = null;

// ── Logging ───────────────────────────────────────────────────────
function log(level, msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level}] ${msg}`;
    console.log(line);
    try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) { }
}

// ── Single Instance Lock ──────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    log('WARN', 'Another instance is already running. Quitting.');
    app.quit();
}
app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

// ── Find Free Port ────────────────────────────────────────────────
function findFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

// ── Wait for API Health ───────────────────────────────────────────
function waitForApi(port, maxRetries = 40) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            const http = require('http');
            const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 2000 }, (res) => {
                if (res.statusCode === 200) {
                    log('INFO', `API healthy on port ${port}`);
                    resolve();
                } else { retry(); }
            });
            req.on('error', retry);
            req.on('timeout', () => { req.destroy(); retry(); });
        };
        const retry = () => {
            attempts++;
            if (attempts >= maxRetries) {
                reject(new Error(`API did not respond after ${maxRetries} attempts`));
            } else {
                setTimeout(check, 500);
            }
        };
        check();
    });
}

// ── Spawn Python API ──────────────────────────────────────────────
async function startApi() {
    apiPort = await findFreePort();
    log('INFO', `Starting Python API on port ${apiPort}`);

    const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', DFVG_PORT: String(apiPort) };

    if (IS_DEV) {
        // Dev mode:  use the local python3 + uvicorn
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const projectRoot = path.join(__dirname, '..', '..');

        apiProcess = spawn(pythonCmd, [
            '-m', 'uvicorn', 'dfvg.api.app:app',
            '--host', '0.0.0.0',
            '--port', String(apiPort),
            '--log-level', 'warning',
        ], {
            cwd: projectRoot,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } else {
        // Production mode:  use the PyInstaller-bundled binary
        const binaryName = process.platform === 'win32' ? 'dfvg-api.exe' : 'dfvg-api';
        const binaryPath = path.join(process.resourcesPath, 'dfvg-api', binaryName);

        if (!fs.existsSync(binaryPath)) {
            throw new Error(`Bundled backend not found at ${binaryPath}`);
        }

        log('INFO', `Launching bundled backend: ${binaryPath}`);

        apiProcess = spawn(binaryPath, [], {
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    }

    apiProcess.stdout.on('data', (d) => log('API', d.toString().trim()));
    apiProcess.stderr.on('data', (d) => log('API', d.toString().trim()));
    apiProcess.on('exit', (code, signal) => {
        log('WARN', `API process exited (code=${code}, signal=${signal})`);
        apiProcess = null;
    });

    await waitForApi(apiPort);
}

// ── Kill API Gracefully ───────────────────────────────────────────
function killApi() {
    if (!apiProcess) return;
    log('INFO', 'Shutting down API process');
    try {
        // Send SIGTERM first for graceful shutdown
        apiProcess.kill('SIGTERM');
        // Force kill after 3s if still alive
        setTimeout(() => {
            if (apiProcess) {
                log('WARN', 'Force-killing API process');
                apiProcess.kill('SIGKILL');
            }
        }, 3000);
    } catch (e) {
        log('ERROR', `Failed to kill API: ${e.message}`);
    }
}

// ── Application Menu ──────────────────────────────────────────────
function buildMenu() {
    const template = [
        ...(process.platform === 'darwin' ? [{
            label: APP_NAME,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' },
            ],
        }] : []),
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
                { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
                { role: 'selectAll' },
            ],
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                ...(IS_DEV ? [{ role: 'toggleDevTools' }] : []),
                { type: 'separator' },
                { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' }, { role: 'zoom' },
                ...(process.platform === 'darwin' ? [
                    { type: 'separator' }, { role: 'front' },
                ] : [{ role: 'close' }]),
            ],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Create Window ─────────────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        minWidth: 900,
        minHeight: 600,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: { x: 16, y: 16 },
        backgroundColor: '#030712',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
        },
    });

    mainWindow.loadURL(`http://127.0.0.1:${apiPort}`);

    // Prevent navigation to external URLs
    mainWindow.webContents.on('will-navigate', (e, url) => {
        if (!url.startsWith(`http://127.0.0.1:${apiPort}`)) {
            e.preventDefault();
            shell.openExternal(url);
        }
    });

    // Open external links in system browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => { mainWindow = null; });

    if (IS_DEV) {
        log('INFO', 'Dev mode – DevTools available via View menu');
    }
}

// ── IPC Handlers ──────────────────────────────────────────────────
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Footage Directory',
        buttonLabel: 'Select',
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.handle('open-folder', async (_e, folderPath) => {
    if (folderPath && typeof folderPath === 'string') {
        await shell.openPath(folderPath);
    }
});

ipcMain.handle('get-api-port', () => apiPort);

ipcMain.handle('get-app-info', () => ({
    version: app.getVersion(),
    isDev: IS_DEV,
    platform: process.platform,
    logPath: LOG_FILE,
}));

// ── App Lifecycle ─────────────────────────────────────────────────
app.whenReady().then(async () => {
    buildMenu();
    try {
        await startApi();
        createWindow();
    } catch (err) {
        log('ERROR', `Startup failed: ${err.message}`);
        dialog.showErrorBox(
            `${APP_NAME} – Startup Error`,
            `Could not start the processing backend.\n\n${err.message}\n\nIf running in development, ensure Python 3, DFVG, and uvicorn are installed.\nFor production builds, run: npm run dist`
        );
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && apiPort) {
        createWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        killApi();
        app.quit();
    }
});

app.on('before-quit', () => killApi());
