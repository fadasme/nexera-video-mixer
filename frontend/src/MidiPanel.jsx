import React,{useEffect,useRef,useState} from 'react';
import './midi.css';

const bindings=[
 ['playA','Play / Pause','Deck A'],['cueA','CUE','Deck A'],['hotcue1A','CUE 1','Deck A'],['hotcue2A','CUE 2','Deck A'],['hotcue3A','CUE 3','Deck A'],['hotcue4A','CUE 4','Deck A'],['hotcue5A','CUE 5','Deck A'],['hotcue6A','CUE 6','Deck A'],['hotcue7A','CUE 7','Deck A'],['hotcue8A','CUE 8','Deck A'],['loopInA','LOOP IN','Deck A'],['loopOutA','LOOP OUT','Deck A'],['autoLoopA','AUTO LOOP','Deck A'],['beatBackA','BEAT JUMP −','Deck A'],['beatForwardA','BEAT JUMP +','Deck A'],['previousA','PREVIOUS','Deck A'],['nextA','NEXT','Deck A'],['duplicate','DUPLICATE','Navegación'],['jogA','JOG / VINYL (giro)','Deck A'],['jogTouchA','JOG TOUCH (contacto)','Deck A'],['volumeA','PARAM.1 · VOLUMEN A','Deck A'],['pitchA','Pitch fader','Deck A'],['pitchBendA','PITCH BEND ±','Deck A'],['keyLockA','KEY LOCK','Deck A'],['syncA','SYNC / MASTER','Deck A'],['deleteCueA','CUE / LOOP DELETE','Deck A'],['fx1','FX 1 ON','FX'],['fx2','FX 2 ON','FX'],['fxDryWet','FX DRY / WET','FX'],['filter','FILTER','FX'],
 ['playB','Play / Pause','Deck B'],['cueB','CUE','Deck B'],['hotcue1B','CUE 1','Deck B'],['hotcue2B','CUE 2','Deck B'],['hotcue3B','CUE 3','Deck B'],['hotcue4B','CUE 4','Deck B'],['hotcue5B','CUE 5','Deck B'],['hotcue6B','CUE 6','Deck B'],['hotcue7B','CUE 7','Deck B'],['hotcue8B','CUE 8','Deck B'],['loopInB','LOOP IN','Deck B'],['loopOutB','LOOP OUT','Deck B'],['autoLoopB','AUTO LOOP','Deck B'],['beatBackB','BEAT JUMP −','Deck B'],['beatForwardB','BEAT JUMP +','Deck B'],['previousB','PREVIOUS','Deck B'],['nextB','NEXT','Deck B'],['jogB','JOG / VINYL (giro)','Deck B'],['jogTouchB','JOG TOUCH (contacto)','Deck B'],['volumeB','PARAM.2 · VOLUMEN B','Deck B'],['pitchBfader','Pitch fader','Deck B'],['pitchBendB','PITCH BEND ±','Deck B'],['keyLockB','KEY LOCK','Deck B'],['syncB','SYNC / MASTER','Deck B'],['deleteCueB','CUE / LOOP DELETE','Deck B'],['crossfader','Crossfader','Mezcla']
];
const midiKey=e=>{const kind=e.data[0]&240;return `${kind}:${kind===224?'*':e.data[1]}:${e.data[0]&15}`};

export default function MidiPanel({onAction,onCrossfader,onDeckVolume,onUnsupported}){
 const [status,setStatus]=useState('MIDI no conectado');
 const [devices,setDevices]=useState([]),[access,setAccess]=useState(null),[learn,setLearn]=useState(null),[map,setMap]=useState(()=>{try{const saved=JSON.parse(localStorage.getItem('nexera-denon-midi-map')||'{}');for(const id of ['pitchA','pitchBfader'])if(/^224:\d+:\d+$/.test(saved[id]||''))saved[id]=saved[id].replace(/^224:\d+:/,'224:*:');return saved}catch{return {}}});
 const learnRef=useRef(null),mapRef=useRef({}),actionRef=useRef(onAction),crossRef=useRef(onCrossfader),deckVolumeRef=useRef(onDeckVolume),unsupportedRef=useRef(onUnsupported);
 useEffect(()=>{learnRef.current=learn},[learn]);
 useEffect(()=>{mapRef.current=map;localStorage.setItem('nexera-denon-midi-map',JSON.stringify(map))},[map]);
 useEffect(()=>{actionRef.current=onAction;crossRef.current=onCrossfader;deckVolumeRef.current=onDeckVolume;unsupportedRef.current=onUnsupported},[onAction,onCrossfader,onDeckVolume,onUnsupported]);
 useEffect(()=>{
   if(!access)return;
   function refresh(){
     const inputs=[...access.inputs.values()];setDevices(inputs.map(x=>x.name||'MIDI sin nombre'));
     inputs.forEach(input=>{input.onmidimessage=e=>{
       const [kind,number,channel]=[e.data[0]&240,e.data[1],e.data[0]&15],key=midiKey(e);
       const currentLearn=learnRef.current;
       if(currentLearn){
         if(kind!==128 && !(kind===144&&e.data[2]===0)){
           const next={...mapRef.current,[currentLearn]:key};mapRef.current=next;setMap(next);learnRef.current=null;setLearn(null);setStatus(`Control asignado (${key})`);
         }
         return;
       }
       for(const [id,mapped] of Object.entries(mapRef.current)){
         if(id.startsWith('jogTouch')){
           const [,mappedNumber,mappedChannel]=mapped.split(':').map(Number);
           if(mappedNumber===number&&mappedChannel===channel&&(kind===128||kind===144)){
             actionRef.current(id,kind===144&&e.data[2]>0);
           }
           continue;
         }
         if(key!==mapped)continue;
         if(id==='crossfader'&&kind===176){crossRef.current(e.data[2]/127);continue;}
         if((id==='volumeA'||id==='volumeB')&&kind===176){if(e.data[2]===0)deckVolumeRef.current?.(id==='volumeA'?'A':'B',0.04);else if(e.data[2]===127)deckVolumeRef.current?.(id==='volumeA'?'A':'B',-0.04);continue;}
         if((id==='pitchA'||id==='pitchBfader')&&kind===224){const raw=(e.data[2]<<7)|e.data[1];actionRef.current(id,Math.round(raw*127/16383));continue;}
         if((id.startsWith('jog')||id.startsWith('pitch')||id.startsWith('volume'))&&kind===176){actionRef.current(id,e.data[2]);continue;}
         if(kind===128||(kind===144&&e.data[2]===0)||kind===176)continue;
         const implemented=['playA','cueA','playB','cueB','crossfader','stopA','stopB','backA','backB','forwardA','forwardB','jogA','jogB','pitchA','pitchBfader','pitchBendA','pitchBendB','volumeUpA','volumeDownA','volumeUpB','volumeDownB',...Array.from({length:8},(_,i)=>`hotcue${i+1}A`),...Array.from({length:8},(_,i)=>`hotcue${i+1}B`),'loopInA','loopOutA','loopInB','loopOutB','deleteCueA','deleteCueB'];
         if(implemented.includes(id))actionRef.current(id,e.data[2]);
         else unsupportedRef.current(id);
       }
     }});
     setStatus(inputs.length?`Conectado · ${inputs.length} entrada(s) MIDI`:'Permiso concedido · conecta el Denon por USB');
   }
   refresh();access.onstatechange=refresh;
   return()=>{access.onstatechange=null;for(const i of access.inputs.values())i.onmidimessage=null};
 },[access]);
 async function connect(){
   try{
     if(!navigator.requestMIDIAccess)throw Error('Web MIDI no está disponible. Usa Chrome o Edge de escritorio en localhost.');
     const midi=await navigator.requestMIDIAccess();setAccess(midi);
   }catch(e){setStatus(e.name==='NotAllowedError'?'Chrome bloqueó el acceso MIDI. Permite dispositivos MIDI en los permisos del sitio.':e.message)}
 }
 return <div className="midi-panel">
   <button onClick={connect}>{access?'ACTUALIZAR DISPOSITIVOS MIDI':'CONECTAR DENON / MIDI'}</button>
   <span role="status">{status}{devices.length>0&&`: ${devices.join(', ')}`}</span>
   {['Deck A','Deck B','Navegación','Mezcla','FX'].map(group=><details className="midi-group" key={group}><summary>{group}</summary><div className="midi-bindings">{bindings.filter(x=>x[2]===group).map(([id,label])=><button key={id} className={learn===id?'learning':''} onClick={()=>{
     if(!access){setStatus('Pulsa primero Conectar Denon / MIDI');return}
     learnRef.current=id;setLearn(id);setStatus(`Ahora pulsa el control físico para ${label}`);
   }}>{learn===id?'PULSA EL DENON…':label}{map[id]?' ✓':''}</button>)}</div></details>)}
   {Object.keys(map).length>0&&<button onClick={()=>{setMap({});setStatus('Asignaciones borradas')}}>BORRAR ASIGNACIONES</button>}
 </div>;
}
