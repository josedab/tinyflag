# tinyflag-react-native

React Native support for TinyFlag with offline caching and background refresh.

## Installation

```bash
npm install tinyflag tinyflag-react-native
npm install @react-native-async-storage/async-storage
```

## Quick Start

```tsx
import {
  createOfflineInstance,
  useBackgroundRefresh,
  useFlagWithOffline,
} from 'tinyflag-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Create offline-capable instance
const ff = await createOfflineInstance(
  { source: 'https://api.example.com/flags.yml' },
  AsyncStorage,
);

// Use in components
function MyComponent() {
  useBackgroundRefresh({ instance: ff, storage: AsyncStorage });

  const { enabled, isOffline } = useFlagWithOffline({
    instance: ff,
    flagName: 'new-feature',
    context: { userId: 'user-123' },
    defaultValue: false,
  });

  return (
    <Text>
      {enabled ? 'Feature ON' : 'Feature OFF'}
      {isOffline ? ' (offline)' : ''}
    </Text>
  );
}
```

## Compatibility

- React Native 0.72+
- Expo SDK 49+
- Metro and Expo bundlers
- Works with AsyncStorage or any storage adapter implementing `{ getItem, setItem }`
