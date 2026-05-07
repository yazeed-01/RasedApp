import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  reason: 'no-permission' | 'no-device';
  onRequestPermission?: () => void;
}

export default function NoCameraView({ reason, onRequestPermission }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{reason === 'no-permission' ? '🔒' : '📷'}</Text>
      <Text style={styles.title}>
        {reason === 'no-permission' ? 'Camera Permission Required' : 'No Camera Found'}
      </Text>
      <Text style={styles.sub}>
        {reason === 'no-permission'
          ? 'Rased needs camera access to detect and measure vehicle speeds.'
          : 'No back camera was found on this device.'}
      </Text>
      {reason === 'no-permission' && onRequestPermission && (
        <TouchableOpacity style={styles.btn} onPress={onRequestPermission}>
          <Text style={styles.btnText}>Grant Permission</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', padding: 32 },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  sub: { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  btn: { backgroundColor: '#e74c3c', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
