import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, GestureResponderEvent, ScrollView,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Canvas, Circle, Line, vec } from '@shopify/react-native-skia';
import { saveSettings, getSettings } from '../store/settings';
import { computeHomography } from '../utils/homography';
import type { ScreenPoint } from '../utils/homography';
import type { NavigationProp } from '@react-navigation/native';

interface Props {
  navigation: NavigationProp<any>;
}

type Step = 'tap1' | 'tap2' | 'distance' | 'done';

export default function CalibrationScreen({ navigation }: Props) {
  const { hasPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  const [step, setStep] = useState<Step>('tap1');
  const [p1, setP1] = useState<ScreenPoint | null>(null);
  const [p2, setP2] = useState<ScreenPoint | null>(null);
  const [distance, setDistance] = useState('9');
  const overlayRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  function handleTap(e: GestureResponderEvent) {
    const { locationX, locationY } = e.nativeEvent;
    if (step === 'tap1') {
      setP1({ x: locationX, y: locationY });
      setStep('tap2');
    } else if (step === 'tap2') {
      setP2({ x: locationX, y: locationY });
      setStep('distance');
    }
  }

  function handleSave() {
    if (!p1 || !p2) return;
    const dist = parseFloat(distance);
    if (isNaN(dist) || dist <= 0) {
      Alert.alert('Invalid distance', 'Enter a positive number in metres.');
      return;
    }

    try {
      const result = computeHomography(p1, p2, dist);
      const settings = getSettings();
      saveSettings({
        calibrationData: {
          point1: p1,
          point2: p2,
          realWorldDistance: dist,
          homographyMatrix: [result.metresPerPixelAtRef, result.refY],
        },
      });
      Alert.alert(
        'Calibrated ✓',
        `Scale: ${(result.metresPerPixelAtRef * 100).toFixed(2)} cm/px at reference distance.\n\nYou can recalibrate any time from Settings.`,
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
      setStep('done');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }

  function reset() {
    setP1(null);
    setP2(null);
    setStep('tap1');
  }

  const instructions: Record<Step, string> = {
    tap1: 'Step 1 of 2 — Tap the START of a road marking (e.g. start of a lane stripe)',
    tap2: 'Step 2 of 2 — Tap the END of the same road marking',
    distance: 'Enter the real-world distance between the two points in metres',
    done: 'Calibration saved!',
  };

  if (!hasPermission || !device) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Camera permission required for calibration.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Live camera feed */}
      <View
        style={styles.cameraArea}
        onLayout={(e) => {
          overlayRef.current = e.nativeEvent.layout;
        }}
        onTouchEnd={step === 'tap1' || step === 'tap2' ? handleTap : undefined}
      >
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive
        />

        {/* Skia overlay — tap markers and line */}
        {(p1 || p2) && (
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            {p1 && (
              <Circle cx={p1.x} cy={p1.y} r={10} color="#e74c3c" />
            )}
            {p2 && (
              <Circle cx={p2.x} cy={p2.y} r={10} color="#2ecc71" />
            )}
            {p1 && p2 && (
              <Line
                p1={vec(p1.x, p1.y)}
                p2={vec(p2.x, p2.y)}
                color="#f1c40f"
                strokeWidth={2}
              />
            )}
          </Canvas>
        )}

        {/* Instruction banner */}
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerText}>{instructions[step]}</Text>
        </View>
      </View>

      {/* Controls panel */}
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        {step === 'distance' && (
          <>
            <Text style={styles.label}>Distance between points (metres)</Text>
            <TextInput
              style={styles.input}
              value={distance}
              onChangeText={setDistance}
              keyboardType="numeric"
              placeholderTextColor="#555"
              placeholder="e.g. 9"
            />
            <Text style={styles.hint}>
              Jordan highway lane markings: 3 m painted + 6 m gap = 9 m total.{'\n'}
              Use GPS or a tape measure for the exact distance.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
              <Text style={styles.primaryBtnText}>Save Calibration</Text>
            </TouchableOpacity>
          </>
        )}

        {(step === 'tap1' || step === 'tap2') && (
          <Text style={styles.hint}>
            Tap two points on the road surface that have a{' '}
            <Text style={{ color: '#f1c40f' }}>known distance</Text> between them.{'\n\n'}
            Good references: lane stripe start/end, pedestrian crossing lines, manhole covers.
          </Text>
        )}

        {step !== 'done' && (
          <TouchableOpacity style={styles.resetBtn} onPress={reset}>
            <Text style={styles.resetBtnText}>Start Over</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  cameraArea: { flex: 1 },
  fallback: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  fallbackText: { color: '#aaa', fontSize: 14 },
  banner: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', padding: 12,
  },
  bannerText: { color: '#fff', fontSize: 14, textAlign: 'center' },
  panel: { maxHeight: 260, backgroundColor: '#1a1a1a' },
  panelContent: { padding: 16 },
  label: { color: '#aaa', fontSize: 12, textTransform: 'uppercase', marginBottom: 6 },
  input: {
    backgroundColor: '#222', color: '#fff', fontSize: 20,
    padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#444',
    marginBottom: 10,
  },
  hint: { color: '#888', fontSize: 13, lineHeight: 20, marginBottom: 16 },
  primaryBtn: {
    backgroundColor: '#e74c3c', borderRadius: 8, padding: 14,
    alignItems: 'center', marginBottom: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  resetBtn: {
    borderWidth: 1, borderColor: '#444', borderRadius: 8, padding: 12,
    alignItems: 'center',
  },
  resetBtnText: { color: '#888', fontSize: 14 },
});
