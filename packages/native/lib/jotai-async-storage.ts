import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'jotai/utils';

export function asyncStorageAdapter<T>() {
  return createJSONStorage<T>(() => AsyncStorage);
}
