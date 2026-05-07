import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import CameraScreen from '../screens/CameraScreen';
import LogScreen from '../screens/LogScreen';
import AvgSpeedScreen from '../screens/AvgSpeedScreen';
import SettingsScreen from '../screens/SettingsScreen';
import CalibrationScreen from '../screens/CalibrationScreen';
import ViolationDetailScreen from '../screens/ViolationDetailScreen';

export type RootTabParamList = {
  Camera: undefined;
  LogStack: undefined;
  AvgSpeed: undefined;
  SettingsStack: undefined;
};

export type LogStackParamList = {
  Log: undefined;
  ViolationDetail: { violationId: string };
};

export type SettingsStackParamList = {
  Settings: undefined;
  Calibration: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const LogStack = createNativeStackNavigator<LogStackParamList>();
const SettingsStackNav = createNativeStackNavigator<SettingsStackParamList>();

const stackScreenOptions = {
  headerStyle: { backgroundColor: '#111' },
  headerTintColor: '#fff',
  contentStyle: { backgroundColor: '#111' },
} as const;

function LogStackScreen() {
  return (
    <LogStack.Navigator screenOptions={stackScreenOptions}>
      <LogStack.Screen name="Log" component={LogScreen} options={{ title: 'Violations' }} />
      <LogStack.Screen
        name="ViolationDetail"
        component={ViolationDetailScreen}
        options={{ title: 'Detail' }}
      />
    </LogStack.Navigator>
  );
}

function SettingsStack() {
  return (
    <SettingsStackNav.Navigator screenOptions={stackScreenOptions}>
      <SettingsStackNav.Screen name="Settings" component={SettingsScreen} />
      <SettingsStackNav.Screen
        name="Calibration"
        component={CalibrationScreen}
        options={{ title: 'Calibrate Camera' }}
      />
    </SettingsStackNav.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarStyle: { backgroundColor: '#111', borderTopColor: '#222' },
          tabBarActiveTintColor: '#e74c3c',
          tabBarInactiveTintColor: '#666',
          headerShown: false,
          tabBarIcon: ({ size }) => {
            const icons: Record<string, string> = {
              Camera: '📷',
              LogStack: '📋',
              AvgSpeed: '📏',
              SettingsStack: '⚙️',
            };
            return <Text style={{ fontSize: size - 4 }}>{icons[route.name] ?? '•'}</Text>;
          },
        })}
      >
        <Tab.Screen name="Camera" component={CameraScreen} options={{ title: 'Live', headerShown: true, headerStyle: { backgroundColor: '#111' }, headerTintColor: '#fff' }} />
        <Tab.Screen name="LogStack" component={LogStackScreen} options={{ title: 'Log' }} />
        <Tab.Screen name="AvgSpeed" component={AvgSpeedScreen} options={{ title: 'Avg Speed', headerShown: true, headerStyle: { backgroundColor: '#111' }, headerTintColor: '#fff' }} />
        <Tab.Screen name="SettingsStack" component={SettingsStack} options={{ title: 'Settings' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
