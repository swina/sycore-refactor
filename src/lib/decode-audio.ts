export function audioBufferToWav(buf: AudioBuffer): Blob {
  const nc  = buf.numberOfChannels;
  const sr  = buf.sampleRate;
  const len = buf.length;
  const dl  = len * nc * 2;
  const ab  = new ArrayBuffer(44 + dl);
  const v   = new DataView(ab);
  const ws  = (o: number, s: string) =>
    s.split('').forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));

  ws(0,'RIFF'); v.setUint32(4, 36+dl, true); ws(8,'WAVE'); ws(12,'fmt ');
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,nc,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*nc*2,true);
  v.setUint16(32,nc*2,true); v.setUint16(34,16,true);
  ws(36,'data'); v.setUint32(40,dl,true);

  const chs = Array.from({ length: nc }, (_, i) => buf.getChannelData(i));
  let off = 44;
  for (let i = 0; i < len; i++)
    for (let c = 0; c < nc; c++) {
      v.setInt16(off, Math.max(-1, Math.min(1, chs[c][i])) * 0x7FFF, true);
      off += 2;
    }
  return new Blob([ab], { type: 'audio/wav' });
}

function parseRiffHeader(view: DataView) {
  if (view.getUint32(0, true) !== 0x46464952) throw new Error('Not a RIFF file');
  const waveId = view.getUint32(8, true);
  if (waveId !== 0x45564157) throw new Error('Not a WAVE file');

  let offset = 12;
  const chunks: Record<string, { data: DataView; start: number }> = {};

  while (offset + 8 <= view.byteLength) {
    const id = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    chunks[id] = { data: new DataView(view.buffer, view.byteOffset + dataStart, size), start: dataStart };
    offset = dataStart + size + (size % 2);
  }
  return chunks;
}

function parseWavFormat(fmt: DataView) {
  const formatTag     = fmt.getUint16(0, true);
  const channels      = fmt.getUint16(2, true);
  const sampleRate    = fmt.getUint32(4, true);
  const bitsPerSample = fmt.getUint16(14, true);
  const cbSize = fmt.byteLength > 16 ? fmt.getUint16(16, true) : 0;
  let codecSpecific: Uint8Array | null = null;
  if (cbSize > 0 && fmt.byteLength >= 18 + cbSize) {
    codecSpecific = new Uint8Array(fmt.buffer, fmt.byteOffset + 18, cbSize);
  }
  return { formatTag, channels, sampleRate, bitsPerSample, codecSpecific };
}

async function decodeOpusInWav(arrayBuf: ArrayBufferLike): Promise<AudioBuffer> {
  const view = new DataView(arrayBuf);
  const chunks = parseRiffHeader(view);
  const fmt = chunks['fmt '];
  if (!fmt) throw new Error('No fmt chunk');
  const info = parseWavFormat(fmt.data);
  if (info.formatTag !== 0x674F) throw new Error('Not Opus codec');

  const dataChunk = chunks['data'];
  if (!dataChunk) throw new Error('No data chunk');

  const rawData = new Uint8Array(arrayBuf, dataChunk.start, dataChunk.data.byteLength);

  // Opus-in-WAV packets: each packet is [2-byte LE size][packet data]
  const packets: Uint8Array[] = [];
  let pos = 0;
  while (pos + 2 <= rawData.length) {
    const pktLen = rawData[pos] | (rawData[pos + 1] << 8);
    pos += 2;
    if (pktLen === 0 || pos + pktLen > rawData.length) break;
    packets.push(rawData.slice(pos, pos + pktLen));
    pos += pktLen;
  }

  if (!packets.length) throw new Error('No Opus packets found');

  // Build OpusHead for extradata
  // The codec-specific data from 'fmt ' IS the OpusHead, or we build one
  const extradata = info.codecSpecific && info.codecSpecific.length >= 19
    ? info.codecSpecific
    : buildOpusHead(info.channels, info.sampleRate);

  const frames: Float32Array[] = [];
  const sampleRate = info.sampleRate || 48000;
  let totalFrames = 0;

  return new Promise((resolve, reject) => {
    const decoder = new AudioDecoder({
      output(frame: AudioData) {
        const frameLen = frame.numberOfFrames;
        const chData = new Float32Array(frameLen * frame.numberOfChannels);
        frame.copyTo(chData, { planeIndex: 0, format: 'f32-planar' });
        for (let ch = 0; ch < frame.numberOfChannels; ch++) {
          const chF32 = new Float32Array(frameLen);
          for (let i = 0; i < frameLen; i++) chF32[i] = chData[i * frame.numberOfChannels + ch];
          if (frames.length <= ch) frames.push(chF32);
          else {
            const merged = new Float32Array(frames[ch].length + chF32.length);
            merged.set(frames[ch]);
            merged.set(chF32, frames[ch].length);
            frames[ch] = merged;
          }
        }
        totalFrames += frameLen;
        frame.close();
      },
      error(err) { reject(new Error(`AudioDecoder error: ${err.message}`)); },
    });

    const config: AudioDecoderConfig = {
      codec: 'opus',
      sampleRate,
      numberOfChannels: info.channels,
      description: extradata,
    };

    decoder.configure(config);

    for (const pkt of packets) {
      const chunk = new EncodedAudioChunk({
        type: 'key',
        timestamp: 0,
        duration: 0,
        data: pkt,
      });
      decoder.decode(chunk);
    }

    decoder.flush().then(() => {
      decoder.close();
      const ctx = new OfflineAudioContext(info.channels, totalFrames, sampleRate);
      const buffer = ctx.createBuffer(info.channels, totalFrames, sampleRate);
      for (let ch = 0; ch < info.channels; ch++) {
        buffer.copyToChannel(frames[ch] || new Float32Array(totalFrames), ch);
      }
      resolve(buffer);
    }).catch(reject);
  });
}

function buildOpusHead(channels: number, sampleRate: number): Uint8Array {
  const head = new Uint8Array(19);
  const enc = (s: string, o: number) => {
    for (let i = 0; i < s.length; i++) head[o + i] = s.charCodeAt(i);
  };
  enc('OpusHead', 0);
  head[8] = 1;                         // version
  head[9] = channels;                  // output channel count
  head[10] = 0; head[11] = 0;          // pre-skip (0)
  head[12] = sampleRate & 0xFF;        // input sample rate (LE)
  head[13] = (sampleRate >> 8) & 0xFF;
  head[14] = (sampleRate >> 16) & 0xFF;
  head[15] = (sampleRate >> 24) & 0xFF;
  head[16] = 0; head[17] = 0;          // output gain (0)
  head[18] = 0;                        // mapping family (0 = mono/stereo)
  return head;
}

export async function decodeAudioFile(arrayBuf: ArrayBufferLike): Promise<AudioBuffer> {
  // Strategy 1: AudioContext.decodeAudioData (handles PCM WAV, MP3, FLAC, Ogg Opus, etc.)
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  const tmpCtx = new AC();
  try {
    const decoded = await tmpCtx.decodeAudioData(arrayBuf.slice(0));
    await tmpCtx.close();
    return decoded;
  } catch (e) {
    // Fall through
  }

  // Strategy 2: WebCodecs AudioDecoder for Opus-in-WAV
  try {
    const decoded = await decodeOpusInWav(arrayBuf);
    await tmpCtx.close();
    return decoded;
  } catch (e2) {
    await tmpCtx.close();
    throw new Error(`Unable to decode audio: ${(e2 as Error).message}`);
  }
}

export async function loadFileAsPcmWavBlob(file: File): Promise<Blob> {
  const arrayBuf = await file.arrayBuffer();
  const decoded = await decodeAudioFile(arrayBuf);
  return audioBufferToWav(decoded);
}
