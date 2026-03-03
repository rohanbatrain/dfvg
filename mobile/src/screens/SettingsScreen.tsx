import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, Alert, Linking, Modal, SafeAreaView
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useServer } from '../context/ServerContext';
import { colors, spacing, borderRadius, typography, globalStyles } from '../styles/theme';

export default function SettingsScreen() {
    const { serverUrl, setServerUrl, isConnected, checkConnection } = useServer();
    const [editUrl, setEditUrl] = useState(serverUrl);
    const [testing, setTesting] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();

    const handleSaveUrl = async (url: string) => {
        setTesting(true);
        try {
            await setServerUrl(url.trim());
            Alert.alert('Connected', 'Successfully connected to server');
        } catch {
            Alert.alert('Error', 'Could not connect to the server');
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        await handleSaveUrl(editUrl);
    };

    const handleScanPress = async () => {
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                Alert.alert("Permission Required", "Camera access is needed to scan QR codes.");
                return;
            }
        }
        setIsScanning(true);
    };

    const handleBarcodeScanned = ({ data }: { data: string }) => {
        setIsScanning(false);
        if (data && data.startsWith('http')) {
            setEditUrl(data);
            handleSaveUrl(data);
        } else {
            Alert.alert("Invalid QR Code", "Please scan a valid DFVG server QR code.");
        }
    };

    const handleRetest = async () => {
        setTesting(true);
        const ok = await checkConnection();
        setTesting(false);
        if (ok) {
            Alert.alert('✅ Connected', 'Server is reachable');
        } else {
            Alert.alert('❌ Failed', 'Could not reach the server');
        }
    };

    return (
        <ScrollView
            style={globalStyles.container}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
        >
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerIcon}>⚙️</Text>
                <Text style={globalStyles.title}>Settings</Text>
            </View>

            {/* Server Connection */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>🌐 Server Connection</Text>
            </View>
            <View style={globalStyles.card}>
                <View style={styles.statusRow}>
                    <View style={[styles.dot, { backgroundColor: isConnected ? colors.success : colors.error }]} />
                    <Text style={globalStyles.text}>
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </Text>
                </View>

                <Text style={[globalStyles.textMuted, { marginTop: spacing.md, marginBottom: spacing.xs }]}>
                    Server URL
                </Text>
                <TextInput
                    style={globalStyles.input}
                    value={editUrl}
                    onChangeText={setEditUrl}
                    placeholder="http://192.168.1.100:8000"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                />
                <View style={styles.btnRow}>
                    <TouchableOpacity
                        style={[globalStyles.btnSecondary, { flex: 1 }]}
                        onPress={handleScanPress}
                        disabled={testing}
                    >
                        <Text style={globalStyles.btnText}>📷 Scan QR to Connect</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.btnRow}>
                    <TouchableOpacity
                        style={globalStyles.btnSecondary}
                        onPress={handleRetest}
                        disabled={testing}
                    >
                        <Text style={globalStyles.btnText}>🔄 Test</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[globalStyles.btnPrimary, { flex: 1 }]}
                        onPress={handleSave}
                        disabled={testing}
                    >
                        <Text style={globalStyles.btnText}>💾 Save & Connect</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* About */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>ℹ️ About</Text>
            </View>
            <View style={globalStyles.card}>
                <View style={styles.aboutRow}>
                    <Text style={globalStyles.textSecondary}>App Version</Text>
                    <Text style={globalStyles.text}>1.0.0</Text>
                </View>
                <View style={styles.aboutRow}>
                    <Text style={globalStyles.textSecondary}>Backend</Text>
                    <Text style={globalStyles.text}>FastAPI</Text>
                </View>
                <View style={styles.aboutRow}>
                    <Text style={globalStyles.textSecondary}>Formats</Text>
                    <Text style={globalStyles.text}>MP4, MOV, MKV, MXF</Text>
                </View>
            </View>

            {/* Help */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>💡 How to Connect</Text>
            </View>
            <View style={globalStyles.card}>
                <Text style={[globalStyles.textSecondary, { lineHeight: 22 }]}>
                    1. Make sure your computer and phone are on the same WiFi{'\n'}
                    2. Run the DFVG server on your computer:{'\n'}
                    {'   '}python3 -m uvicorn dfvg.api:app --host 0.0.0.0{'\n'}
                    3. Enter the URL shown on the DFVG dashboard above
                </Text>
            </View>

            {/* Scanner Modal */}
            <Modal visible={isScanning} animationType="slide" presentationStyle="pageSheet">
                <SafeAreaView style={styles.scannerContainer}>
                    <View style={styles.scannerHeader}>
                        <Text style={styles.scannerTitle}>Scan Dashboard QR Code</Text>
                        <TouchableOpacity onPress={() => setIsScanning(false)} style={styles.closeBtn}>
                            <Text style={styles.closeBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.cameraWrapper}>
                        <CameraView
                            style={StyleSheet.absoluteFillObject}
                            facing="back"
                            onBarcodeScanned={handleBarcodeScanned}
                            barcodeScannerSettings={{
                                barcodeTypes: ["qr"],
                            }}
                        />
                        <View style={styles.overlay}>
                            <View style={styles.scanTarget} />
                        </View>
                    </View>
                </SafeAreaView>
            </Modal>
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
    sectionHeader: {
        paddingHorizontal: spacing.lg,
        marginTop: spacing.xl,
        marginBottom: spacing.md,
    },
    sectionTitle: {
        fontSize: typography.lg,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    dot: { width: 10, height: 10, borderRadius: 5 },
    btnRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginTop: spacing.md,
    },
    aboutRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    scannerContainer: {
        flex: 1,
        backgroundColor: colors.bgPrimary,
    },
    scannerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.md,
        backgroundColor: colors.bgPrimary,
    },
    scannerTitle: {
        fontSize: typography.md,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    closeBtn: {
        padding: spacing.sm,
    },
    closeBtnText: {
        color: colors.accentPrimary,
        fontSize: typography.md,
        fontWeight: '600',
    },
    cameraWrapper: {
        flex: 1,
        position: 'relative',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'none',
    },
    scanTarget: {
        width: 250,
        height: 250,
        borderWidth: 2,
        borderColor: colors.accentPrimary,
        backgroundColor: 'transparent',
    }
});
