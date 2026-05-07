import { useEffect } from 'react';
import { useCameraPermission } from 'react-native-vision-camera';

export function useRequestCameraPermission() {
  const { hasPermission, requestPermission } = useCameraPermission();

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  return hasPermission;
}
