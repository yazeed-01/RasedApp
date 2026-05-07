import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { LogStackParamList } from '../navigation/RootNavigator';
import {
  getViolations, getViolationCount, getDistinctCameraIds,
  type ViolationFilter,
} from '../db/database';
import { exportViolationsCsv } from '../utils/csvExport';
import type { Violation } from '../types';

type Nav = NativeStackNavigationProp<LogStackParamList, 'Log'>;

type FilterMode = 'all' | 'violations';

export default function LogScreen() {
  const navigation = useNavigation<Nav>();

  const [violations, setViolations] = useState<Violation[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [violationCount, setViolationCount] = useState(0);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [cameraIds, setCameraIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const buildFilter = useCallback((): ViolationFilter => ({
    violationsOnly: filterMode === 'violations',
    cameraId: selectedCamera ?? undefined,
  }), [filterMode, selectedCamera]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const filter = buildFilter();
      const [rows, total, vCount, cameras] = await Promise.all([
        getViolations(filter),
        getViolationCount({}),
        getViolationCount({ violationsOnly: true }),
        getDistinctCameraIds(),
      ]);
      setViolations(rows);
      setTotalCount(total);
      setViolationCount(vCount);
      setCameraIds(cameras);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildFilter]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleExport() {
    setExporting(true);
    try {
      await exportViolationsCsv();
    } catch (e: any) {
      Alert.alert('Export failed', e.message);
    } finally {
      setExporting(false);
    }
  }

  function cycleCamera() {
    if (cameraIds.length === 0) return;
    const idx = selectedCamera ? cameraIds.indexOf(selectedCamera) : -1;
    const next = idx >= cameraIds.length - 1 ? null : cameraIds[idx + 1];
    setSelectedCamera(next);
  }

  return (
    <View style={styles.container}>
      {/* Stats bar */}
      <View style={styles.statsBar}>
        <StatChip label="Total" value={totalCount} />
        <StatChip label="Violations" value={violationCount} color="#e74c3c" />
        <TouchableOpacity style={styles.exportBtn} onPress={handleExport} disabled={exporting}>
          {exporting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.exportBtnText}>Export CSV</Text>}
        </TouchableOpacity>
      </View>

      {/* Filter bar */}
      <View style={styles.filterBar}>
        <FilterChip
          label="All"
          active={filterMode === 'all'}
          onPress={() => setFilterMode('all')}
        />
        <FilterChip
          label="Violations only"
          active={filterMode === 'violations'}
          onPress={() => setFilterMode('violations')}
          color="#e74c3c"
        />
        <FilterChip
          label={selectedCamera ? `Cam: ${selectedCamera}` : 'All Cameras'}
          active={!!selectedCamera}
          onPress={cycleCamera}
          color="#3498db"
        />
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#e74c3c" size="large" />
        </View>
      ) : violations.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No records match the current filter.</Text>
        </View>
      ) : (
        <FlatList
          data={violations}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#e74c3c"
            />
          }
          renderItem={({ item }) => (
            <ViolationRow
              item={item}
              onPress={() => navigation.navigate('ViolationDetail', { violationId: item.id })}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ViolationRow({ item, onPress }: { item: Violation; onPress: () => void }) {
  const isViolation = item.isViolation;
  const date = new Date(item.timestamp);
  const dateStr = date.toLocaleDateString();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.severityBar, isViolation ? styles.redBar : styles.greenBar]} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.plate}>{item.plate || '???'}</Text>
          <View style={[styles.speedBadge, isViolation ? styles.speedBadgeRed : styles.speedBadgeGreen]}>
            <Text style={styles.speedBadgeText}>{item.speedKmh} km/h</Text>
          </View>
        </View>
        <View style={styles.rowBottom}>
          <Text style={styles.meta}>{dateStr} {timeStr}</Text>
          <Text style={styles.metaRight}>Cam {item.cameraId}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FilterChip({
  label, active, onPress, color = '#aaa',
}: {
  label: string; active: boolean; onPress: () => void; color?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.filterChip, active && { borderColor: color, backgroundColor: `${color}22` }]}
    >
      <Text style={[styles.filterChipText, active && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#555', fontSize: 15 },

  statsBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a1a', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#222',
  },
  statChip: { marginRight: 20, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  statLabel: { color: '#666', fontSize: 11, textTransform: 'uppercase' },
  exportBtn: {
    marginLeft: 'auto', backgroundColor: '#2c3e50',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
  },
  exportBtnText: { color: '#3498db', fontWeight: 'bold', fontSize: 13 },

  filterBar: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#151515', borderBottomWidth: 1, borderBottomColor: '#222',
  },
  filterChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    borderWidth: 1, borderColor: '#333',
  },
  filterChipText: { color: '#666', fontSize: 12 },

  row: {
    flexDirection: 'row', backgroundColor: '#151515',
  },
  severityBar: { width: 4 },
  redBar: { backgroundColor: '#c0392b' },
  greenBar: { backgroundColor: '#27ae60' },
  rowBody: { flex: 1, paddingHorizontal: 14, paddingVertical: 12 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  plate: { color: '#fff', fontSize: 17, fontWeight: 'bold', fontFamily: 'monospace', letterSpacing: 1.5 },
  speedBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 5 },
  speedBadgeRed: { backgroundColor: 'rgba(192,57,43,0.3)', borderWidth: 1, borderColor: '#c0392b' },
  speedBadgeGreen: { backgroundColor: 'rgba(39,174,96,0.2)', borderWidth: 1, borderColor: '#27ae60' },
  speedBadgeText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  meta: { color: '#666', fontSize: 12 },
  metaRight: { color: '#555', fontSize: 12 },
  separator: { height: 1, backgroundColor: '#1e1e1e' },
});
