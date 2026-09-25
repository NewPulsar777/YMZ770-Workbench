import { YMZ770B, parsePhraseSequence, findAdjacentPhrase } from './ymz770b.js?v=20260923-1';
const $=s=>document.querySelector(s);
const API_BASE=location.protocol==='file:'?'http://127.0.0.1:8765':'';
let ctx,analyser,masterGain,startedAt=0,realRom=false;
const voices=Array(8).fill(null),voiceGeneration=Array(8).fill(0),decodedPhrases=new Map();
const sequencePlayer={active:false,items:[],index:0,channel:0,loop:false,sources:[],timers:[],gain:null,pan:null};
const wave=['sine','square','sawtooth','triangle','sine','square','triangle','sawtooth'];

async function audioStart(){if(!ctx){ctx=new AudioContext();masterGain=ctx.createGain();analyser=ctx.createAnalyser();analyser.fftSize=1024;masterGain.connect(analyser).connect(ctx.destination);startedAt=ctx.currentTime;$('#audioLed').classList.add('on')}await ctx.resume();$('#audioState').textContent=ctx.state==='running'?'AUDIO READY':'AUDIO SUSPENDED'}
function stopVoice(ch){voiceGeneration[ch.id]++;const v=voices[ch.id];if(v){try{v.source.stop()}catch{}v.source.disconnect();voices[ch.id]=null}renderChannel(ch)}
async function fetchPhrase(n){if(decodedPhrases.has(n))return decodedPhrases.get(n);const r=await fetch(`${API_BASE}/api/phrase?n=${n}`);if(!r.ok){const e=await r.json().catch(()=>({error:r.statusText}));throw new Error(e.error)}const b=await ctx.decodeAudioData(await r.arrayBuffer());decodedPhrases.set(n,b);return b}
async function startVoice(ch,chip){audioStart();const token=++voiceGeneration[ch.id];const old=voices[ch.id];if(old){try{old.source.stop()}catch{}old.source.disconnect();voices[ch.id]=null}let source;if(realRom){try{const buffer=await fetchPhrase(ch.phrase);if(!ch.playing||voiceGeneration[ch.id]!==token)return;source=ctx.createBufferSource();source.buffer=buffer;source.loop=ch.loop}catch(e){if(voiceGeneration[ch.id]!==token)return;ch.playing=false;renderChannel(ch);stopSequence(`ERROR: PHRASE ${String(ch.phrase).padStart(3,'0')} — ${e.message}`);log(`ERROR  phrase ${ch.phrase}: ${e.message}`);return}}else{source=ctx.createOscillator();source.type=wave[ch.phrase%wave.length];source.frequency.value=55*Math.pow(2,(ch.phrase%36)/12)}const gain=ctx.createGain(),pan=ctx.createStereoPanner();gain.gain.value=(ch.volume/128)*.11;pan.pan.value=ch.pan/64-1;source.connect(gain).connect(pan).connect(masterGain);source.start();voices[ch.id]={source,gain,pan};source.onended=()=>{if(!source.loop&&voices[ch.id]?.source===source){ch.playing=false;voices[ch.id]=null;renderChannel(ch);handleVoiceEnded(ch)}};applyMaster(chip);renderChannel(ch)}
function applyMaster(chip){if(masterGain)masterGain.gain.value=chip.mute?0:(chip.masterVolume/128)*Math.pow(2,chip.boost)}
const chip=new YMZ770B({start:startVoice,stop:stopVoice,master:applyMaster,channel(ch){const v=voices[ch.id];if(v){v.gain.gain.value=(ch.volume/128)*.11;v.pan.pan.value=ch.pan/64-1}renderChannel(ch)}});

const grid=$('#channelGrid');chip.channels.forEach(ch=>{
  const el=document.createElement('div');el.className='channel';el.dataset.ch=ch.id;
  el.innerHTML=`<div class="ch-head">CH ${ch.id}<i></i></div><label>PHRASE<div class="phrase-nav"><button class="phrase-prev" title="前の有効PHRASE">◀</button><select class="phrase">${Array.from({length:256},(_,i)=>`<option value="${i}">${String(i).padStart(3,'0')}</option>`).join('')}</select><button class="phrase-next" title="次の有効PHRASE">▶</button></div></label><label>LEVEL<input class="vol" type="range" min="0" max="128" value="128"></label><label>PAN<input class="pan" type="range" min="0" max="128" value="64"></label><label>LOOP<input class="loop" type="checkbox"></label><button class="key">KEY ON</button><button class="save-wav">SAVE PHRASE WAV</button>`;
  grid.append(el);
  el.querySelector('.phrase').onchange=e=>{
    if(sequencePlayer.active&&sequencePlayer.channel===ch.id)stopSequence('STOPPED BY MANUAL PHRASE CHANGE');
    const wasPlaying=ch.playing;
    if(wasPlaying)chip.keyOff(ch.id);
    chip.setPhrase(ch.id,+e.target.value);
    if(wasPlaying)chip.keyOn(ch.id,el.querySelector('.loop').checked);
  };
  const stepPhrase=direction=>{const select=el.querySelector('.phrase'),enabled=Array.from(select.options,option=>!option.disabled),next=findAdjacentPhrase(+select.value,direction,enabled);if(next!==+select.value){select.value=String(next);select.dispatchEvent(new Event('change'))}};
  el.querySelector('.phrase-prev').onclick=()=>stepPhrase(-1);
  el.querySelector('.phrase-next').onclick=()=>stepPhrase(1);
  el.querySelector('.vol').oninput=e=>chip.setVolume(ch.id,+e.target.value);
  el.querySelector('.pan').oninput=e=>chip.setPan(ch.id,+e.target.value);
  el.querySelector('.key').onclick=()=>{audioStart();if(sequencePlayer.active&&sequencePlayer.channel===ch.id){stopSequence();return}ch.playing?chip.keyOff(ch.id):chip.keyOn(ch.id,el.querySelector('.loop').checked)};
  el.querySelector('.save-wav').onclick=()=>savePhraseWav(ch.phrase);
});
function renderChannel(ch){const el=document.querySelector(`[data-ch="${ch.id}"]`);el.classList.toggle('active',ch.playing);el.querySelector('.key').textContent=ch.playing?'KEY OFF':'KEY ON'}
function sequenceStatus(text){$('#sequenceStatus').textContent=text}
function playSequenceItem(){
  if(!sequencePlayer.active)return;
  const phrase=sequencePlayer.items[sequencePlayer.index],ch=chip.channels[sequencePlayer.channel];
  const select=document.querySelector(`[data-ch="${ch.id}"] .phrase`);
  if(realRom&&select.options[phrase]?.disabled){stopSequence(`ERROR: PHRASE ${String(phrase).padStart(3,'0')} IS UNUSED`);return}
  if(ch.playing)chip.keyOff(ch.id);
  chip.setPhrase(ch.id,phrase);select.value=String(phrase);chip.keyOn(ch.id,false);
  sequenceStatus(`PLAYING  ${sequencePlayer.index+1}/${sequencePlayer.items.length}  ·  CH ${ch.id}  ·  PHRASE ${String(phrase).padStart(3,'0')}`);
}
function audibleRegion(buffer){
  const threshold=0.008,guard=Math.round(buffer.sampleRate*.006),channels=[];
  for(let c=0;c<buffer.numberOfChannels;c++)channels.push(buffer.getChannelData(c));
  let first=0,last=buffer.length-1;
  outerStart:for(;first<buffer.length;first++)for(const data of channels)if(Math.abs(data[first])>=threshold)break outerStart;
  if(first===buffer.length)return{offset:0,duration:buffer.duration,trimmed:0};
  outerEnd:for(;last>first;last--)for(const data of channels)if(Math.abs(data[last])>=threshold)break outerEnd;
  first=Math.max(0,first-guard);last=Math.min(buffer.length-1,last+guard);
  return{offset:first/buffer.sampleRate,duration:Math.max(.01,(last-first+1)/buffer.sampleRate),trimmed:(buffer.length-(last-first+1))/buffer.sampleRate};
}
async function scheduleGaplessSequence(){
  const token=Symbol('sequence');sequencePlayer.token=token;
  sequenceStatus(`PREPARING 0/${sequencePlayer.items.length}`);
  const buffers=[];
  for(let i=0;i<sequencePlayer.items.length;i++){
    buffers.push(await fetchPhrase(sequencePlayer.items[i]));
    if(!sequencePlayer.active||sequencePlayer.token!==token)return;
    sequenceStatus(`PREPARING ${i+1}/${sequencePlayer.items.length}`);
  }
  if(!sequencePlayer.active||sequencePlayer.token!==token)return;
  const ch=chip.channels[sequencePlayer.channel],select=document.querySelector(`[data-ch="${ch.id}"] .phrase`);
  sequencePlayer.gain=ctx.createGain();sequencePlayer.pan=ctx.createStereoPanner();
  sequencePlayer.gain.gain.value=(ch.volume/128)*.11;sequencePlayer.pan.pan.value=ch.pan/64-1;
  sequencePlayer.gain.connect(sequencePlayer.pan).connect(masterGain);
  let cursor=ctx.currentTime+.08,totalTrimmed=0;const crossfade=.020;
  buffers.forEach((buffer,i)=>{
    const region=audibleRegion(buffer);totalTrimmed+=region.trimmed;
    const source=ctx.createBufferSource(),fade=ctx.createGain();source.buffer=buffer;source.connect(fade).connect(sequencePlayer.gain);
    const fadeTime=Math.min(crossfade,region.duration/4);
    fade.gain.setValueAtTime(i===0?1:0,cursor);if(i>0)fade.gain.linearRampToValueAtTime(1,cursor+fadeTime);
    if(i<buffers.length-1){fade.gain.setValueAtTime(1,cursor+region.duration-fadeTime);fade.gain.linearRampToValueAtTime(0,cursor+region.duration)}
    source.start(cursor,region.offset,region.duration);
    sequencePlayer.sources.push(source);
    const delay=Math.max(0,(cursor-ctx.currentTime)*1000);
    sequencePlayer.timers.push(setTimeout(()=>{
      if(!sequencePlayer.active||sequencePlayer.token!==token)return;
      sequencePlayer.index=i;ch.phrase=sequencePlayer.items[i];ch.playing=true;select.value=String(ch.phrase);renderChannel(ch);
      sequenceStatus(`PLAYING ${i+1}/${sequencePlayer.items.length} · CH ${ch.id} · PHRASE ${String(ch.phrase).padStart(3,'0')}`);
    },delay));
    cursor+=region.duration-(i<buffers.length-1?crossfade:0);
    if(i===buffers.length-1)source.onended=()=>{
      if(!sequencePlayer.active||sequencePlayer.token!==token)return;
      if(sequencePlayer.loop){sequencePlayer.sources=[];sequencePlayer.timers=[];sequencePlayer.index=0;scheduleGaplessSequence().catch(e=>stopSequence(`ERROR: ${e.message}`))}
      else stopSequence('COMPLETE');
    };
  });
  log(`SEQ    gapless scheduled / ${buffers.length} phrases / ${(cursor-ctx.currentTime).toFixed(3)} sec / silence trimmed ${totalTrimmed.toFixed(3)} sec`);
}
function handleVoiceEnded(ch){
  if(!sequencePlayer.active||sequencePlayer.channel!==ch.id)return;
  sequencePlayer.index++;
  if(sequencePlayer.index>=sequencePlayer.items.length){
    if(sequencePlayer.loop)sequencePlayer.index=0;
    else{stopSequence('COMPLETE');return}
  }
  playSequenceItem();
}
function stopSequence(message='STOPPED'){
  const wasActive=sequencePlayer.active;sequencePlayer.active=false;sequencePlayer.token=null;
  sequencePlayer.timers.forEach(clearTimeout);sequencePlayer.timers=[];
  sequencePlayer.sources.forEach(source=>{try{source.onended=null;source.stop()}catch{}});sequencePlayer.sources=[];
  sequencePlayer.gain?.disconnect();sequencePlayer.pan?.disconnect();sequencePlayer.gain=sequencePlayer.pan=null;
  if(wasActive){const ch=chip.channels[sequencePlayer.channel];if(voices[ch.id])chip.keyOff(ch.id);else{ch.playing=false;renderChannel(ch)}}
  sequenceStatus(message);
}
function log(s){$('#log').textContent+=`\n${s}`;$('#log').scrollTop=99999}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function savePhraseWav(phrase){
  try{
    if(!realRom)throw new Error('実ROMを読み込んでください');
    const r=await fetch(`${API_BASE}/api/phrase?n=${phrase}`);if(!r.ok){const e=await r.json().catch(()=>({error:r.statusText}));throw new Error(e.error)}
    downloadBlob(await r.blob(),`ymz770-phrase-${String(phrase).padStart(3,'0')}.wav`);log(`WAV    phrase ${String(phrase).padStart(3,'0')} saved`);
  }catch(e){sequenceStatus(`ERROR: ${e.message}`)}
}
function audioBufferToWav(buffer){
  const channels=buffer.numberOfChannels,frames=buffer.length,dataBytes=frames*channels*2,out=new ArrayBuffer(44+dataBytes),v=new DataView(out);
  const text=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
  text(0,'RIFF');v.setUint32(4,36+dataBytes,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,dataBytes,true);
  const source=Array.from({length:channels},(_,c)=>buffer.getChannelData(c));let o=44;
  for(let i=0;i<frames;i++)for(let c=0;c<channels;c++){const s=Math.max(-1,Math.min(1,source[c][i]));v.setInt16(o,s<0?s*32768:s*32767,true);o+=2}
  return new Blob([out],{type:'audio/wav'});
}
async function saveSequenceWav(){
  const button=$('#sequenceWav');button.disabled=true;
  try{
    if(!realRom)throw new Error('実ROMを読み込んでください');
    const items=parsePhraseSequence($('#sequenceText').value);if(!items.length)throw new Error('PHRASE番号を入力してください');
    const ch=chip.channels[+$('#sequenceChannel').value],select=document.querySelector(`[data-ch="${ch.id}"] .phrase`);
    for(const phrase of items)if(select.options[phrase]?.disabled)throw new Error(`PHRASE ${String(phrase).padStart(3,'0')} は未使用です`);
    await audioStart();const buffers=[];
    for(let i=0;i<items.length;i++){sequenceStatus(`WAV PREPARING ${i+1}/${items.length}`);buffers.push(await fetchPhrase(items[i]))}
    const regions=buffers.map(audibleRegion),crossfade=.020;let duration=regions.reduce((n,r)=>n+r.duration,0)-crossfade*Math.max(0,regions.length-1);
    if(duration>3600)throw new Error('WAV出力は1時間以内にしてください');
    const rate=Math.max(...buffers.map(b=>b.sampleRate)),offline=new OfflineAudioContext(2,Math.ceil(duration*rate)+1,rate),mix=offline.createGain(),pan=offline.createStereoPanner();
    mix.gain.value=(ch.volume/128)*.11*(chip.mute?0:(chip.masterVolume/128)*Math.pow(2,chip.boost));pan.pan.value=ch.pan/64-1;mix.connect(pan).connect(offline.destination);
    let cursor=0;buffers.forEach((buffer,i)=>{const region=regions[i],source=offline.createBufferSource(),fade=offline.createGain(),fadeTime=Math.min(crossfade,region.duration/4);source.buffer=buffer;source.connect(fade).connect(mix);fade.gain.setValueAtTime(i?0:1,cursor);if(i)fade.gain.linearRampToValueAtTime(1,cursor+fadeTime);if(i<buffers.length-1){fade.gain.setValueAtTime(1,cursor+region.duration-fadeTime);fade.gain.linearRampToValueAtTime(0,cursor+region.duration)}source.start(cursor,region.offset,region.duration);cursor+=region.duration-(i<buffers.length-1?crossfade:0)});
    sequenceStatus('WAV RENDERING…');const rendered=await offline.startRendering(),tag=items.slice(0,24).map(n=>String(n).padStart(3,'0')).join('-'),suffix=items.length>24?`-plus-${items.length-24}`:'';downloadBlob(audioBufferToWav(rendered),`ymz770-sequence-${tag}${suffix}.wav`);sequenceStatus(`WAV SAVED · ${duration.toFixed(2)} SEC`);log(`WAV    sequence / ${items.length} phrases / ${duration.toFixed(3)} sec`);
  }catch(e){sequenceStatus(`ERROR: ${e.message}`)}finally{button.disabled=!realRom}
}
$('#master').oninput=e=>{chip.writeRegister(1,+e.target.value);$('#masterOut').value=e.target.value};$('#clip').onchange=e=>chip.writeRegister(2,(+e.target.value)<<4);$('#mute').onclick=()=>{chip.writeRegister(0,chip.mute?0:1);$('#mute').textContent=chip.mute?'UNMUTE':'MUTE'};$('#panic').onclick=()=>chip.channels.forEach(c=>chip.keyOff(c.id));
$('#regForm').onsubmit=e=>{e.preventDefault();const r=parseInt($('#reg').value,16),d=parseInt($('#data').value,16);if(Number.isNaN(r)||Number.isNaN(d))return;chip.writePort(0,r);chip.writePort(1,d);log(`WRITE  $${r.toString(16).padStart(2,'0').toUpperCase()} ← $${d.toString(16).padStart(2,'0').toUpperCase()}`)};
$('#sequencePlay').onclick=async()=>{try{const items=parsePhraseSequence($('#sequenceText').value);if(!items.length)throw new Error('PHRASE番号を入力してください');stopSequence();const select=document.querySelector(`[data-ch="${+$('#sequenceChannel').value}"] .phrase`);for(const phrase of items)if(realRom&&select.options[phrase]?.disabled)throw new Error(`PHRASE ${String(phrase).padStart(3,'0')} は未使用です`);sequencePlayer.items=items;sequencePlayer.index=0;sequencePlayer.channel=+$('#sequenceChannel').value;sequencePlayer.loop=$('#sequenceLoop').checked;sequencePlayer.active=true;await audioStart();if(ctx.state!=='running')throw new Error('ブラウザの音声再生が許可されていません');await scheduleGaplessSequence();log(`SEQ    CH${sequencePlayer.channel} / ${items.map(n=>String(n).padStart(3,'0')).join(' ')}`)}catch(e){stopSequence(`ERROR: ${e.message}`)}};
$('#sequenceStop').onclick=()=>stopSequence();
$('#sequenceWav').onclick=saveSequenceWav;
function crc32(bytes){let c=-1;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return((c^-1)>>>0).toString(16).padStart(8,'0').toUpperCase()}
$('#romInput').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  $('#sequencePlay').disabled=true;$('#sequenceWav').disabled=true;sequenceStatus('LOADING ROM…');
  const bytes=new Uint8Array(await f.arrayBuffer());$('#romStatus').textContent='LOADING…';
  try{
    const r=await fetch(`${API_BASE}/api/rom`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Swap16':$('#swap16').checked?'1':'0'},body:bytes});
    if(!r.ok)throw new Error((await r.json()).error);const info=await r.json();
    if(!info.phrases.length)throw new Error('有効なphraseが見つかりません（BYTE SWAP設定を確認）');
    realRom=true;decodedPhrases.clear();const valid=new Set(info.phrases);
    document.querySelectorAll('.phrase').forEach(select=>{for(const option of select.options)option.disabled=!valid.has(+option.value);select.value=String(info.phrases[0])});
    chip.channels.forEach(ch=>chip.setPhrase(ch.id,info.phrases[0]));
    $('#romStatus').textContent=`${f.name} / ${(bytes.length/1048576).toFixed(2)} MiB`;$('#crc').textContent=crc32(bytes);
    const first=String(info.phrases[0]).padStart(3,'0'),last=String(info.phrases.at(-1)).padStart(3,'0');$('#phrases').textContent=`${info.phrases.length} / ${first}—${last}`;
    $('#sequencePlay').disabled=false;$('#sequenceWav').disabled=false;sequenceStatus('READY');log(`ROM    ${bytes.length} bytes / ${info.phrases.length} playable / ${info.unusedPhrases??0} unused / ${info.uniquePointers??info.phrases.length} unique pointers / first ${first}`);
  }catch(err){realRom=false;$('#sequencePlay').disabled=true;$('#sequenceWav').disabled=true;$('#romStatus').textContent='ROM LOAD FAILED';sequenceStatus(`ERROR: ${err.message}`);log(`ERROR  ${err.message}`)}
};

const canvas=$('#scope'),g=canvas.getContext('2d');function draw(){const d=devicePixelRatio||1,w=canvas.clientWidth*d,h=canvas.clientHeight*d;if(canvas.width!==w){canvas.width=w;canvas.height=h}g.fillStyle='#171d1b';g.fillRect(0,0,w,h);g.strokeStyle='#303d38';g.lineWidth=1;for(let x=0;x<w;x+=w/12){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke()}for(let y=0;y<h;y+=h/6){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke()}const a=new Uint8Array(512);if(analyser)analyser.getByteTimeDomainData(a);else a.fill(128);g.strokeStyle='#b8d76a';g.lineWidth=2*d;g.beginPath();a.forEach((v,i)=>{const x=i/(a.length-1)*w,y=v/255*h;i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke();if(ctx){const t=ctx.currentTime-startedAt,m=Math.floor(t/60),s=Math.floor(t%60),ms=Math.floor(t%1*1000);$('#clock').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`}requestAnimationFrame(draw)}draw();
