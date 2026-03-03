export interface ElectronAPI {
    selectFolder: () => Promise<string | null>
    openFolder: (path: string) => Promise<void>
    getApiPort: () => Promise<number>
    getAppInfo: () => Promise<{
        version: string
        isDev: boolean
        platform: string
        logPath: string
    }>
    isElectron: boolean
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI
    }
}

export { }
