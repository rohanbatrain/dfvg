import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as SplashScreen from 'expo-splash-screen';

import { ServerProvider } from './src/context/ServerContext';
import ServerConnectionModal from './src/components/ServerConnectionModal';
import HomeScreen from './src/screens/HomeScreen';
import ScanScreen from './src/screens/ScanScreen';
import JobsScreen from './src/screens/JobsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { colors, TAB_BAR_HEIGHT } from './src/styles/theme';

SplashScreen.preventAutoHideAsync();

const Tab = createBottomTabNavigator();

const DarkTheme = {
    ...DefaultTheme,
    dark: true,
    colors: {
        ...DefaultTheme.colors,
        primary: colors.accentPrimary,
        background: colors.bgPrimary,
        card: colors.bgSecondary,
        text: colors.textPrimary,
        border: colors.border,
        notification: colors.accentPrimary,
    },
};

function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
    const opacity = useState(new Animated.Value(1))[0];
    const scale = useState(new Animated.Value(1))[0];

    useEffect(() => {
        SplashScreen.hideAsync();
        const timer = setTimeout(() => {
            Animated.parallel([
                Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
                Animated.timing(scale, { toValue: 1.2, duration: 400, useNativeDriver: true }),
            ]).start(onFinish);
        }, 1200);
        return () => clearTimeout(timer);
    }, []);

    return (
        <Animated.View style={[styles.splash, { opacity, transform: [{ scale }] }]}>
            <Text style={styles.splashIcon}>🎬</Text>
            <Text style={styles.splashTitle}>DFVG</Text>
            <Text style={styles.splashSub}>DJI Footage Variant Generator</Text>
        </Animated.View>
    );
}

function AppContent() {
    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: colors.bgSecondary,
                    borderTopColor: colors.border,
                    height: TAB_BAR_HEIGHT,
                    paddingBottom: 34,
                    paddingTop: 8,
                },
                tabBarActiveTintColor: colors.accentPrimary,
                tabBarInactiveTintColor: colors.textMuted,
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '600',
                },
            }}
        >
            <Tab.Screen
                name="HomeTab"
                component={HomeScreen}
                options={{
                    tabBarLabel: 'Home',
                    tabBarIcon: ({ focused }) => (
                        <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>🏠</Text>
                    ),
                }}
            />
            <Tab.Screen
                name="ScanTab"
                component={ScanScreen}
                options={{
                    tabBarLabel: 'Scan',
                    tabBarIcon: ({ focused }) => (
                        <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>📂</Text>
                    ),
                }}
            />
            <Tab.Screen
                name="JobsTab"
                component={JobsScreen}
                options={{
                    tabBarLabel: 'Jobs',
                    tabBarIcon: ({ focused }) => (
                        <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>📊</Text>
                    ),
                }}
            />
            <Tab.Screen
                name="SettingsTab"
                component={SettingsScreen}
                options={{
                    tabBarLabel: 'Settings',
                    tabBarIcon: ({ focused }) => (
                        <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>⚙️</Text>
                    ),
                }}
            />
        </Tab.Navigator>
    );
}

export default function App() {
    const [showSplash, setShowSplash] = useState(true);

    const handleSplashFinish = useCallback(() => {
        setShowSplash(false);
    }, []);

    if (showSplash) {
        return <AnimatedSplash onFinish={handleSplashFinish} />;
    }

    return (
        <ServerProvider>
            <NavigationContainer theme={DarkTheme}>
                <StatusBar style="light" />
                <AppContent />
                <ServerConnectionModal />
            </NavigationContainer>
        </ServerProvider>
    );
}

const styles = StyleSheet.create({
    splash: {
        flex: 1,
        backgroundColor: colors.bgPrimary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    splashIcon: { fontSize: 72, marginBottom: 16 },
    splashTitle: {
        fontSize: 48,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: 6,
    },
    splashSub: {
        fontSize: 14,
        color: colors.textMuted,
        marginTop: 8,
    },
});
