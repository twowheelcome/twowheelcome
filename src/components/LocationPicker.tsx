import { View, Text, StyleSheet } from 'react-native'

export interface Pin {
  lat: number
  lng: number
  city?: string
  country?: string
}

interface Props {
  pin: Pin | null
  onChange: (pin: Pin) => void
}

export default function LocationPicker(_props: Props) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.text}>🗺 Výběr na mapě je dostupný ve webové verzi</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  placeholder: {
    height: '100%' as any,
    backgroundColor: '#2d2d2d',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  text: { color: '#555', fontSize: 13, textAlign: 'center' },
})
