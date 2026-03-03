import { StyleSheet } from 'react-native';

export const TAB_BAR_HEIGHT = 100;

export const colors = {
    bgPrimary: '#0a0a12',
    bgSecondary: '#14142a',
    bgTertiary: '#1e1e38',
    bgElevated: '#282848',

    accentPrimary: '#3b82f6',
    accentSecondary: '#60a5fa',
    accentGlow: 'rgba(59, 130, 246, 0.3)',

    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#6366f1',

    textPrimary: '#f8fafc',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',

    border: 'rgba(255, 255, 255, 0.08)',
    borderHover: 'rgba(255, 255, 255, 0.15)',
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

export const borderRadius = {
    sm: 6,
    md: 10,
    lg: 16,
    xl: 24,
    full: 9999,
};

export const typography = {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
};

export const globalStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bgPrimary,
    },

    card: {
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
    },

    title: {
        fontSize: typography.xxxl,
        fontWeight: '700',
        color: colors.textPrimary,
    },

    subtitle: {
        fontSize: typography.lg,
        fontWeight: '600',
        color: colors.textPrimary,
    },

    text: {
        fontSize: typography.md,
        color: colors.textPrimary,
    },

    textSecondary: {
        fontSize: typography.sm,
        color: colors.textSecondary,
    },

    textMuted: {
        fontSize: typography.sm,
        color: colors.textMuted,
    },

    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    spaceBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },

    btnPrimary: {
        backgroundColor: colors.accentPrimary,
        paddingVertical: spacing.sm + 4,
        paddingHorizontal: spacing.lg,
        borderRadius: borderRadius.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
    },

    btnSecondary: {
        backgroundColor: colors.bgTertiary,
        paddingVertical: spacing.sm + 4,
        paddingHorizontal: spacing.lg,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
    },

    btnText: {
        color: colors.textPrimary,
        fontSize: typography.sm,
        fontWeight: '600',
    },

    input: {
        backgroundColor: colors.bgTertiary,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        color: colors.textPrimary,
        fontSize: typography.md,
    },

    badge: {
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        borderRadius: borderRadius.full,
        alignSelf: 'flex-start',
    },

    badgeText: {
        fontSize: typography.xs,
        fontWeight: '500',
    },
});
