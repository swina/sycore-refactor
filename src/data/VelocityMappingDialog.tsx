import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { VelocityConfig } from '../MidiApp';

interface VelocityMappingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  config: VelocityConfig;
  onChange: (config: VelocityConfig) => void;
  availableParams: { name: string, min?: number, max?: number }[];
}

export function VelocityMappingDialog({ isOpen, onClose, config, onChange, availableParams }: VelocityMappingDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-[#111] border border-neutral-800 p-6 rounded-xl w-full max-w-md shadow-2xl relative"
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-sm font-black uppercase tracking-widest text-[#00ff9d] mb-6">VELOCITY MODULATION</h2>
            
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-neutral-400 font-bold uppercase tracking-widest">STATUS</span>
                <button
                  onClick={() => onChange({ ...config, active: !config.active })}
                  className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest rounded transition-colors ${config.active ? 'bg-[#00ff9d] text-black' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
                >
                  {config.active ? 'ACTIVE' : 'OFF'}
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono text-neutral-400 font-bold uppercase tracking-widest">TARGET PARAMETER</label>
                <select
                  value={config.targetParameter}
                  onChange={(e) => onChange({ ...config, targetParameter: e.target.value })}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-3 text-xs font-mono uppercase tracking-widest text-white outline-none focus:border-[#00ff9d] transition-colors appearance-none"
                >
                  {availableParams.map(p => (
                    <option key={p.name} value={p.name}>{p.name.replace(/([A-Z])/g, ' $1').trim()}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-mono text-neutral-400 font-bold uppercase tracking-widest">
                  <label>AMOUNT</label>
                  <span className={config.amount === 0 ? 'text-neutral-600' : 'text-[#00ff9d]'}>{config.amount > 0 ? '+' : ''}{config.amount}%</span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={config.amount}
                  onChange={(e) => onChange({ ...config, amount: Number(e.target.value) })}
                  className="w-full accent-[#00ff9d] h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-neutral-600">
                  <span>-100%</span>
                  <span>0%</span>
                  <span>+100%</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono text-neutral-400 font-bold uppercase tracking-widest">RESPONSE CURVE</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['linear', 'exp', 'log'] as const).map(curve => (
                    <button
                      key={curve}
                      onClick={() => onChange({ ...config, curve })}
                      className={`py-3 text-xs font-mono font-bold uppercase tracking-widest rounded border transition-colors ${config.curve === curve ? 'bg-[#00ff9d]/10 border-[#00ff9d] text-[#00ff9d]' : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:border-neutral-700'}`}
                    >
                      {curve}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] font-mono text-neutral-500 pt-1">
                  {config.curve === 'linear' && 'Direct 1:1 mapping.'}
                  {config.curve === 'exp' && 'More sensitive at high velocity.'}
                  {config.curve === 'log' && 'More sensitive at low velocity.'}
                </p>
              </div>
            </div>
            
            <div className="mt-8 pt-4 border-t border-neutral-800 text-[10px] font-mono text-neutral-500 italic">
              Note: This applies a fake modulation by sending CC messages per Note On. It affects all playing notes globally on the S-1. Make sure your "MIDI IN" is enabled.
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
