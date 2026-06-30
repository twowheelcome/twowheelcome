import { View, Text } from 'react-native'
import { useTheme } from '../lib/ThemeContext'

export interface Pin {
  lat: number
  lng: number
  city?: string
  country?: string
  district?: string
}

interface Props {
  pin: Pin | null
  onChange: (pin: Pin) => void
}

export default function LocationPicker(_props: Props) {
  const C = useTheme()
  return (
    <View style={{ height: '100%' as any, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Text style={{ color: C.textFaint, fontSize: 13, textAlign: 'center' }}>🗺 Výběr na mapě je dostupný ve webové verzi</Text>
    </View>
  )
}
