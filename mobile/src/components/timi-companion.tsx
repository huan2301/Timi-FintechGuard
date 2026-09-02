import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadows, spacing } from '@/constants/theme';

export type CompanionSuggestion = string | { label: string; prompt: string };

export function TimiAvatar({ size = 44, online = false }: { size?: number; online?: boolean }) {
  const iconSize = Math.round(size * 0.46);
  return (
    <View style={[styles.avatar, { borderRadius: size * 0.34, height: size, width: size }]}>
      <View style={styles.avatarGlow} />
      <MaterialCommunityIcons color={colors.white} name="creation" size={iconSize} />
      {online ? <View style={styles.onlineDot} /> : null}
    </View>
  );
}

export function TimiCompanion({
  message,
  suggestions = [],
  context = 'Timi đồng hành',
  defaultPrompt = 'Timi có thể giúp tôi việc gì tiếp theo?',
  compact = false,
}: {
  message: string;
  suggestions?: CompanionSuggestion[];
  context?: string;
  defaultPrompt?: string;
  compact?: boolean;
}) {
  const openAssistant = (prompt: string) => {
    router.push({
      pathname: '/assistant',
      params: { prompt, context, source: 'companion', requestId: String(Date.now()) },
    } as Href);
  };

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View pointerEvents="none" style={styles.orbLarge} />
      <View pointerEvents="none" style={styles.orbSmall} />
      <Pressable
        accessibilityRole="button"
        onPress={() => openAssistant(defaultPrompt)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
        <TimiAvatar online size={compact ? 40 : 48} />
        <View style={styles.headerText}>
          <View style={styles.contextRow}>
            <Text style={styles.context}>{context}</Text>
            <View style={styles.onlinePill}><View style={styles.onlinePillDot} /><Text style={styles.onlineText}>Sẵn sàng</Text></View>
          </View>
          <Text style={[styles.message, compact && styles.messageCompact]}>{message}</Text>
        </View>
        <View style={styles.askButton}>
          <MaterialCommunityIcons color={colors.primary} name="arrow-top-right" size={18} />
        </View>
      </Pressable>

      {suggestions.length ? (
        <View style={styles.suggestions}>
          {suggestions.slice(0, 3).map((item) => {
            const label = typeof item === 'string' ? item : item.label;
            const prompt = typeof item === 'string' ? item : item.prompt;
            return (
              <Pressable
                accessibilityRole="button"
                key={`${label}-${prompt}`}
                onPress={() => openAssistant(prompt)}
                style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
                <MaterialCommunityIcons color={colors.primary} name="message-question-outline" size={17} />
                <Text numberOfLines={2} style={styles.suggestionText}>{label}</Text>
                <MaterialCommunityIcons color="#9997C7" name="chevron-right" size={18} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.lavenderSoft,
    borderColor: '#E3DFFF',
    borderRadius: radius.large,
    borderWidth: 1,
    gap: spacing.md,
    overflow: 'hidden',
    padding: spacing.lg,
    ...(shadows ?? {}),
  },
  cardCompact: { padding: spacing.md },
  orbLarge: { backgroundColor: '#DCD7FF', borderRadius: 80, height: 150, opacity: 0.52, position: 'absolute', right: -58, top: -78, width: 150 },
  orbSmall: { backgroundColor: colors.cyan, borderRadius: 34, bottom: -38, height: 72, opacity: 0.12, position: 'absolute', right: 58, width: 72 },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  headerText: { flex: 1, gap: 5 },
  contextRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  context: { color: colors.primaryDark, fontSize: 11, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  onlinePill: { alignItems: 'center', backgroundColor: '#FFFFFFA8', borderRadius: radius.pill, flexDirection: 'row', gap: 4, paddingHorizontal: 7, paddingVertical: 3 },
  onlinePillDot: { backgroundColor: colors.green, borderRadius: 3, height: 6, width: 6 },
  onlineText: { color: '#39806B', fontSize: 9, fontWeight: '800' },
  message: { color: colors.text, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  messageCompact: { fontSize: 13, lineHeight: 18 },
  avatar: { alignItems: 'center', backgroundColor: colors.primary, justifyContent: 'center', overflow: 'hidden' },
  avatarGlow: { backgroundColor: '#FFFFFF2E', borderRadius: 30, height: 54, left: -20, position: 'absolute', top: -24, width: 54 },
  onlineDot: { backgroundColor: colors.green, borderColor: colors.white, borderRadius: 6, borderWidth: 2, bottom: -1, height: 12, position: 'absolute', right: -1, width: 12 },
  askButton: { alignItems: 'center', backgroundColor: colors.white, borderRadius: 14, height: 36, justifyContent: 'center', width: 36 },
  suggestions: { gap: spacing.sm },
  suggestion: { alignItems: 'center', backgroundColor: '#FFFFFFB8', borderColor: '#E8E4FF', borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  suggestionText: { color: colors.primaryDark, flex: 1, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
