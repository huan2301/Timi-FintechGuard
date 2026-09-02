import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  type TextInputProps,
  TextInput,
  type ViewStyle,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, maxContentWidth, radius, shadows, spacing } from '@/constants/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function AppScreen({
  children,
  scroll = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const content = <View style={[styles.content, contentStyle]}>{children}</View>;
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brandRow}>
      <View style={[styles.brandIcon, compact && styles.brandIconCompact]}>
        <MaterialCommunityIcons color={colors.white} name="shield-check" size={compact ? 18 : 22} />
      </View>
      <Text style={[styles.brandText, compact && styles.brandTextCompact]}>Timi</Text>
    </View>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel ? (
        <Pressable hitSlop={8} onPress={onAction}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  loadingLabel,
  loading,
  icon,
  variant = 'primary',
  disabled,
  style,
  ...props
}: PressableProps & {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  icon?: IconName;
  variant?: 'primary' | 'dark' | 'outline' | 'soft' | 'danger';
}) {
  const usesPrimaryText = variant === 'outline' || variant === 'soft';
  return (
    <Pressable
      {...props}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
        typeof style === 'function' ? style({ pressed, hovered: false }) : style,
      ]}>
      {loading ? <ActivityIndicator color={usesPrimaryText ? colors.primary : colors.white} size="small" /> : icon ? (
        <MaterialCommunityIcons
          color={usesPrimaryText ? colors.primary : colors.white}
          name={icon}
          size={20}
        />
      ) : null}
      <Text style={[styles.buttonText, usesPrimaryText && styles.buttonTextOutline]}>
        {loading ? (loadingLabel || label) : label}
      </Text>
    </Pressable>
  );
}

export function RoundIconButton({
  icon,
  badge,
  onPress,
}: {
  icon: IconName;
  badge?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.roundButton}>
      <MaterialCommunityIcons color={colors.navy} name={icon} size={22} />
      {badge ? <View style={styles.badge} /> : null}
    </Pressable>
  );
}

export function FormField({
  label,
  icon,
  right,
  ...props
}: TextInputProps & { label: string; icon?: IconName; right?: ReactNode }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.fieldShell, focused && styles.fieldShellFocused]}>
        {icon ? <MaterialCommunityIcons color={focused ? colors.primary : colors.textMuted} name={icon} size={20} /> : null}
        <TextInput
          {...props}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          placeholderTextColor="#9AA5B8"
          selectionColor={colors.primary}
          style={[styles.fieldInput, props.multiline && styles.fieldMultiline]}
        />
        {right}
      </View>
    </View>
  );
}

export function StatusPill({
  label,
  tone = 'green',
}: {
  label: string;
  tone?: 'green' | 'amber' | 'red' | 'blue';
}) {
  return (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      <View style={[styles.pillDot, styles[`pillDot_${tone}`]]} />
      <Text style={[styles.pillText, styles[`pillText_${tone}`]]}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ value, tone = 'blue' }: { value: number; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  const normalized = Math.max(0, Math.min(1, value));
  return (
    <View accessibilityRole="progressbar" style={styles.progressTrack}>
      <View style={[styles.progressFill, styles[`progressFill_${tone}`], { width: `${normalized * 100}%` }]} />
    </View>
  );
}

export function ScreenState({
  kind,
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
}: {
  kind: 'loading' | 'error' | 'empty' | 'success';
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const stateConfig = {
    error: { icon: 'cloud-alert-outline' as IconName, color: colors.red, background: colors.redSoft },
    empty: { icon: 'inbox-outline' as IconName, color: colors.textMuted, background: colors.surfaceMuted },
    success: { icon: 'check-decagram-outline' as IconName, color: colors.green, background: colors.greenSoft },
  };
  const config = kind === 'loading' ? null : stateConfig[kind];

  return (
    <View style={[styles.state, compact && styles.stateCompact]}>
      <View style={[styles.stateIcon, config && { backgroundColor: config.background }]}>
        {kind === 'loading' ? (
          <ActivityIndicator color={colors.primary} size={compact ? 'small' : 'large'} />
        ) : (
          <MaterialCommunityIcons color={config!.color} name={config!.icon} size={compact ? 23 : 30} />
        )}
      </View>
      <View style={styles.stateTextBox}>
        <Text style={[styles.stateTitle, compact && styles.stateTitleCompact]}>{title}</Text>
        {message ? <Text style={styles.stateMessage}>{message}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} onPress={onAction} variant="outline" />
      ) : null}
    </View>
  );
}

export function InlineNotice({
  tone = 'blue',
  title,
  message,
}: {
  tone?: 'blue' | 'green' | 'amber' | 'red';
  title?: string;
  message: string;
}) {
  const icon: Record<typeof tone, IconName> = {
    blue: 'information-outline',
    green: 'shield-check-outline',
    amber: 'alert-outline',
    red: 'alert-octagon-outline',
  };
  return (
    <View style={[styles.notice, styles[`notice_${tone}`]]}>
      <MaterialCommunityIcons color={styles[`noticeText_${tone}`].color} name={icon[tone]} size={20} />
      <View style={styles.noticeTextBox}>
        {title ? <Text style={[styles.noticeTitle, styles[`noticeText_${tone}`]]}>{title}</Text> : null}
        <Text style={[styles.noticeMessage, styles[`noticeText_${tone}`]]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scrollContent: { alignItems: 'center', flexGrow: 1 },
  content: {
    flex: 1,
    gap: spacing.xl,
    maxWidth: maxContentWidth,
    paddingBottom: 112,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    width: '100%',
  },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  brandIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  brandIconCompact: { borderRadius: 10, height: 34, width: 34 },
  brandText: { color: colors.navy, fontSize: 28, fontWeight: '800', letterSpacing: -1 },
  brandTextCompact: { fontSize: 23 },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  headerText: { flex: 1, gap: 4 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.15, textTransform: 'uppercase' },
  pageTitle: { color: colors.text, fontSize: 27, fontWeight: '900', letterSpacing: -1 },
  pageSubtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.large,
    borderWidth: 1,
    padding: spacing.xl,
    ...(shadows ?? {}),
  },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  sectionAction: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  button: {
    alignItems: 'center',
    borderRadius: radius.medium,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  button_primary: { backgroundColor: colors.primary },
  button_dark: { backgroundColor: colors.navy },
  button_outline: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1 },
  button_soft: { backgroundColor: colors.primarySoft },
  button_danger: { backgroundColor: colors.red },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  buttonTextOutline: { color: colors.primary },
  roundButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  badge: {
    backgroundColor: colors.red,
    borderColor: colors.white,
    borderRadius: 5,
    borderWidth: 2,
    height: 9,
    position: 'absolute',
    right: 8,
    top: 7,
    width: 9,
  },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  fieldShell: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  fieldShellFocused: { backgroundColor: colors.white, borderColor: colors.primary },
  fieldInput: { color: colors.text, flex: 1, fontSize: 16, minHeight: 52, paddingVertical: 0 },
  fieldMultiline: { minHeight: 88, paddingVertical: spacing.md, textAlignVertical: 'top' },
  pill: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radius.pill, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  pill_green: { backgroundColor: colors.greenSoft },
  pill_amber: { backgroundColor: colors.amberSoft },
  pill_red: { backgroundColor: colors.redSoft },
  pill_blue: { backgroundColor: colors.primarySoft },
  pillDot: { borderRadius: 4, height: 7, width: 7 },
  pillDot_green: { backgroundColor: colors.green },
  pillDot_amber: { backgroundColor: colors.amber },
  pillDot_red: { backgroundColor: colors.red },
  pillDot_blue: { backgroundColor: colors.primary },
  pillText: { fontSize: 12, fontWeight: '800' },
  pillText_green: { color: '#087B5C' },
  pillText_amber: { color: '#9B6100' },
  pillText_red: { color: '#B73545' },
  pillText_blue: { color: colors.primaryDark },
  progressTrack: { backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, height: 8, overflow: 'hidden', width: '100%' },
  progressFill: { borderRadius: radius.pill, height: '100%' },
  progressFill_blue: { backgroundColor: colors.primary },
  progressFill_green: { backgroundColor: colors.green },
  progressFill_amber: { backgroundColor: colors.amber },
  progressFill_red: { backgroundColor: colors.red },
  state: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.xxxl },
  stateCompact: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: spacing.sm, paddingVertical: spacing.lg },
  stateIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 22, height: 56, justifyContent: 'center', width: 56 },
  stateTextBox: { alignItems: 'center', flex: 1, gap: spacing.xs },
  stateTitle: { color: colors.text, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  stateTitleCompact: { fontSize: 14, textAlign: 'left' },
  stateMessage: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  notice: { alignItems: 'flex-start', borderRadius: radius.medium, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  notice_blue: { backgroundColor: colors.primarySoft },
  notice_green: { backgroundColor: colors.greenSoft },
  notice_amber: { backgroundColor: colors.amberSoft },
  notice_red: { backgroundColor: colors.redSoft },
  noticeTextBox: { flex: 1, gap: 3 },
  noticeTitle: { fontSize: 13, fontWeight: '900' },
  noticeMessage: { fontSize: 12, lineHeight: 18 },
  noticeText_blue: { color: colors.primaryDark },
  noticeText_green: { color: '#087B5C' },
  noticeText_amber: { color: '#7D5208' },
  noticeText_red: { color: '#A92F3E' },
});
