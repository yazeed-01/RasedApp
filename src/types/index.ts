export type DetectorModel = 'yolov8n' | 'yolov8s' | 'yolov8m';

export interface CameraSettings {
  cameraId: string;
  speedLimit: number;
  gpsLat: number;
  gpsLng: number;
  calibrationData: CalibrationData | null;
  detectorModel: DetectorModel;
  testSceneMetresPerPixel: number;
}

export interface CalibrationData {
  point1: { x: number; y: number };
  point2: { x: number; y: number };
  realWorldDistance: number; // meters
  homographyMatrix: number[];
}

export interface DetectedVehicle {
  trackId: string;
  bbox: BoundingBox;
  speed: number | null;
  plate: string | null;
  plateConfidence: number;
  class: VehicleClass;
  confidence: number;
  lastSeen: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type VehicleClass = 'car' | 'truck' | 'bus' | 'motorcycle';

export interface Violation {
  id: string;
  plate: string;
  speedKmh: number;
  speedLimit: number;
  isViolation: boolean;
  timestamp: string;
  cameraId: string;
  gpsLat: number;
  gpsLng: number;
  imagePath: string;
  confidence: number;
  synced: boolean;
}
