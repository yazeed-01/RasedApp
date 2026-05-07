import React from 'react';
import { Canvas, Rect, Text as SkText, matchFont, Group } from '@shopify/react-native-skia';
import { StyleSheet, Platform } from 'react-native';
import type { DetectedVehicle } from '../types';

const CLASS_COLORS: Record<string, string> = {
  car:        '#2ecc71',
  truck:      '#e67e22',
  bus:        '#3498db',
  motorcycle: '#9b59b6',
};

const font = matchFont({
  fontFamily: Platform.select({ ios: 'Helvetica', android: 'sans-serif' }) ?? 'sans-serif',
  fontSize: 12,
  fontWeight: 'bold',
  fontStyle: 'normal',
});

interface Props {
  vehicles: DetectedVehicle[];
  // The rendered overlay dimensions (screen pixels)
  overlayWidth: number;
  overlayHeight: number;
  // The camera frame dimensions (frame pixels) — used to scale bboxes
  frameWidth: number;
  frameHeight: number;
}

export default function BBoxOverlay({
  vehicles,
  overlayWidth,
  overlayHeight,
  frameWidth,
  frameHeight,
}: Props) {
  if (vehicles.length === 0 || overlayWidth === 0 || overlayHeight === 0) return null;

  const scaleX = frameWidth  > 0 ? overlayWidth  / frameWidth  : 1;
  const scaleY = frameHeight > 0 ? overlayHeight / frameHeight : 1;

  return (
    <Canvas style={[StyleSheet.absoluteFill, { width: overlayWidth, height: overlayHeight }]} pointerEvents="none">
      {vehicles.map((v) => {
        const color = CLASS_COLORS[v.class] ?? '#fff';
        const x = v.bbox.x * scaleX;
        const y = v.bbox.y * scaleY;
        const w = v.bbox.width  * scaleX;
        const h = v.bbox.height * scaleY;
        const label = v.speed !== null
          ? `${v.class} ${v.speed.toFixed(0)}km/h`
          : `${v.class} ${Math.round(v.confidence * 100)}%`;

        return (
          <Group key={v.trackId}>
            <Rect x={x} y={y} width={w} height={h} color={color} style="stroke" strokeWidth={2} />
            {font ? (
              <SkText x={x + 4} y={y + 14} text={label} font={font} color={color} />
            ) : null}
          </Group>
        );
      })}
    </Canvas>
  );
}
