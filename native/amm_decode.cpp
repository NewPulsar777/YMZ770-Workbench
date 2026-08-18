// Yamaha YMZ770B AMMSL / YMZ770C AMMS-A phrase decoder frontend.
// Decoder core: Copyright Olivier Galibert, BSD-3-Clause (MAME).
#include "mpeg_audio.h"
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

static void put16(std::ofstream &f, uint16_t v) { f.put(v); f.put(v >> 8); }
static void put32(std::ofstream &f, uint32_t v) { put16(f, v); put16(f, v >> 16); }

static bool write_wav(const std::string &path, const std::vector<int16_t> &pcm, int rate, int channels) {
  std::ofstream f(path, std::ios::binary); if (!f) return false;
  const uint32_t bytes = uint32_t(pcm.size() * 2);
  f.write("RIFF",4); put32(f,36+bytes); f.write("WAVEfmt ",8); put32(f,16); put16(f,1);
  put16(f,channels); put32(f,rate); put32(f,rate*channels*2); put16(f,channels*2); put16(f,16);
  f.write("data",4); put32(f,bytes); f.write(reinterpret_cast<const char*>(pcm.data()),bytes);
  return bool(f);
}

int main(int argc, char **argv) {
  if (argc < 4) { std::cerr << "usage: amm_decode ROM PHRASE OUT.wav [--swap16] [--probe]\n"; return 2; }
  bool swap16=false, probe=false;
  for(int arg=4;arg<argc;arg++) {
    const std::string option=argv[arg];
    if(option=="--swap16") swap16=true;
    else if(option=="--probe") probe=true;
    else { std::cerr<<"unknown option: "<<option<<"\n"; return 2; }
  }
  std::ifstream in(argv[1],std::ios::binary); if(!in){std::cerr<<"ROM open failed\n";return 3;}
  std::vector<uint8_t> rom((std::istreambuf_iterator<char>(in)),{});
  if (swap16)
    for(size_t i=0;i+1<rom.size();i+=2) std::swap(rom[i],rom[i+1]);
  const int phrase=std::stoi(argv[2]); const size_t h=size_t(phrase)*4;
  if(h+3>=rom.size()){std::cerr<<"phrase outside ROM\n";return 4;}
  const int atbl=(rom[h]>>4)&7;
  // MST is a 25-bit byte address.  Bit 24 shares the ATBL byte at D0.
  const uint32_t offset=(uint32_t(rom[h]&1)<<24)|(uint32_t(rom[h+1])<<16)|(uint32_t(rom[h+2])<<8)|rom[h+3];
  // A raw AMMSL stream may be followed immediately by another valid sync word.
  // Bound decoding to the next phrase pointer so sync scanning cannot spill into it.
  uint32_t endOffset=uint32_t(rom.size());
  // Phrase numbers can be sparse (for example 17, 19 with 18 = FFFFFFFF).
  // Find the nearest valid data pointer, not merely the next table entry.
  for(int candidate=0;candidate<256;candidate++) {
    const size_t c=size_t(candidate)*4;
    if(c+3>=rom.size() || (rom[c]==0xff && rom[c+1]==0xff && rom[c+2]==0xff && rom[c+3]==0xff) || (rom[c]&0x0e)) continue;
    const uint32_t next=(uint32_t(rom[c]&1)<<24)|(uint32_t(rom[c+1])<<16)|(uint32_t(rom[c+2])<<8)|rom[c+3];
    if(next>offset && next<endOffset && next<rom.size()) endOffset=next;
  }
  int bitpos=int(offset*8), rate=16000, channels=1, blocks=0;
  mpeg_audio decoder(rom.data(),mpeg_audio::AMM,false,0);
  std::vector<int16_t> pcm, frame(1152*2);
  while(blocks++ < 65536) {
    int samples=0, nextRate=rate, nextChannels=channels;
    if(!decoder.decode_buffer(bitpos,int(endOffset*8),frame.data(),samples,nextRate,nextChannels,atbl)) break;
    if(samples<=0) break;
    if(!pcm.empty() && (nextRate!=rate || nextChannels!=channels)) break;
    rate=nextRate; channels=nextChannels;
    pcm.insert(pcm.end(),frame.begin(),frame.begin()+samples*channels);
    if(probe) break;
    if(samples<1152) break;
  }
  if(pcm.empty()){std::cerr<<"no AMMSL frames at offset 0x"<<std::hex<<offset<<"\n";return 5;}
  if(!probe && !write_wav(argv[3],pcm,rate,channels)){std::cerr<<"WAV write failed\n";return 6;}
  std::cout<<"{\"phrase\":"<<phrase<<",\"offset\":"<<offset<<",\"endOffset\":"<<endOffset<<",\"atbl\":"<<atbl
           <<",\"finalBitPosition\":"<<bitpos<<",\"rate\":"<<rate<<",\"channels\":"<<channels<<",\"samples\":"<<(pcm.size()/channels)<<"}\n";
}
