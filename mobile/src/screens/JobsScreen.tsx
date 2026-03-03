import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    RefreshControl, Animated,
} from 'react-native';
import { colors, spacing, borderRadius, typography, globalStyles } from '../styles/theme';
import { dfvgApi } from '../services/api';

interface JobResponse {
    job_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    current_file?: string;
    message?: string;
    manifest_path?: string;
}

function statusColor(status: string) {
    switch (status) {
        case 'completed': return colors.success;
        case 'failed': return colors.error;
        case 'processing': return colors.accentPrimary;
        default: return colors.textMuted;
    }
}

function statusIcon(status: string) {
    switch (status) {
        case 'completed': return '✅';
        case 'failed': return '❌';
        case 'processing': return '⚙️';
        default: return '⏳';
    }
}

export default function JobsScreen() {
    const [refreshing, setRefreshing] = useState(false);
    const [activeJob, setActiveJob] = useState<JobResponse | null>(null);
    const [history, setHistory] = useState<JobResponse[]>([]);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const progressAnim = useRef(new Animated.Value(0)).current;

    // Poll active job
    useEffect(() => {
        if (!activeJob || ['completed', 'failed'].includes(activeJob.status)) {
            if (pollRef.current) clearInterval(pollRef.current);
            return;
        }
        pollRef.current = setInterval(async () => {
            try {
                const res = await dfvgApi.getJob(activeJob.job_id);
                setActiveJob(res.data);
                Animated.timing(progressAnim, {
                    toValue: res.data.progress,
                    duration: 400,
                    useNativeDriver: false,
                }).start();
                if (['completed', 'failed'].includes(res.data.status)) {
                    setHistory(prev => [res.data, ...prev]);
                }
            } catch { }
        }, 1000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [activeJob?.status, activeJob?.job_id]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        // Try to find any recent active job
        setRefreshing(false);
    }, []);

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
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerIcon}>📊</Text>
                <Text style={globalStyles.title}>Jobs</Text>
                <Text style={globalStyles.textSecondary}>
                    Monitor processing progress & history
                </Text>
            </View>

            {/* Active Job */}
            {activeJob && !['completed', 'failed'].includes(activeJob.status) && (
                <View style={styles.activeCard}>
                    <View style={styles.activeHeader}>
                        <Text style={styles.activeIcon}>
                            {statusIcon(activeJob.status)}
                        </Text>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.activeTitle}>
                                {activeJob.status === 'processing' ? 'Processing…' : 'Queued'}
                            </Text>
                            {activeJob.current_file && (
                                <Text style={styles.activeFile} numberOfLines={1}>
                                    {activeJob.current_file}
                                </Text>
                            )}
                        </View>
                        <Text style={styles.activePercent}>
                            {(activeJob.progress * 100).toFixed(0)}%
                        </Text>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressTrack}>
                        <Animated.View
                            style={[
                                styles.progressFill,
                                {
                                    width: progressAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: ['0%', '100%'],
                                    }),
                                },
                            ]}
                        />
                    </View>

                    {activeJob.message && (
                        <Text style={styles.activeMessage}>{activeJob.message}</Text>
                    )}
                </View>
            )}

            {/* Job History */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>📋 History</Text>
                {history.length > 0 && (
                    <View style={styles.countBadge}>
                        <Text style={styles.countText}>{history.length}</Text>
                    </View>
                )}
            </View>

            {history.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>📭</Text>
                    <Text style={styles.emptyTitle}>No jobs yet</Text>
                    <Text style={styles.emptySubtitle}>
                        Start a scan job from the Scan tab to see it here
                    </Text>
                </View>
            ) : (
                history.map((job, i) => (
                    <View key={i} style={styles.historyCard}>
                        <View style={styles.historyRow}>
                            <Text style={styles.historyIcon}>{statusIcon(job.status)}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.historyId}>
                                    Job {job.job_id.slice(0, 8)}…
                                </Text>
                                <Text style={styles.historyMsg}>{job.message || job.status}</Text>
                            </View>
                            <View style={[styles.statusBadge, { backgroundColor: statusColor(job.status) + '20' }]}>
                                <Text style={[styles.statusText, { color: statusColor(job.status) }]}>
                                    {job.status.toUpperCase()}
                                </Text>
                            </View>
                        </View>
                    </View>
                ))
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    content: { paddingBottom: spacing.xxl + 80 },
    header: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xl,
        paddingBottom: spacing.md,
        gap: spacing.xs,
    },
    headerIcon: { fontSize: 40 },
    // Active
    activeCard: {
        marginHorizontal: spacing.md,
        backgroundColor: colors.accentPrimary + '10',
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.accentPrimary + '30',
        marginBottom: spacing.lg,
    },
    activeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        marginBottom: spacing.md,
    },
    activeIcon: { fontSize: 28 },
    activeTitle: {
        fontSize: typography.md,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    activeFile: {
        fontSize: typography.xs,
        color: colors.textMuted,
        fontFamily: 'monospace',
    },
    activePercent: {
        fontSize: typography.xxl,
        fontWeight: '700',
        color: colors.accentPrimary,
    },
    progressTrack: {
        height: 6,
        backgroundColor: colors.bgTertiary,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.accentPrimary,
        borderRadius: 3,
    },
    activeMessage: {
        fontSize: typography.xs,
        color: colors.textMuted,
        marginTop: spacing.sm,
    },
    // Section
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        marginTop: spacing.lg,
        marginBottom: spacing.md,
    },
    sectionTitle: {
        fontSize: typography.lg,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    countBadge: {
        backgroundColor: colors.accentPrimary + '20',
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: borderRadius.full,
    },
    countText: {
        fontSize: typography.xs,
        fontWeight: '600',
        color: colors.accentPrimary,
    },
    // History
    historyCard: {
        marginHorizontal: spacing.md,
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    historyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    historyIcon: { fontSize: 20 },
    historyId: {
        fontSize: typography.sm,
        fontWeight: '600',
        color: colors.textPrimary,
        fontFamily: 'monospace',
    },
    historyMsg: {
        fontSize: typography.xs,
        color: colors.textMuted,
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: borderRadius.full,
    },
    statusText: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    // Empty
    emptyState: {
        margin: spacing.md,
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.xl,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    emptyIcon: { fontSize: 40, marginBottom: spacing.md },
    emptyTitle: {
        fontSize: typography.md,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: spacing.xs,
    },
    emptySubtitle: {
        fontSize: typography.sm,
        color: colors.textMuted,
        textAlign: 'center',
    },
});
