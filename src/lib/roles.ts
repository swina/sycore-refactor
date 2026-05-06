export interface RoleFeatures {
  midiOut: boolean;
  midiLearn: boolean;
  aiPrompt: boolean;
  bankExport: boolean;
  cloudSync: boolean;
  favorites: boolean;
  seqSteps: number;
  support: boolean;
  midiLogger: boolean;
  copySound: boolean;
  abSound: boolean;
  seqPreviewMagic: boolean;
  importBank: boolean;
  seqGen: boolean;
  seqParam2: boolean;
  seqGlobalTranspose: boolean;
  seqSyncTrack: boolean;
}

export interface RoleConfig {
  slots: number;
  gens: number;
  features: RoleFeatures;
}

export interface RolesConfig {
  demo: RoleConfig;
  basic: RoleConfig;
  producer: RoleConfig;
}

export const DEFAULT_ROLES_CONFIG: RolesConfig = {
  demo: { 
    slots: 8, 
    gens: 10, 
    features: { 
      midiOut: true, midiLearn: true, aiPrompt: false, bankExport: false, cloudSync: false,
      favorites: false, seqSteps: 16, support: false, midiLogger: false, copySound: false,
      abSound: false, seqPreviewMagic: false, importBank: false, seqGen: false,
      seqParam2: false, seqGlobalTranspose: false, seqSyncTrack: false
    } 
  },
  basic: { 
    slots: 128, 
    gens: 50, 
    features: { 
      midiOut: true, midiLearn: true, aiPrompt: true, bankExport: true, cloudSync: true,
      favorites: true, seqSteps: 64, support: true, midiLogger: true, copySound: true,
      abSound: true, seqPreviewMagic: true, importBank: true, seqGen: true,
      seqParam2: true, seqGlobalTranspose: true, seqSyncTrack: true
    } 
  },
  producer: { 
    slots: 256, 
    gens: 200, 
    features: { 
      midiOut: true, midiLearn: true, aiPrompt: true, bankExport: true, cloudSync: true,
      favorites: true, seqSteps: 64, support: true, midiLogger: true, copySound: true,
      abSound: true, seqPreviewMagic: true, importBank: true, seqGen: true,
      seqParam2: true, seqGlobalTranspose: true, seqSyncTrack: true
    } 
  }
};
