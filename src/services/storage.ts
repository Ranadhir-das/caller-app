import AsyncStorage from '@react-native-async-storage/async-storage';

import { CallHistory } from '@/types';

const LEADS_STORAGE_KEY = '@caller_app_leads';

export async function saveLeads(leads: unknown[]) {
  try {
    const jsonValue = JSON.stringify(leads);

    await AsyncStorage.setItem(
      LEADS_STORAGE_KEY,
      jsonValue
    );
  } catch (error) {
    console.error('Error saving leads:', error);
  }
}

export async function loadLeads() {
  try {
    const jsonValue = await AsyncStorage.getItem(
      LEADS_STORAGE_KEY
    );

    if (jsonValue !== null) {
      return JSON.parse(jsonValue);
    }

    return null;
  } catch (error) {
    console.error('Error loading leads:', error);
    return null;
  }
}

export async function clearSavedLeads() {
  try {
    await AsyncStorage.removeItem(LEADS_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing leads:', error);
  }
}

const CALL_HISTORY_STORAGE_KEY = '@caller_app_call_history';

export async function saveCallHistory(history: CallHistory[]) {
  try {
    const jsonValue = JSON.stringify(history);

    await AsyncStorage.setItem(
      CALL_HISTORY_STORAGE_KEY,
      jsonValue
    );
  } catch (error) {
    console.error('Error saving call history:', error);
  }
}

export async function loadCallHistory(): Promise<CallHistory[]> {
  try {
    const jsonValue = await AsyncStorage.getItem(
      CALL_HISTORY_STORAGE_KEY
    );

    if (jsonValue !== null) {
      return JSON.parse(jsonValue);
    }

    return [];
  } catch (error) {
    console.error('Error loading call history:', error);
    return [];
  }
}

export async function clearCallHistory() {
  try {
    await AsyncStorage.removeItem(
      CALL_HISTORY_STORAGE_KEY
    );
  } catch (error) {
    console.error('Error clearing call history:', error);
  }
}