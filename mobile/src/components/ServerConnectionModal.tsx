import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
    SafeAreaView, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useServer } from '../context/ServerContext';
import { colors, spacing, borderRadius, typography } from '../styles/theme';

export default function ServerConnectionModal() {
    const { isConnected, isLoading, setServerUrl, serverUrl, checkConnection } = useServer();
    const [inputUrl, setInputUrl] = useState(serverUrl || 'http://');
    const [testing, setTesting] = useState(false);
    const [error, setError] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();

    if (isLoading || isConnected) return null;

    const handleConnect = async () => {
        const url = inputUrl.trim();
        if (!url || !url.startsWith('http')) {
            setError('Enter a valid URL (e.g. http://192.168.1.100:8000)');
            return;
        }
        setTesting(true);
        setError('');
        try {
            await setServerUrl(url);
        } catch {
            setError('Could not connect to server');
        } finally {
            setTesting(false);
        }
    };

    const handleScanPress = async () => {
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                Alert.alert('Permission Required', 'Camera access is needed to scan QR codes.');
                return;
            }
        }
        setIsScanning(true);
    };

    const handleBarcodeScanned = ({ data }: { data: string }) => {
        setIsScanning(false);
        if (data && data.startsWith('http')) {
            setInputUrl(data);
            // Auto-connect
            setTesting(true);
            setError('');
            setServerUrl(data.trim())
                .catch(() => setError('Could not connect to server'))
                .finally(() => setTesting(false));
        } else {
            Alert.alert('Invalid QR Code', 'Please scan a valid DFVG server QR code.');
        }
    };

    return (
        <Modal visible transparent animationType="fade">
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.card}>
                    <Text style={styles.icon}>🎬</Text>
                    <Text style={styles.title}>Connect to DFVG</Text>
                    <Text style={styles.subtitle}>
                        Enter the server URL shown on your computer's DFVG dashboard
                    </Text>

                    <TextInput
                        style={styles.input}
                        value={inputUrl}
                        onChangeText={setInputUrl}
                        placeholder="http://192.168.1.100:8000"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        returnKeyType="go"
                        onSubmitEditing={handleConnect}
                    />

                    {error ? (
                        <View style={styles.errorRow}>
                            <Text style={styles.errorText}>⚠️ {error}</Text>
                        </View>
                    ) : null}

                    <TouchableOpacity
                        style={[styles.btn, testing && styles.btnDisabled]}
                        onPress={handleConnect}
                        disabled={testing}
                        activeOpacity={0.8}
                    >
                        {testing ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.btnText}>Connect</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.scanBtn}
                        onPress={handleScanPress}
                        disabled={testing}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.scanBtnText}>📷 Scan QR to Connect</Text>
                    </TouchableOpacity>

                    <Text style={styles.hint}>
                        💡 Run the DFVG server on your computer first:{'\n'}
                        <Text style={styles.code}>python3 -m uvicorn dfvg.api:app --host 0.0.0.0</Text>
                    </Text>
                </View>
            </KeyboardAvoidingView>

            {/* QR Scanner Modal */}
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
                                barcodeTypes: ['qr'],
                            }}
                        />
                        <View style={styles.scannerOverlay}>
                            <View style={styles.scanTarget} />
                            <Text style={styles.scanHint}>Point at the QR code on your DFVG dashboard</Text>
                        </View>
                    </View>
                </SafeAreaView>
            </Modal>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.lg,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.xl,
        padding: spacing.xl,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    icon: { fontSize: 48, marginBottom: spacing.md },
    title: {
        fontSize: typography.xxl,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: spacing.xs,
    },
    subtitle: {
        fontSize: typography.sm,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: spacing.xl,
        lineHeight: 20,
    },
    input: {
        width: '100%',
        backgroundColor: colors.bgTertiary,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        color: colors.textPrimary,
        fontSize: typography.md,
        marginBottom: spacing.md,
    },
    errorRow: {
        width: '100%',
        backgroundColor: colors.error + '15',
        borderRadius: borderRadius.md,
        padding: spacing.sm,
        marginBottom: spacing.md,
    },
    errorText: {
        color: colors.error,
        fontSize: typography.xs,
        textAlign: 'center',
    },
    btn: {
        width: '100%',
        backgroundColor: colors.accentPrimary,
        borderRadius: borderRadius.md,
        paddingVertical: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.lg,
    },
    btnDisabled: { opacity: 0.6 },
    btnText: {
        color: '#fff',
        fontSize: typography.md,
        fontWeight: '600',
    },
    hint: {
        fontSize: typography.xs,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 18,
    },
    code: {
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        color: colors.textSecondary,
        fontSize: 11,
    },
    scanBtn: {
        width: '100%',
        borderWidth: 1,
        borderColor: colors.accentPrimary,
        borderRadius: borderRadius.md,
        paddingVertical: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.lg,
    },
    scanBtnText: {
        color: colors.accentPrimary,
        fontSize: typography.md,
        fontWeight: '600',
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
    scannerOverlay: {
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
    },
    scanHint: {
        color: '#fff',
        fontSize: typography.sm,
        marginTop: spacing.lg,
        textAlign: 'center',
        opacity: 0.8,
    },
});
