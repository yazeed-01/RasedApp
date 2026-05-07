import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getSettings, saveSettings, resetSettings } from '../store/settings';
import type { CameraSettings, DetectorModel } from '../types';
import type { SettingsStackParamList } from '../navigation/RootNavigator';

const MODELS: { key: DetectorModel; label: string; sub: string }[] = [
  { key: 'yolov8n', label: 'YOLOv8n', sub: 'Fastest' },
  { key: 'yolov8s', label: 'YOLOv8s', sub: 'Balanced' },
  { key: 'yolov8m', label: 'YOLOv8m', sub: 'Most accurate' },
];

const SCENE_PRESETS: { label: string; mPerPx: number; hint: string }[] = [
  { label: 'Desk',     mPerPx: 0.0005, hint: 'Toy / phone close-up' },
  { label: 'Tabletop', mPerPx: 0.005,  hint: 'Across-the-room' },
  { label: 'Roadside', mPerPx: 0.05,   hint: 'Real vehicles' },
];

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'Settings'>;

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const [settings, setSettings] = useState<CameraSettings>(getSettings);

  function update(patch: Partial<CameraSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  }

  function handleReset() {
    Alert.alert('Reset Settings', 'Restore all defaults?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset', style: 'destructive', onPress: () => {
          resetSettings();
          setSettings(getSettings());
        }
      },
    ]);
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Field
        label="Camera ID"
        value={settings.cameraId}
        onChangeText={(v) => update({ cameraId: v })}
      />
      <Field
        label="Speed Limit (km/h)"
        value={String(settings.speedLimit)}
        keyboardType="numeric"
        onChangeText={(v) => update({ speedLimit: parseInt(v, 10) || 0 })}
      />
      <Field
        label="GPS Latitude"
        value={String(settings.gpsLat)}
        keyboardType="numeric"
        onChangeText={(v) => update({ gpsLat: parseFloat(v) || 0 })}
      />
      <Field
        label="GPS Longitude"
        value={String(settings.gpsLng)}
        keyboardType="numeric"
        onChangeText={(v) => update({ gpsLng: parseFloat(v) || 0 })}
      />

      <View style={styles.calibSection}>
        <Text style={styles.calibLabel}>Detection model</Text>
        <View style={styles.segRow}>
          {MODELS.map((m) => {
            const active = settings.detectorModel === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                style={[styles.segBtn, active && styles.segBtnActive]}
                onPress={() => update({ detectorModel: m.key })}
              >
                <Text style={[styles.segLabel, active && styles.segLabelActive]}>{m.label}</Text>
                <Text style={[styles.segSub, active && styles.segSubActive]}>{m.sub}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.helperText}>
          n is fastest; m is most accurate but slower. Place real .tflite files in
          assets/models/ to enable s and m.
        </Text>
      </View>

      <View style={styles.calibSection}>
        <Text style={styles.calibLabel}>Test-mode scene scale</Text>
        <View style={styles.segRow}>
          {SCENE_PRESETS.map((p) => {
            const active = Math.abs(settings.testSceneMetresPerPixel - p.mPerPx) < 1e-9;
            return (
              <TouchableOpacity
                key={p.label}
                style={[styles.segBtn, active && styles.segBtnActive]}
                onPress={() => update({ testSceneMetresPerPixel: p.mPerPx })}
              >
                <Text style={[styles.segLabel, active && styles.segLabelActive]}>{p.label}</Text>
                <Text style={[styles.segSub, active && styles.segSubActive]}>{p.hint}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Field
          label="Custom (m/px)"
          value={String(settings.testSceneMetresPerPixel)}
          keyboardType="numeric"
          onChangeText={(v) => {
            const n = parseFloat(v);
            if (Number.isFinite(n) && n > 0) update({ testSceneMetresPerPixel: n });
          }}
        />
        <Text style={styles.helperText}>
          Pixel-to-metre scale used in TEST mode. Smaller = closer scene. Pick a
          preset or fine-tune. Only affects TEST mode.
        </Text>
      </View>

      <View style={styles.calibSection}>
        <Text style={styles.calibLabel}>Calibration</Text>
        {settings.calibrationData ? (
          <Text style={styles.calibOk}>
            Calibrated — {settings.calibrationData.realWorldDistance}m reference distance
          </Text>
        ) : (
          <Text style={styles.calibNone}>Not calibrated — speed measurement disabled</Text>
        )}
        <TouchableOpacity
          style={styles.calibBtn}
          onPress={() => navigation.navigate('Calibration')}
        >
          <Text style={styles.calibBtnText}>
            {settings.calibrationData ? 'Recalibrate' : 'Start Calibration Wizard'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
        <Text style={styles.resetText}>Reset to Defaults</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({
  label, value, onChangeText, keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        placeholderTextColor="#555"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#111' },
  content: { padding: 16 },
  field: { marginBottom: 18 },
  label: { color: '#aaa', fontSize: 12, marginBottom: 4, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#1e1e1e', color: '#fff', fontSize: 16,
    padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#333',
  },
  calibSection: { backgroundColor: '#1e1e1e', borderRadius: 8, padding: 14, marginBottom: 18 },
  calibLabel: { color: '#aaa', fontSize: 12, textTransform: 'uppercase', marginBottom: 6 },
  calibOk: { color: '#27ae60', fontSize: 14, marginBottom: 10 },
  calibNone: { color: '#e67e22', fontSize: 14, marginBottom: 10 },
  calibBtn: {
    backgroundColor: '#2c3e50', borderRadius: 6, padding: 10,
    alignItems: 'center', marginTop: 4,
  },
  calibBtnText: { color: '#3498db', fontWeight: 'bold', fontSize: 14 },
  resetBtn: {
    backgroundColor: '#c0392b', borderRadius: 8, padding: 14,
    alignItems: 'center', marginTop: 8,
  },
  resetText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  segRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  segBtn: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: 6, borderWidth: 1, borderColor: '#333',
    backgroundColor: '#161616', alignItems: 'center',
  },
  segBtnActive:    { borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.15)' },
  segLabel:        { color: '#ddd', fontSize: 13, fontWeight: '700' },
  segLabelActive:  { color: '#3498db' },
  segSub:          { color: '#777', fontSize: 10, marginTop: 2 },
  segSubActive:    { color: '#88c0e6' },
  helperText:      { color: '#888', fontSize: 11, marginTop: 4, lineHeight: 15 },
});
