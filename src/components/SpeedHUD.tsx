import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  speed: number | null;
  speedLimit: number;
  plate: string | null;
  vehicleCount: number;
  violationCount: number;
  cameraId: string;
  isRecording: boolean;
  /** When true, the idle dash means "speed not yet measurable" (no cal). */
  needsCalibration?: boolean;
}

export default function SpeedHUD({
  speed, speedLimit, plate, vehicleCount, violationCount, cameraId, isRecording,
  needsCalibration = false,
}: Props) {
  const isOver = speed !== null && speed > speedLimit;
  const isStationary = speed === 0;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Top bar — camera info */}
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <View style={[styles.recDot, isRecording && styles.recDotActive]} />
          <Text style={styles.camId}>{cameraId}</Text>
        </View>
        <View style={styles.topRight}>
          <Text style={styles.limitLabel}>LIMIT</Text>
          <Text style={styles.limitValue}>{speedLimit}</Text>
          <Text style={styles.limitUnit}>km/h</Text>
        </View>
      </View>

      {/* Centre — main speed readout */}
      <View style={styles.centre}>
        {speed !== null ? (
          <View style={[
            styles.speedBox,
            isOver && styles.speedBoxViolation,
            isStationary && styles.speedBoxStationary,
          ]}>
            <Text style={[
              styles.speedValue,
              isOver && styles.speedValueViolation,
              isStationary && styles.speedValueStationary,
            ]}>
              {speed.toFixed(0)}
            </Text>
            <Text style={styles.speedUnit}>km/h</Text>
          </View>
        ) : (
          <View style={styles.speedBoxIdle}>
            <Text style={styles.speedIdle}>—</Text>
            {needsCalibration && (
              <Text style={styles.speedHint}>Tap calibration chip to enable</Text>
            )}
          </View>
        )}
      </View>

      {/* Plate readout */}
      {plate ? (
        <View style={styles.plateRow}>
          <Text style={styles.plateLabel}>PLATE</Text>
          <Text style={styles.plateValue}>{plate}</Text>
        </View>
      ) : null}

      {/* Bottom bar — counters */}
      <View style={styles.bottomBar}>
        <Counter label="Vehicles" value={vehicleCount} />
        <Counter label="Violations" value={violationCount} color="#e74c3c" />
      </View>
    </View>
  );
}

function Counter({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.counter}>
      <Text style={[styles.counterValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 56,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#555' },
  recDotActive: { backgroundColor: '#e74c3c' },
  camId: { color: '#fff', fontSize: 13, fontFamily: 'monospace' },
  topRight: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  limitLabel: { color: '#aaa', fontSize: 11 },
  limitValue: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  limitUnit: { color: '#aaa', fontSize: 11 },

  centre: { alignItems: 'center' },
  speedBox: {
    alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12,
    borderWidth: 2, borderColor: 'transparent',
  },
  speedBoxViolation: { borderColor: '#e74c3c', backgroundColor: 'rgba(192,57,43,0.35)' },
  speedBoxStationary: { backgroundColor: 'rgba(0,0,0,0.35)' },
  speedBoxIdle: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  speedValue: { color: '#fff', fontSize: 64, fontWeight: 'bold', lineHeight: 70 },
  speedValueViolation: { color: '#ff6b6b' },
  speedValueStationary: { color: '#888' },
  speedUnit: { color: '#ccc', fontSize: 14 },
  speedIdle: { color: '#555', fontSize: 48, fontWeight: 'bold' },
  speedHint: { color: '#ffb300', fontSize: 11, marginTop: 4 },

  plateRow: {
    flexDirection: 'row', alignItems: 'center',
    alignSelf: 'center', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
  },
  plateLabel: { color: '#aaa', fontSize: 11, textTransform: 'uppercase' },
  plateValue: { color: '#fff', fontSize: 20, fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 2 },

  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 12,
    paddingBottom: 28,
  },
  counter: { alignItems: 'center' },
  counterValue: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  counterLabel: { color: '#aaa', fontSize: 11, textTransform: 'uppercase' },
});
