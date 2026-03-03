import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setApiBaseUrl, setConnectionErrorCallback } from '../services/api';
import axios from 'axios';

interface ServerContextType {
    serverUrl: string;
    setServerUrl: (url: string) => Promise<void>;
    isConnected: boolean;
    setIsConnected: (connected: boolean) => void;
    checkConnection: () => Promise<boolean>;
    isLoading: boolean;
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

export const SERVER_URL_KEY = 'dfvg_server_url';

export function ServerProvider({ children }: { children: React.ReactNode }) {
    const [serverUrl, setServerUrlState] = useState<string>('');
    const [isConnected, setIsConnected] = useState<boolean>(true);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    useEffect(() => {
        loadServerUrl();
        setConnectionErrorCallback(() => {
            console.log('Connection lost');
            setIsConnected(false);
        });
    }, []);

    const loadServerUrl = async () => {
        try {
            const storedUrl = await AsyncStorage.getItem(SERVER_URL_KEY);
            if (storedUrl) {
                setServerUrlState(storedUrl);
                setApiBaseUrl(storedUrl);
                await checkConnection(storedUrl);
            } else {
                setIsConnected(false);
            }
        } catch (error) {
            console.error('Failed to load server URL', error);
        } finally {
            setIsLoading(false);
        }
    };

    const setServerUrl = async (url: string) => {
        try {
            const cleanUrl = url.replace(/\/$/, '');
            await AsyncStorage.setItem(SERVER_URL_KEY, cleanUrl);
            setServerUrlState(cleanUrl);
            setApiBaseUrl(cleanUrl);
            await checkConnection(cleanUrl);
        } catch (error) {
            console.error('Failed to save server URL', error);
        }
    };

    const checkConnection = async (urlOverride?: string): Promise<boolean> => {
        const urlToCheck = urlOverride || serverUrl;
        if (!urlToCheck) {
            setIsConnected(false);
            return false;
        }
        try {
            await axios.get(`${urlToCheck}/health`, { timeout: 3000 });
            setIsConnected(true);
            return true;
        } catch (error) {
            console.log('Connection check failed:', error);
            setIsConnected(false);
            return false;
        }
    };

    return (
        <ServerContext.Provider value={{
            serverUrl,
            setServerUrl,
            isConnected,
            setIsConnected,
            checkConnection,
            isLoading,
        }}>
            {children}
        </ServerContext.Provider>
    );
}

export function useServer() {
    const context = useContext(ServerContext);
    if (context === undefined) {
        throw new Error('useServer must be used within a ServerProvider');
    }
    return context;
}
