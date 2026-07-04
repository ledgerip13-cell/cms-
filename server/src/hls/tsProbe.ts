export interface SegmentProfile {
  codec: string;
  width: number;
  height: number;
  fps: number;
  pts: number | null;
  bytesRead: number;
}

const TS_PACKET_SIZE = 188;

class BitReader {
  private data: Uint8Array;
  private bit = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  readBits(n: number): number {
    let out = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.data[this.bit >> 3] || 0;
      out = (out << 1) | ((byte >> (7 - (this.bit & 7))) & 1);
      this.bit++;
    }
    return out;
  }

  readBool(): boolean {
    return this.readBits(1) === 1;
  }

  readUE(): number {
    let zeros = 0;
    while (this.bit < this.data.length * 8 && this.readBits(1) === 0) zeros++;
    if (zeros === 0) return 0;
    return (1 << zeros) - 1 + this.readBits(zeros);
  }

  readSE(): number {
    const v = this.readUE();
    return (v & 1) ? ((v + 1) >> 1) : -(v >> 1);
  }
}

function removeEmulationPrevention(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i > 1 && data[i] === 0x03 && data[i - 1] === 0 && data[i - 2] === 0) continue;
    out.push(data[i]);
  }
  return Uint8Array.from(out);
}

function skipScalingList(br: BitReader, size: number) {
  let lastScale = 8;
  let nextScale = 8;
  for (let j = 0; j < size; j++) {
    if (nextScale !== 0) {
      const delta = br.readSE();
      nextScale = (lastScale + delta + 256) % 256;
    }
    lastScale = nextScale === 0 ? lastScale : nextScale;
  }
}

function parseH264Sps(nal: Uint8Array): { width: number; height: number; fps: number } | null {
  try {
    const rbsp = removeEmulationPrevention(nal.slice(1));
    const br = new BitReader(rbsp);
    const profileIdc = br.readBits(8);
    br.readBits(8); // constraint flags
    br.readBits(8); // level_idc
    br.readUE(); // seq_parameter_set_id

    let chromaFormatIdc = 1;
    const highProfiles = new Set([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135]);
    if (highProfiles.has(profileIdc)) {
      chromaFormatIdc = br.readUE();
      if (chromaFormatIdc === 3) br.readBits(1);
      br.readUE();
      br.readUE();
      br.readBits(1);
      if (br.readBool()) {
        const count = chromaFormatIdc !== 3 ? 8 : 12;
        for (let i = 0; i < count; i++) {
          if (br.readBool()) skipScalingList(br, i < 6 ? 16 : 64);
        }
      }
    }

    br.readUE(); // log2_max_frame_num_minus4
    const picOrderCntType = br.readUE();
    if (picOrderCntType === 0) {
      br.readUE();
    } else if (picOrderCntType === 1) {
      br.readBits(1);
      br.readSE();
      br.readSE();
      const n = br.readUE();
      for (let i = 0; i < n; i++) br.readSE();
    }
    br.readUE(); // max_num_ref_frames
    br.readBits(1); // gaps_in_frame_num_value_allowed_flag
    const picWidthInMbsMinus1 = br.readUE();
    const picHeightInMapUnitsMinus1 = br.readUE();
    const frameMbsOnlyFlag = br.readBits(1);
    if (!frameMbsOnlyFlag) br.readBits(1);
    br.readBits(1); // direct_8x8_inference_flag

    let cropLeft = 0, cropRight = 0, cropTop = 0, cropBottom = 0;
    if (br.readBool()) {
      cropLeft = br.readUE();
      cropRight = br.readUE();
      cropTop = br.readUE();
      cropBottom = br.readUE();
    }

    let fps = 0;
    if (br.readBool()) {
      const aspectRatioInfoPresentFlag = br.readBool();
      if (aspectRatioInfoPresentFlag) {
        const aspectRatioIdc = br.readBits(8);
        if (aspectRatioIdc === 255) {
          br.readBits(16);
          br.readBits(16);
        }
      }
      if (br.readBool()) br.readBits(1); // overscan
      if (br.readBool()) {
        br.readBits(3);
        br.readBits(1);
        if (br.readBool()) {
          br.readBits(8);
          br.readBits(8);
          br.readBits(8);
        }
      }
      if (br.readBool()) {
        br.readUE();
        br.readUE();
      }
      if (br.readBool()) {
        const numUnitsInTick = br.readBits(32);
        const timeScale = br.readBits(32);
        if (numUnitsInTick > 0) fps = timeScale / (2 * numUnitsInTick);
      }
    }

    let cropUnitX = 1;
    let cropUnitY = 2 - frameMbsOnlyFlag;
    if (chromaFormatIdc === 1) {
      cropUnitX = 2;
      cropUnitY = 2 * (2 - frameMbsOnlyFlag);
    } else if (chromaFormatIdc === 2) {
      cropUnitX = 2;
      cropUnitY = 2 - frameMbsOnlyFlag;
    }
    const width = ((picWidthInMbsMinus1 + 1) * 16) - (cropLeft + cropRight) * cropUnitX;
    const height = ((2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16) - (cropTop + cropBottom) * cropUnitY;
    return width > 0 && height > 0 ? { width, height, fps } : null;
  } catch {
    return null;
  }
}

function payloadOffset(pkt: Uint8Array): number {
  const adaptation = (pkt[3] >> 4) & 0x03;
  if (adaptation === 0 || adaptation === 2) return -1;
  let off = 4;
  if (adaptation === 3) off += 1 + pkt[4];
  return off < TS_PACKET_SIZE ? off : -1;
}

function parsePts(payload: Uint8Array): number | null {
  if (payload.length < 14) return null;
  if (payload[0] !== 0 || payload[1] !== 0 || payload[2] !== 1) return null;
  const flags = payload[7];
  const headerLen = payload[8];
  if (!(flags & 0x80) || headerLen < 5 || payload.length < 14) return null;
  const p = payload.slice(9, 14);
  const pts = ((p[0] & 0x0e) * 536870912)
    + (p[1] * 4194304)
    + ((p[2] & 0xfe) * 16384)
    + (p[3] * 128)
    + ((p[4] & 0xfe) >> 1);
  return pts / 90000;
}

function parsePat(payload: Uint8Array): number | null {
  const pointer = payload[0] || 0;
  const off = 1 + pointer;
  if (payload[off] !== 0x00 || payload.length < off + 16) return null;
  const sectionLength = ((payload[off + 1] & 0x0f) << 8) | payload[off + 2];
  const end = off + 3 + sectionLength - 4;
  for (let p = off + 8; p + 4 <= end; p += 4) {
    const program = (payload[p] << 8) | payload[p + 1];
    const pid = ((payload[p + 2] & 0x1f) << 8) | payload[p + 3];
    if (program !== 0) return pid;
  }
  return null;
}

function parsePmt(payload: Uint8Array): { videoPid: number | null; codec: string } | null {
  const pointer = payload[0] || 0;
  const off = 1 + pointer;
  if (payload[off] !== 0x02 || payload.length < off + 16) return null;
  const sectionLength = ((payload[off + 1] & 0x0f) << 8) | payload[off + 2];
  const programInfoLength = ((payload[off + 10] & 0x0f) << 8) | payload[off + 11];
  let p = off + 12 + programInfoLength;
  const end = off + 3 + sectionLength - 4;
  while (p + 5 <= end) {
    const streamType = payload[p];
    const elementaryPid = ((payload[p + 1] & 0x1f) << 8) | payload[p + 2];
    const esInfoLength = ((payload[p + 3] & 0x0f) << 8) | payload[p + 4];
    if (streamType === 0x1b) return { videoPid: elementaryPid, codec: "h264" };
    if (streamType === 0x24) return { videoPid: elementaryPid, codec: "h265" };
    if (streamType === 0x02) return { videoPid: elementaryPid, codec: "mpeg2video" };
    p += 5 + esInfoLength;
  }
  return { videoPid: null, codec: "" };
}

function findH264Sps(video: Uint8Array): Uint8Array | null {
  for (let i = 0; i < video.length - 5; i++) {
    let start = -1;
    if (video[i] === 0 && video[i + 1] === 0 && video[i + 2] === 1) start = i + 3;
    else if (video[i] === 0 && video[i + 1] === 0 && video[i + 2] === 0 && video[i + 3] === 1) start = i + 4;
    if (start < 0) continue;
    const nalType = video[start] & 0x1f;
    if (nalType !== 7) continue;
    let end = video.length;
    for (let j = start + 1; j < video.length - 4; j++) {
      if (video[j] === 0 && video[j + 1] === 0 && (video[j + 2] === 1 || (video[j + 2] === 0 && video[j + 3] === 1))) {
        end = j;
        break;
      }
    }
    return video.slice(start, end);
  }
  return null;
}

export function probeTsBytes(buf: Uint8Array): SegmentProfile | null {
  let pmtPid: number | null = null;
  let videoPid: number | null = null;
  let codec = "";
  let pts: number | null = null;
  const videoChunks: Uint8Array[] = [];
  let videoLen = 0;

  for (let off = 0; off + TS_PACKET_SIZE <= buf.length; off += TS_PACKET_SIZE) {
    if (buf[off] !== 0x47) continue;
    const pkt = buf.slice(off, off + TS_PACKET_SIZE);
    const pusi = Boolean(pkt[1] & 0x40);
    const pid = ((pkt[1] & 0x1f) << 8) | pkt[2];
    const payOff = payloadOffset(pkt);
    if (payOff < 0) continue;
    const payload = pkt.slice(payOff);

    if (pid === 0 && pusi && pmtPid === null) {
      pmtPid = parsePat(payload);
      continue;
    }
    if (pmtPid !== null && pid === pmtPid && pusi && videoPid === null) {
      const pmt = parsePmt(payload);
      if (pmt) {
        videoPid = pmt.videoPid;
        codec = pmt.codec;
      }
      continue;
    }
    if (videoPid !== null && pid === videoPid) {
      if (pusi && pts === null) pts = parsePts(payload);
      let body = payload;
      if (pusi && payload.length >= 9 && payload[0] === 0 && payload[1] === 0 && payload[2] === 1) {
        const headerLen = payload[8] || 0;
        const start = 9 + headerLen;
        body = payload.slice(Math.min(start, payload.length));
      }
      if (body.length) {
        videoChunks.push(body);
        videoLen += body.length;
        if (videoLen > 512 * 1024) break;
      }
    }
  }

  if (codec !== "h264") return codec ? { codec, width: 0, height: 0, fps: 0, pts, bytesRead: buf.length } : null;
  const merged = new Uint8Array(videoLen);
  let at = 0;
  for (const chunk of videoChunks) {
    merged.set(chunk, at);
    at += chunk.length;
  }
  const sps = findH264Sps(merged);
  const parsed = sps ? parseH264Sps(sps) : null;
  return {
    codec,
    width: parsed?.width || 0,
    height: parsed?.height || 0,
    fps: parsed?.fps || 0,
    pts,
    bytesRead: buf.length,
  };
}

