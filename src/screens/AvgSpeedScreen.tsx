import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function AvgSpeedScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Average Speed</Text>
      <Text style={styles.sub}>Multi-camera section enforcement — Phase 7</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  sub: { color: '#666', fontSize: 14, textAlign: 'center' },
});
