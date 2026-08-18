/** YMZ770B/770C behavioural core. Audio sources are supplied by the host. */
export class YMZ770B {
  constructor(host = {}) {
    this.host = host;
    this.reset();
  }

  reset() {
    this.address = 0;
    this.mute = false;
    this.digitalOutput = false;
    this.masterVolume = 128;
    this.boost = 0;
    this.clip = 1;
    this.channels = Array.from({ length: 8 }, (_, id) => ({
      id, phrase: 0, volume: 128, pan: 64, loop: false, playing: false,
    }));
    this.sequences = Array.from({ length: 8 }, () => ({
      number: 0, playing: false, loop: false, timer: 0, stopMask: 0,
    }));
    this.host.reset?.(this);
  }

  writePort(offset, value) {
    value &= 0xff;
    if ((offset & 1) === 0) this.address = value;
    else this.writeRegister(this.address, value);
  }

  writeRegister(reg, value) {
    reg &= 0xff; value &= 0xff;
    if (reg === 0x00) {
      this.mute = Boolean(value & 1);
      this.digitalOutput = Boolean(value & 2);
      this.host.master?.(this);
      return;
    }
    if (reg === 0x01) {
      this.masterVolume = value;
      this.host.master?.(this);
      return;
    }
    if (reg === 0x02) {
      this.boost = value & 7;
      this.clip = (value >> 4) & 7;
      this.host.master?.(this);
      return;
    }
    if (reg >= 0x40 && reg < 0x60) {
      const ch = this.channels[(reg >> 2) & 7];
      switch (reg & 3) {
        case 0: ch.phrase = value; break;
        case 1: ch.volume = value; break;
        case 2: ch.pan = Math.min(128, value << 3); break;
        case 3: {
          const key = value & 6;
          ch.loop = Boolean(value & 1);
          if (key === 2 || (key === 6 && !ch.playing)) {
            ch.playing = true;
            this.host.start?.(ch, this);
          } else if (key === 0) {
            ch.playing = false;
            this.host.stop?.(ch, this);
          }
          break;
        }
      }
      this.host.channel?.(ch, this);
      return;
    }
    if (reg >= 0x80) {
      const seq = this.sequences[(reg >> 4) & 7];
      switch (reg & 0x0f) {
        case 0: seq.number = value; break;
        case 1:
          seq.loop = Boolean(value & 1);
          if ((value & 6) === 2 || ((value & 6) === 6 && !seq.playing)) seq.playing = true;
          else if ((value & 6) === 0) seq.playing = false;
          break;
        case 2: seq.timer = (seq.timer & 0xff) | (value << 8); break;
        case 3: seq.timer = (seq.timer & 0xff00) | value; break;
        case 6: seq.stopMask = value; break;
      }
      this.host.sequence?.(seq, this);
    }
  }

  channelRegister(channel, field) { return 0x40 + channel * 4 + field; }
  setPhrase(ch, phrase) { this.writeRegister(this.channelRegister(ch, 0), phrase); }
  setVolume(ch, volume) { this.writeRegister(this.channelRegister(ch, 1), volume); }
  setPan(ch, pan) { this.writeRegister(this.channelRegister(ch, 2), Math.round(pan / 8)); }
  keyOn(ch, loop = false) { this.writeRegister(this.channelRegister(ch, 3), 2 | Number(loop)); }
  keyOff(ch) { this.writeRegister(this.channelRegister(ch, 3), 0); }
}

export function parsePhraseSequence(text) {
  if (typeof text !== 'string') return [];
  return text.trim().split(/[\s,;>→]+/).filter(Boolean).map(token => {
    const value = /^0x/i.test(token) ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token, 10);
    if (!Number.isInteger(value) || value < 0 || value > 255 || !/^(?:0x[\da-f]+|\d+)$/i.test(token))
      throw new Error(`無効なPHRASE番号: ${token}`);
    return value;
  });
}
