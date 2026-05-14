import * as lamejs from '@breezystack/lamejs';

/**
 * SY.CORE Looper Engine
 * Handles sample-accurate audio recording and playback synced to BPM.
 */
export class LooperEngine {
  constructor() {
    this.audioCtx = null;
    this.inputSource = null;
    this.processor = null;
    this.sampleRate = 44100;
    this.buffers = Array(8).fill(null);
    this.isMuted = Array(8).fill(false);
    this.volumes = Array(8).fill(0.8);
    this.masterVolume = 0.9;
    
    this.isRecording = false;
    this.recordingIndex = -1;
    this.playbackOffset = 0;
    this.maxSamples = 0;
    
    this.onProgressCallback = null;
    this.onRecordCompleteCallback = null;
    this.isPlaying = false;
  }

  async init(stream) {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: 'interactive'
      });
    }
    
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.sampleRate = this.audioCtx.sampleRate;
    
    if (this.inputSource) {
      this.inputSource.disconnect();
    }
    
    this.inputSource = this.audioCtx.createMediaStreamSource(stream);
    
    if (!this.processor) {
      // Increased buffer size to 4096 for better stability on Windows/Chrome
      this.processor = this.audioCtx.createScriptProcessor(4096, 2, 2);
      this.processor.onaudioprocess = (e) => this._process(e);
      this.processor.connect(this.audioCtx.destination);
    }
    
    this.inputSource.connect(this.processor);
  }

  stopRecord() {
    this.isRecording = false;
    this.recordingIndex = -1;
    console.log('[LooperEngine] Recording stopped');
  }

  toggleMute(index, val) {
    if (index >= 0 && index < 8) {
      this.isMuted[index] = val;
    }
  }

  setTakeVolume(index, vol) {
    if (index >= 0 && index < 8) {
      this.volumes[index] = vol;
    }
  }

  setSyncParams(bpm, measures = 4, beatsPerMeasure = 4) {
    const secondsPerBeat = 60 / bpm;
    const totalSeconds = measures * beatsPerMeasure * secondsPerBeat;
    const newMaxSamples = Math.floor(totalSeconds * this.sampleRate);
    
    if (this.maxSamples !== newMaxSamples) {
       this.maxSamples = newMaxSamples;
       this.playbackOffset = 0;
       console.log(`[LooperEngine] Syncing: ${bpm} BPM, ${measures} Measures -> ${this.maxSamples} samples`);
    }
  }

  resetPlayback() {
    this.playbackOffset = 0;
    if (this.onProgressCallback) this.onProgressCallback(0);
  }

  startArmedRecord(index) {
    if (this.maxSamples <= 0) {
      console.error('[LooperEngine] Cannot record: maxSamples is 0. Check sync params.');
      return;
    }
    console.log(`[LooperEngine] Starting recording on take ${index}`);
    this.recordingIndex = index;
    this.buffers[index] = new Float32Array(this.maxSamples);
    this.isRecording = true;
    
    // Auto-start playback if not playing
    if (!this.isPlaying) {
      this.startAll();
    }
  }

  clearTake(index) {
    this.buffers[index] = null;
  }

  clearAll() {
    this.buffers.fill(null);
    this.playbackOffset = 0;
    this.isRecording = false;
    this.recordingIndex = -1;
  }

  stopAllPlayback() {
    this.playbackOffset = 0;
    this.isRecording = false;
    this.recordingIndex = -1;
    this.isPlaying = false;
    if (this.onProgressCallback) this.onProgressCallback(0);
  }

  startAll() {
    this.isPlaying = true;
    console.log('[LooperEngine] Playback started');
  }

  _process(e) {
    const inputL = e.inputBuffer.getChannelData(0);
    const outputL = e.outputBuffer.getChannelData(0);
    const outputR = e.outputBuffer.getChannelData(1);
    const len = inputL.length;

    outputL.fill(0);
    outputR.fill(0);

    if (!this.isPlaying) return;

    for (let i = 0; i < len; i++) {
      const currentPos = (this.playbackOffset + i) % this.maxSamples;

      // 1. Playback existing buffers
      let mixedL = 0;
      let mixedR = 0;

      for (let takeIdx = 0; takeIdx < 8; takeIdx++) {
        const buf = this.buffers[takeIdx];
        if (buf && !this.isMuted[takeIdx]) {
          // If we are recording this take, monitor from input, not from incomplete buffer
          if (!(this.isRecording && this.recordingIndex === takeIdx)) {
            const val = buf[currentPos] * this.volumes[takeIdx];
            mixedL += val;
            mixedR += val;
          }
        }
      }

      // 2. Record into buffer
      if (this.isRecording && this.recordingIndex !== -1) {
        const buf = this.buffers[this.recordingIndex];
        // Ensure index safety
        if (currentPos < buf.length) {
          buf[currentPos] = inputL[i];
        }
        
        // Pass-through monitoring for the track being recorded
        mixedL += inputL[i];
        mixedR += inputL[i];
      }

      // 3. Apply Master Volume and Soft Clipping to prevent hard digital noise
      outputL[i] = this._softClip(mixedL * this.masterVolume);
      outputR[i] = this._softClip(mixedR * this.masterVolume);
    }

    if (this.isPlaying) {
      this.playbackOffset = (this.playbackOffset + len) % this.maxSamples;
    }

    if (this.isPlaying && this.onProgressCallback) {
      this.onProgressCallback(this.playbackOffset / this.maxSamples);
    }
  }

  // Prevents harsh digital clipping
  _softClip(x) {
    if (x > 0.95) return 0.95 + (x - 0.95) * 0.05;
    if (x < -0.95) return -0.95 + (x + 0.95) * 0.05;
    return x;
  }

  async renderMixdown() {
    if (!this.maxSamples || this.buffers.every(b => !b)) return null;

    const offlineCtx = new OfflineAudioContext(2, this.maxSamples, this.sampleRate);
    
    // Re-create the mix in the offline context
    for (let i = 0; i < 8; i++) {
      const buf = this.buffers[i];
      if (buf && !this.isMuted[i]) {
        const audioBuf = offlineCtx.createBuffer(1, this.maxSamples, this.sampleRate);
        audioBuf.getChannelData(0).set(buf);
        
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuf;
        
        const gain = offlineCtx.createGain();
        gain.gain.value = this.volumes[i] * this.masterVolume;
        
        source.connect(gain);
        gain.connect(offlineCtx.destination);
        source.start(0);
      }
    }

    const renderedBuffer = await offlineCtx.startRendering();
    return this._encodeMp3(renderedBuffer);
  }

  _encodeMp3(audioBuffer) {
    const channels = 2; 
    const sampleRate = audioBuffer.sampleRate;
    const kbps = 192; 
    
    // Check if lamejs is properly imported
    const Mp3Encoder = lamejs.Mp3Encoder || (lamejs.default && lamejs.default.Mp3Encoder);
    if (!Mp3Encoder) {
      console.error('[LooperEngine] Mp3Encoder not found in lamejs import');
      return null;
    }

    const mp3encoder = new Mp3Encoder(channels, sampleRate, kbps);
    const mp3Data = [];

    const left = this._floatTo16BitInt(audioBuffer.getChannelData(0));
    const right = audioBuffer.numberOfChannels > 1 
      ? this._floatTo16BitInt(audioBuffer.getChannelData(1)) 
      : left;

    const sampleBlockSize = 1152;
    for (let i = 0; i < left.length; i += sampleBlockSize) {
      const leftChunk = left.subarray(i, i + sampleBlockSize);
      const rightChunk = right.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
    
    const finalMp3buf = mp3encoder.flush();
    if (finalMp3buf.length > 0) {
      mp3Data.push(finalMp3buf);
    }

    return new Blob(mp3Data, { type: 'audio/mp3' });
  }

  _floatTo16BitInt(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }
}

export const looperEngine = new LooperEngine();
