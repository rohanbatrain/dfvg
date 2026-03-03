import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TextInput,
    TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, spacing, borderRadius, typography, globalStyles } from '../styles/theme';
import { dfvgApi } from '../services/api';

interface ClipInfo {
    filename: string;
    width: number;
    height: number;
    fps: number;
    duration: number;
    video_codec: string;
    bit_depth: number;
    camera_model?: string;
    color_profile: string;
}

function formatDuration(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatRes(w: number) {
    if (w >= 3840) return '4K';
    if (w >= 2560) return '2.7K';
    if (w >= 1920) return '1080p';
    if (w >= 1280) return '720p';
    return `${w}p`;
}

function profileColor(profile: string) {
    if (profile === 'D-Log M') return colors.warning;
    if (profile === 'D-Cinelike') return '#eab308';
    return colors.success;
}

export default function ScanScreen() {
    const [path, setPath] = useState('');
    const [scanning, setScanning] = useState(false);
    const [clips, setClips] = useState<ClipInfo[]>([]);
    const [scannedPath, setScannedPath] = useState('');
    const [mode, setMode] = useState<'A' | 'B'>('A');
    const [starting, setStarting] = useState(false);

    const handleScan = async () => {
        if (!path.trim()) return;
        setScanning(true);
        setClips([]);
        try {
            const res = await dfvgApi.scan(path.trim());
            setClips(res.data.clips);
            setScannedPath(res.data.path);
            Haptics.notificationAsync(
                res.data.clips.length > 0
                    ? Haptics.NotificationFeedbackType.Success
                    : Haptics.NotificationFeedbackType.Warning
            );
        } catch (error: any) {
            const msg = error.response?.data?.detail || 'Scan failed';
            Alert.alert('Scan Error', msg);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setScanning(false);
        }
    };

    const handleStartJob = async () => {
        if (!scannedPath) return;
        setStarting(true);
        try {
            await dfvgApi.createJob(scannedPath, mode);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Job Started', 'Check the Jobs tab to monitor progress.');
        } catch (error: any) {
            Alert.alert('Error', 'Failed to start processing job');
        } finally {
            setStarting(false);
        }
    };

    const totalDuration = clips.reduce((a, c) => a + c.duration, 0);
    const profileCounts: Record<string, number> = {};
    clips.forEach(c => { profileCounts[c.color_profile] = (profileCounts[c.color_profile] || 0) + 1; });

    return (
        <ScrollView
            style={globalStyles.container}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerIcon}>📂</Text>
                <Text style={globalStyles.title}>Scan Folder</Text>
                <Text style={globalStyles.textSecondary}>
                    Enter the path to your DJI footage directory
                </Text>
            </View>

            {/* Path Input */}
            <View style={styles.inputSection}>
                <TextInput
                    style={globalStyles.input}
                    value={path}
                    onChangeText={setPath}
                    placeholder="/Volumes/SD_CARD/DCIM/100MEDIA"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={handleScan}
                />
                <TouchableOpacity
                    style={[globalStyles.btnPrimary, scanning && { opacity: 0.6 }]}
                    onPress={handleScan}
                    disabled={scanning || !path.trim()}
                    activeOpacity={0.8}
                >
                    {scanning ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <Text style={globalStyles.btnText}>🔍  Scan Directory</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Results */}
            {clips.length > 0 && (
                <View style={styles.results}>
                    {/* Summary Bar */}
                    <View style={styles.summaryBar}>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryValue}>{clips.length}</Text>
                            <Text style={styles.summaryLabel}>Clips</Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryValue}>{formatDuration(totalDuration)}</Text>
                            <Text style={styles.summaryLabel}>Total</Text>
                        </View>
                        {Object.entries(profileCounts).map(([profile, count]) => (
                            <React.Fragment key={profile}>
                                <View style={styles.divider} />
                                <View style={styles.summaryItem}>
                                    <Text style={[styles.summaryValue, { color: profileColor(profile) }]}>{count}</Text>
                                    <Text style={styles.summaryLabel}>{profile}</Text>
                                </View>
                            </React.Fragment>
                        ))}
                    </View>

                    {/* Mode Toggle */}
                    <View style={styles.modeToggle}>
                        <TouchableOpacity
                            style={[styles.modeBtn, mode === 'A' && styles.modeBtnActive]}
                            onPress={() => setMode('A')}
                        >
                            <Text style={[styles.modeBtnText, mode === 'A' && styles.modeBtnTextActive]}>
                                ⚡ Compact (H.265)
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modeBtn, mode === 'B' && styles.modeBtnActiveB]}
                            onPress={() => setMode('B')}
                        >
                            <Text style={[styles.modeBtnText, mode === 'B' && styles.modeBtnTextActive]}>
                                🎬 ProRes (HQ)
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Start Button */}
                    <TouchableOpacity
                        style={[styles.startBtn, starting && { opacity: 0.6 }]}
                        onPress={handleStartJob}
                        disabled={starting}
                        activeOpacity={0.8}
                    >
                        {starting ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.startBtnText}>▶  Start Processing</Text>
                        )}
                    </TouchableOpacity>

                    {/* Clip Cards */}
                    <Text style={[globalStyles.subtitle, { marginBottom: spacing.md }]}>
                        Detected Clips
                    </Text>
                    {clips.map((clip, i) => (
                        <View key={i} style={styles.clipCard}>
                            <View style={styles.clipHeader}>
                                <Text style={styles.clipName} numberOfLines={1}>🎞️ {clip.filename}</Text>
                                <View style={[styles.profileBadge, { backgroundColor: profileColor(clip.color_profile) + '20' }]}>
                                    <Text style={[styles.profileText, { color: profileColor(clip.color_profile) }]}>
                                        {clip.color_profile}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.clipMeta}>
                                <Text style={styles.metaItem}>📐 {formatRes(clip.width)}</Text>
                                <Text style={styles.metaItem}>🔄 {clip.fps} fps</Text>
                                <Text style={styles.metaItem}>⏱ {formatDuration(clip.duration)}</Text>
                                <Text style={styles.metaItem}>🎥 {clip.video_codec} · {clip.bit_depth}-bit</Text>
                            </View>
                            {clip.camera_model && (
                                <Text style={styles.cameraModel}>{clip.camera_model}</Text>
                            )}
                        </View>
                    ))}
                </View>
            )}

            {/* Empty state after scan */}
            {clips.length === 0 && scannedPath !== '' && !scanning && (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>📭</Text>
                    <Text style={styles.emptyText}>No video files found in this directory</Text>
                </View>
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
    inputSection: {
        paddingHorizontal: spacing.md,
        gap: spacing.md,
        marginBottom: spacing.lg,
    },
    results: { paddingHorizontal: spacing.md },
    // Summary
    summaryBar: {
        flexDirection: 'row',
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: spacing.md,
        justifyContent: 'space-around',
    },
    summaryItem: { alignItems: 'center' },
    summaryValue: {
        fontSize: typography.lg,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    summaryLabel: {
        fontSize: 10,
        color: colors.textMuted,
        marginTop: 2,
    },
    divider: {
        width: 1,
        backgroundColor: colors.border,
        marginHorizontal: spacing.xs,
    },
    // Mode Toggle
    modeToggle: {
        flexDirection: 'row',
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.md,
        padding: 3,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    modeBtn: {
        flex: 1,
        paddingVertical: spacing.sm + 2,
        alignItems: 'center',
        borderRadius: borderRadius.sm,
    },
    modeBtnActive: { backgroundColor: colors.accentPrimary },
    modeBtnActiveB: { backgroundColor: colors.info },
    modeBtnText: {
        fontSize: typography.xs,
        fontWeight: '600',
        color: colors.textMuted,
    },
    modeBtnTextActive: { color: '#fff' },
    // Start Button
    startBtn: {
        backgroundColor: colors.accentPrimary,
        borderRadius: borderRadius.md,
        paddingVertical: spacing.md,
        alignItems: 'center',
        marginBottom: spacing.xl,
        shadowColor: colors.accentPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    startBtnText: {
        color: '#fff',
        fontSize: typography.md,
        fontWeight: '700',
    },
    // Clip Cards
    clipCard: {
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    clipHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    clipName: {
        fontSize: typography.sm,
        fontWeight: '600',
        color: colors.textPrimary,
        flex: 1,
        marginRight: spacing.sm,
    },
    profileBadge: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: borderRadius.full,
    },
    profileText: { fontSize: 10, fontWeight: '600' },
    clipMeta: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md,
    },
    metaItem: {
        fontSize: typography.xs,
        color: colors.textSecondary,
    },
    cameraModel: {
        fontSize: typography.xs,
        color: colors.textMuted,
        marginTop: spacing.xs,
    },
    // Empty
    emptyState: {
        margin: spacing.md,
        backgroundColor: colors.warning + '10',
        borderRadius: borderRadius.lg,
        padding: spacing.xl,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.warning + '30',
    },
    emptyIcon: { fontSize: 32, marginBottom: spacing.sm },
    emptyText: {
        fontSize: typography.sm,
        color: colors.warning,
        fontWeight: '500',
    },
});
