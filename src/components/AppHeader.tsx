import { ReactNode } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
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

export function AppHeader({ right, children }: { right?: ReactNode; children?: ReactNode }) {
  const C = useTheme()
  const styles = makeStyles(C)
  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        {children ?? <AppWordmark />}
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
