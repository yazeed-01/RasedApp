import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, StyleSheet, ScrollView, TouchableOpacity,
  Alert, TextInput, ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { LogStackParamList } from '../navigation/RootNavigator';
import { getViolationById, deleteViolation, updateViolationPlate } from '../db/database';
import type { Violation } from '../types';

type Props = NativeStackScreenProps<LogStackParamList, 'ViolationDetail'>;

export default function ViolationDetailScreen({ route, navigation }: Props) {
  const { violationId } = route.params;
  const [violation, setViolation] = useState<Violation | null>(null);
  const [editingPlate, setEditingPlate] = useState(false);
  const [plateInput, setPlateInput] = useState('');

  useEffect(() => {
    getViolationById(violationId).then((v) => {
      setViolation(v);
      setPlateInput(v?.plate ?? '');
    });
  }, [violationId]);

  async function handleSavePlate() {
    if (!violation) return;
    await updateViolationPlate(violation.id, plateInput.trim().toUpperCase());
    setViolation({ ...violation, plate: plateInput.trim().toUpperCase() });
    setEditingPlate(false);
  }

  async function handleDelete() {
    Alert.alert('Delete Record', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          if (violation) await deleteViolation(violation.id);
          navigation.goBack();
        },
      },
    ]);
  }

  if (!violation) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#e74c3c" />
      </View>
    );
  }

  const dateStr = new Date(violation.timestamp).toLocaleString();
  const isViolation = violation.isViolation;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {/* Plate crop image */}
      {violation.imagePath ? (
        <Image source={{ uri: `file://${violation.imagePath}` }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={styles.noImage}>
          <Text style={styles.noImageText}>No image captured</Text>
        </View>
      )}

      {/* Status banner */}
      <View style={[styles.banner, isViolation ? styles.bannerRed : styles.bannerGreen]}>
        <Text style={styles.bannerText}>
          {isViolation ? 'SPEED VIOLATION' : 'WITHIN LIMIT'}
        </Text>
        <Text style={styles.bannerSpeed}>
          {violation.speedKmh} km/h · Limit {violation.speedLimit} km/h
        </Text>
      </View>

      {/* Plate */}
      <View style={styles.section}>
        <Text style={styles.label}>LICENCE PLATE</Text>
        {editingPlate ? (
          <View style={styles.editRow}>
            <TextInput
              style={styles.plateInput}
              value={plateInput}
              onChangeText={setPlateInput}
              autoCapitalize="characters"
              autoFocus
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSavePlate}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingPlate(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.plateRow}>
            <Text style={styles.plateValue}>{violation.plate || '—'}</Text>
            <TouchableOpacity onPress={() => setEditingPlate(true)}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Details grid */}
      <View style={styles.section}>
        <InfoRow label="Timestamp" value={dateStr} />
        <InfoRow label="Camera" value={violation.cameraId} />
        <InfoRow label="Confidence" value={`${(violation.confidence * 100).toFixed(0)}%`} />
        {violation.gpsLat !== 0 && (
          <InfoRow
            label="Location"
            value={`${violation.gpsLat.toFixed(5)}, ${violation.gpsLng.toFixed(5)}`}
          />
        )}
        <InfoRow label="Synced" value={violation.synced ? 'Yes' : 'No'} />
      </View>

      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
        <Text style={styles.deleteBtnText}>Delete Record</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#111' },
  content: { paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  image: { width: '100%', height: 200, backgroundColor: '#1a1a1a' },
  noImage: {
    width: '100%', height: 160, backgroundColor: '#1a1a1a',
    justifyContent: 'center', alignItems: 'center',
  },
  noImageText: { color: '#555', fontSize: 14 },
  banner: { padding: 16, alignItems: 'center' },
  bannerRed: { backgroundColor: '#c0392b' },
  bannerGreen: { backgroundColor: '#27ae60' },
  bannerText: { color: '#fff', fontWeight: 'bold', fontSize: 13, letterSpacing: 1.5 },
  bannerSpeed: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginTop: 4 },
  section: {
    backgroundColor: '#1a1a1a', margin: 12, borderRadius: 10, padding: 14,
  },
  label: { color: '#666', fontSize: 11, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 },
  plateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  plateValue: { color: '#fff', fontSize: 26, fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 3 },
  editLink: { color: '#3498db', fontSize: 14 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plateInput: {
    flex: 1, backgroundColor: '#222', color: '#fff', fontSize: 18,
    padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#444',
    fontFamily: 'monospace', letterSpacing: 2,
  },
  saveBtn: { backgroundColor: '#27ae60', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  cancelBtn: { borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 },
  cancelBtnText: { color: '#888' },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2a2a2a',
  },
  infoLabel: { color: '#888', fontSize: 13 },
  infoValue: { color: '#fff', fontSize: 13, flex: 1, textAlign: 'right' },
  deleteBtn: {
    margin: 12, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#c0392b',
    borderRadius: 10, padding: 14, alignItems: 'center',
  },
  deleteBtnText: { color: '#c0392b', fontWeight: 'bold', fontSize: 15 },
});
