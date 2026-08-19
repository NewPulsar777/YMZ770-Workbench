import test from 'node:test';import assert from 'node:assert/strict';import {YMZ770B,parsePhraseSequence} from '../src/ymz770b.js';
test('master volume defaults to maximum',()=>{assert.equal(new YMZ770B().masterVolume,255)});
test('address/data ports update global registers',()=>{const y=new YMZ770B();y.writePort(0,1);y.writePort(1,200);assert.equal(y.masterVolume,200)});
test('channel register map and key control',()=>{let starts=0;const y=new YMZ770B({start(){starts++}});y.writeRegister(0x44,9);y.writeRegister(0x45,100);y.writeRegister(0x46,8);y.writeRegister(0x47,3);assert.deepEqual({...y.channels[1]},{id:1,phrase:9,volume:100,pan:64,loop:true,playing:true});assert.equal(starts,1);y.writeRegister(0x47,0);assert.equal(y.channels[1].playing,false)});
test('sequence timer combines high and low bytes',()=>{const y=new YMZ770B();y.writeRegister(0x82,0x12);y.writeRegister(0x83,0x34);assert.equal(y.sequences[0].timer,0x1234)});
test('phrase list accepts padded decimal, separators, and explicit hex',()=>{assert.deepEqual(parsePhraseSequence('017 019,020\n0x1f'),[17,19,20,31])});
test('phrase list rejects values outside the register range',()=>{assert.throws(()=>parsePhraseSequence('17 256'),/256/)});
