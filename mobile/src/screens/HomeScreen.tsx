import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, borderRadius, typography, globalStyles } from '../styles/theme';
import { dfvgApi } from '../services/api';
import { useServer } from '../context/ServerContext';

interface StatCardProps {
    icon: string;
    value: string;
    label: string;
    color: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, value, label, color }) => (
    <View style={[styles.statCard, { borderLeftColor: color, borderLeftWidth: 3 }]}>
        <Text style={styles.statIcon}>{icon}</Text>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
    </View>
);

export default function HomeScreen() {
    const navigation = useNavigation<any>();
    const { isConnected, serverUrl } = useServer();
    const [refreshing, setRefreshing] = useState(false);
    const [serverInfo, setServerInfo] = useState<any>(null);
    const [stats, setStats] = useState({ version: '—', ip: '—', port: '—' });

    const loadData = async () => {
        try {
            const infoRes = await dfvgApi.networkInfo();
            setServerInfo(infoRes.data);
            setStats({
                version: infoRes.data.version || '1.0.0',
                ip: infoRes.data.ip || '—',
                port: String(infoRes.data.port || '—'),
            });
        } catch (error) {
            console.error('Failed to load data:', error);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, []);

    useEffect(() => {
        if (isConnected) loadData();
    }, [isConnected]);

    return (
        <ScrollView
            style={globalStyles.container}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={colors.accentPrimary}
                />
            }
        >
            {/* Hero Header */}
            <View style={styles.heroHeader}>
                <View style={styles.heroGradient} />
                <Text style={styles.heroIcon}>🎬</Text>
                <Text style={styles.heroTitle}>DFVG</Text>
                <Text style={styles.heroSubtitle}>DJI Footage Variant Generator</Text>
            </View>

            {/* Connection Status */}
            <View style={styles.connectionCard}>
                <View style={styles.connectionRow}>
                    <View style={[styles.dot, { backgroundColor: isConnected ? colors.success : colors.error }]} />
                    <Text style={styles.connectionText}>
                        {isConnected ? 'Connected to Server' : 'Disconnected'}
                    </Text>
                </View>
                {isConnected && (
                    <Text style={styles.connectionUrl}>{serverUrl}</Text>
                )}
            </View>

            {/* Stats Row */}
            <View style={styles.statsRow}>
                <StatCard icon="🌐" value={stats.ip} label="Server IP" color={colors.accentPrimary} />
                <StatCard icon="🔌" value={stats.port} label="Port" color={colors.success} />
            </View>

            {/* Quick Actions */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>⚡ Quick Actions</Text>
            </View>

            <View style={styles.actionsGrid}>
                <TouchableOpacity
                    style={styles.actionCard}
                    onPress={() => navigation.navigate('ScanTab')}
                    activeOpacity={0.7}
                >
                    <Text style={styles.actionIcon}>📂</Text>
                    <Text style={styles.actionLabel}>Scan Folder</Text>
                    <Text style={styles.actionDesc}>Detect clips & metadata</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.actionCard}
                    onPress={() => navigation.navigate('JobsTab')}
                    activeOpacity={0.7}
                >
                    <Text style={styles.actionIcon}>📊</Text>
                    <Text style={styles.actionLabel}>View Jobs</Text>
                    <Text style={styles.actionDesc}>Monitor & history</Text>
                </TouchableOpacity>
            </View>

            {/* Supported Cameras */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>📹 Supported Cameras</Text>
            </View>
            <View style={globalStyles.card}>
                <View style={styles.cameraRow}>
                    <Text style={styles.cameraDot}>🔵</Text>
                    <View>
                        <Text style={styles.cameraName}>DJI Action 5 Pro</Text>
                        <Text style={styles.cameraProfiles}>D-Log M, Normal</Text>
                    </View>
                </View>
                <View style={[styles.cameraRow, { marginTop: spacing.md }]}>
                    <Text style={styles.cameraDot}>🟢</Text>
                    <View>
                        <Text style={styles.cameraName}>DJI Action 2</Text>
                        <Text style={styles.cameraProfiles}>D-Cinelike, Normal</Text>
                    </View>
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    content: { paddingBottom: spacing.xxl + 80 },
    heroHeader: {
        alignItems: 'center',
        paddingVertical: spacing.xl * 1.5,
        paddingHorizontal: spacing.lg,
        position: 'relative',
        overflow: 'hidden',
    },
    heroGradient: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: colors.accentPrimary,
        opacity: 0.06,
    },
    heroIcon: { fontSize: 56, marginBottom: spacing.sm },
    heroTitle: {
        fontSize: 36,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: 3,
        marginBottom: spacing.xs,
    },
    heroSubtitle: {
        fontSize: typography.sm,
        color: colors.textSecondary,
    },
    // Connection
    connectionCard: {
        marginHorizontal: spacing.md,
        marginTop: -spacing.md,
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    connectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    connectionText: {
        fontSize: typography.sm,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    connectionUrl: {
        fontSize: typography.xs,
        color: colors.textMuted,
        marginTop: spacing.xs,
        fontFamily: 'monospace',
    },
    // Stats
    statsRow: {
        flexDirection: 'row',
        paddingHorizontal: spacing.md,
        marginTop: spacing.md,
        gap: spacing.sm,
    },
    statCard: {
        flex: 1,
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    statIcon: { fontSize: 22, marginBottom: spacing.xs },
    statValue: { fontSize: typography.md, fontWeight: '700' },
    statLabel: { fontSize: typography.xs, color: colors.textMuted, marginTop: 2 },
    // Section
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        marginTop: spacing.xl,
        marginBottom: spacing.md,
    },
    sectionTitle: {
        fontSize: typography.lg,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    // Actions
    actionsGrid: {
        flexDirection: 'row',
        paddingHorizontal: spacing.md,
        gap: spacing.sm,
    },
    actionCard: {
        flex: 1,
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
    },
    actionIcon: { fontSize: 32, marginBottom: spacing.sm },
    actionLabel: {
        fontSize: typography.sm,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 2,
    },
    actionDesc: {
        fontSize: typography.xs,
        color: colors.textMuted,
    },
    // Cameras
    cameraRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    cameraDot: { fontSize: 16 },
    cameraName: {
        fontSize: typography.md,
        fontWeight: '500',
        color: colors.textPrimary,
    },
    cameraProfiles: {
        fontSize: typography.xs,
        color: colors.textMuted,
    },
});
