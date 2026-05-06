import { doc, getDoc, setDoc, db } from './idb';
import config from '../data/system_core_admin_config.json';
import systemConfig from '../data/system_config.json';

const SEED_VERSION = config.appVersion || '0.0.1';

// Extract app settings from system_config.json
const appSettingsConfig = (systemConfig as any).find((item: any) => item.key === 'app_settings')?.value || {};  

export async function seedConfigIfNeeded(): Promise<void> {
  const seedRef = doc(db, 'system', 'seed_info');
  const existing = await getDoc(seedRef);
  if (existing.exists() && existing.data()?.version === SEED_VERSION) return;

  const ts = new Date().toISOString();

  await setDoc(doc(db, 'system', 'app_settings'), {
    appVersion: config.appVersion,
    appEngine: config.appEngine,
    appName: appSettingsConfig.appName || 'SY.CORE',
    appSubtitle: appSettingsConfig.appSubtitle || 'for ROLAND S-1 Tweak Synth',
    osTarget: appSettingsConfig.osTarget || '',
    toolbar: appSettingsConfig.toolbar || [],
    toolbarIconSize: appSettingsConfig.toolbarIconSize || 6,
    updatedAt: ts,
  });

  await setDoc(doc(db, 'system', 'roles_config'), {
    ...(config.rolesConfig as Record<string, any>),
    updatedAt: ts,
  });

  await setDoc(doc(db, 'system', 'categories_config'), {
    list: config.categories,
    updatedAt: ts,
  });

  await setDoc(doc(db, 'system', 'sound_types_config'), {
    list: config.appSoundTypes,
    updatedAt: ts,
  });

  await setDoc(doc(db, 'system', 'sound_type_bg'), {
    ...(config.soundTypeBg as Record<string, string>),
    updatedAt: ts,
  });

  await setDoc(doc(db, 'system', 'midi_config'), {
    controllers: (config as any).midiConfig || [],
    updatedAt: ts,
  });

  await setDoc(seedRef, { version: SEED_VERSION, seededAt: ts });
}
