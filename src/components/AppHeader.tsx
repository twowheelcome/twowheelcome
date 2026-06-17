import { ReactNode } from 'react'
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'

const mark = require('../../assets/images/mark.png')

export function AppWordmark({ compact = false }: { compact?: boolean }) {
  const C = useTheme()
  const styles = makeStyles(C)
  return (
    <View style={styles.brand}>
      <Image source={mark} style={[styles.mark, compact && styles.markCompact]} resizeMode="contain" />
      <Text style={[styles.wordmark, compact && styles.wordmarkCompact]}>
        <Text style={styles.wordmarkAccent}>TWO</Text>WHEEL<Text style={styles.wordmarkAccent}>COME</Text>
      </Text>
    </View>
  )
}

export function HeaderBackButton({ onPress = () => router.back() }: { onPress?: () => void }) {
  const C = useTheme()
  const styles = makeStyles(C)
  return (
    <TouchableOpacity style={styles.backButton} onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
      <Text style={styles.backButtonText}>←</Text>
    </TouchableOpacity>
  )
}

export function AppHeader({ left, right, children, onLogoPress }: { left?: ReactNode; right?: ReactNode; children?: ReactNode; onLogoPress?: () => void }) {
  const C = useTheme()
  const styles = makeStyles(C)
  const content = children ?? (
    <TouchableOpacity
      onPress={onLogoPress ?? (() => router.push('/(tabs)/map'))}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel="Go to map"
    >
      <AppWordmark />
    </TouchableOpacity>
  )
  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        {left ? <View style={styles.headerLeft}>{left}</View> : null}
        <View style={styles.headerCenter}>{content}</View>
        {right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
    </View>
  )
}

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  header: {
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingTop: 46,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  headerInner: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  backButtonText: {
    color: C.accent,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 26,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  mark: {
    width: 34,
    height: 34,
  },
  markCompact: {
    width: 30,
    height: 30,
  },
  wordmark: {
    color: C.text,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
  },
  wordmarkCompact: {
    fontSize: 19,
  },
  wordmarkAccent: {
    color: C.accent,
  },
}) }
