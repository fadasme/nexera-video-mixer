import React, {useCallback, useEffect, useRef, useState} from 'react';
import './mixer.css';
import MidiPanel from './MidiPanel';
import YoutubePlayer from './YoutubePlayer';

const clock = n => `${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;

function Deck({name, gain, track, command, volume, queue=[], onVolume, onOutputUpdate, onAdvance, onQueueChange}) {
  const player=useRef(null);
  const [source,setSource]=useState(null), [playing,setPlaying]=useState(false);
  const [position,setPosition]=useState(0), [duration,setDuration]=useState(0);
  const [error,setError]=useState('');
  const [scratching,setScratching]=useState(false);
  const [rate,setRate]=useState(1);
  const [hotCues,setHotCues]=useState({}),[loop,setLoop]=useState({in:null,out:null,active:false});
  const hotCueRef=useRef({}),loopRef=useRef({in:null,out:null,active:false});
  useEffect(()=>{hotCueRef.current=hotCues},[hotCues]);
  useEffect(()=>{loopRef.current=loop},[loop]);
  const [preparing,setPreparing]=useState('');
  const autoplayNext=useRef(false);
  const request=useRef(0);
  useEffect(()=>{
    if(!track)return;
    const token=++request.current;
    autoplayNext.current=Boolean(track.autoplay);
    hotCueRef.current={};setHotCues({});
    loopRef.current={in:null,out:null,active:false};setLoop(loopRef.current);
    let stopped=false, timer;
    player.current?.pause();setSource(null);setDuration(0);setPosition(0);setPlaying(false);setError('');
    if(track.provider==='youtube'||track.kind==='youtube'){
      setSource({kind:'youtube',id:track.id,name:track.title});setPreparing('');
      return()=>{if(token===request.current)request.current++};
    }
    setPreparing('Descargando '+track.title+'…');
    async function poll(first=false){
      try {
        const r=await fetch('/api/decks/'+track.id,first?{method:'POST'}:{});
        if(r.status===404)throw Error('La API está desactualizada. Reinicia el servidor de Nexera para habilitar los decks.');
        const d=await r.json();
        if(stopped||token!==request.current)return;
        if(!r.ok)throw Error(typeof d.detail==='string'?d.detail:'No se pudo preparar el video');
        if(d.status==='failed')throw Error(d.message);
        if(d.status==='ready'){
          setSource({url:'/api/decks/'+track.id+'/video',name:track.title});setPreparing('');
        }else{setPreparing(d.message+' '+track.title);timer=setTimeout(()=>poll(),1500);}
      }catch(e){if(!stopped&&token===request.current){setError('Carga fallida: '+e.message);setPreparing('');}}
    }
    poll(true);
    return()=>{stopped=true;clearTimeout(timer);};
  },[track]);
  useEffect(()=>{ if(player.current) player.current.volume=volume*gain; },[volume,gain,source]);
  useEffect(()=>()=>{if(source?.url) URL.revokeObjectURL(source.url);},[source]);
  function load(file) {
    if(!file)return;
    request.current++;setPreparing('');
    autoplayNext.current=false;
    player.current?.pause();
    setError('');setPosition(0);setDuration(0);setPlaying(false);
    setSource({url:URL.createObjectURL(file),name:file.name});
  }
  async function toggle() {
    const p=player.current;
    if(!p||!source)return;
    if(!p.paused){p.pause();return;}
    try{await p.play();setError('');}catch{setError('No se pudo reproducir. Prueba un archivo MP3, WAV o MP4 compatible.');}
  }
  function seek(value){player.current.currentTime=value;setPosition(value);}
  const scratch=useRef({touching:false,resume:false});
  useEffect(()=>{
    if(!command||!player.current||!source)return;
    const p=player.current;
    if(command.type==='play'){if(p.paused)toggle();else p.pause();}
    if(command.type==='stop'){p.pause();seek(0);}
    if(command.type==='cue')seek(0);
    if(command.type==='seek')seek(Math.max(0,Math.min(duration,position+command.delta)));
    if(command.type==='volume')onVolume(command.value===undefined?v=>Math.max(0,Math.min(1,v+command.delta)):command.value/127);
    if(command.type==='pitch'){
      if(source.kind==='youtube')setError('Pitch no está disponible para videos incrustados de YouTube. Usa un archivo local.');
      else setRate(command.value===undefined?v=>Math.max(.5,Math.min(1.5,v+command.delta)):.8+command.value/127*.4);
    }
    if(command.type==='jog'){
      const offset=Number(command.value)-64;
      if(offset!==0){const step=offset*(scratch.current.touching?0.012:0.002);const next=Math.max(0,Math.min(duration,p.currentTime+step));p.currentTime=next;setPosition(next);}
    }
    if(command.type==='jogTouch'){
      if(source.kind==='youtube'){setError('Scratch no está disponible para videos incrustados de YouTube. Usa un archivo local.');return;}
      if(command.pressed&&!scratch.current.touching){scratch.current={touching:true,resume:!p.paused};setScratching(true);if(!p.paused)p.pause();}
      else if(!command.pressed&&scratch.current.touching){const resume=scratch.current.resume;scratch.current={touching:false,resume:false};setScratching(false);if(resume)p.play().catch(()=>setError('No se pudo reanudar el audio después del scratch.'));}
    }
    if(command.type==='hotcue'){const key=String(command.index),points=hotCueRef.current;if(points[key]===undefined){const next={...points,[key]:position};hotCueRef.current=next;setHotCues(next);}else seek(points[key]);}
    if(command.type==='loopIn'){const next={in:position,out:null,active:false};loopRef.current=next;setLoop(next);}
    if(command.type==='loopOut'){const old=loopRef.current;if(old.in===null||position<=old.in){setError('Pulsa LOOP IN antes de LOOP OUT.');}else{const next={...old,out:position,active:true};loopRef.current=next;setLoop(next);}}
    if(command.type==='deleteCues'){hotCueRef.current={};setHotCues({});const next={in:null,out:null,active:false};loopRef.current=next;setLoop(next);}
  },[command,source]);
  useEffect(()=>{if(player.current)player.current.playbackRate=rate;},[rate,source]);
  useEffect(()=>{onOutputUpdate(name,{src:source?.url||null,provider:source?.kind||null,videoId:source?.id||null,title:source?.name||'',playing,position,duration})},[onOutputUpdate,name,source,playing,position,duration]);
  return <section className={'deck manual-deck deck-'+name}>
    <h2><span>DECK {name}</span><small>{scratching?'SCRATCH':playing?'REPRODUCIENDO':source?'LISTO':'SIN PISTA'}</small></h2>
    {preparing&&<p role="status">{preparing}</p>}
    <label className="file-picker">Cargar música o video en {name}<input aria-label={'Cargar archivo en '+name} type="file" accept="audio/*,video/*" onChange={e=>{load(e.target.files?.[0]);e.target.value='';}}/></label>
    {source&&<p className="track-name">{source.name}</p>}
    {source?.kind==='youtube'?<YoutubePlayer key={source.id} ref={player} videoId={source.id} title={source.name} gain={volume*gain} autoplay={autoplayNext.current}
      onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);onAdvance?.();}}
      onTimeUpdate={(now,total)=>{if(total>0&&total!==duration)setDuration(total);setPosition(now);const mark=loopRef.current;if(mark.active&&mark.in!==null&&mark.out!==null&&now>=mark.out)seek(mark.in)}}
      onError={code=>setError(typeof code==='number'?(code===101||code===150?'Este video no permite reproducción incrustada. Ábrelo en YouTube.':code===153?'YouTube no recibió el origen del mixer; prueba la dirección HTTPS pública.':`YouTube no pudo reproducir este video (código ${code}).`):code)}/>:source?<video ref={player} src={source.url} playsInline preload="metadata" controls
      onLoadedMetadata={()=>{const d=player.current.duration;setDuration(Number.isFinite(d)?d:0);}}
      onTimeUpdate={()=>{const now=player.current.currentTime;setPosition(now);const mark=loopRef.current;if(mark.active&&mark.in!==null&&mark.out!==null&&now>=mark.out)seek(mark.in)}}
      onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);onAdvance?.();}}
      onCanPlay={()=>{if(autoplayNext.current){autoplayNext.current=false;player.current?.play().catch(()=>setError('Pulsa Reproducir para iniciar esta pista; el navegador bloqueó el inicio automático.'));}}}
      onError={()=>setError('El navegador no puede leer este archivo. Prueba MP3, WAV o MP4.')}/>:<div className="video-empty">VISTA PREVIA · CARGA UNA PISTA</div>}
    <div className="deck-clock">{clock(position)} / {clock(duration)} <span className="deck-rate">· {Math.round(rate*100)}%</span></div>
    <input aria-label={'Posición '+name} type="range" min="0" max={duration||1} step="0.1" value={position} disabled={!duration} onChange={e=>seek(Number(e.target.value))}/>
    <div className="manual-buttons"><button disabled={!duration} onClick={toggle}>{playing?'Pausar':'Reproducir'} {name}</button><button disabled={!duration} onClick={()=>{player.current.pause();seek(0);}}>Volver al inicio</button></div>
    <div className="cue-status">CUES {Object.keys(hotCues).length}/8 · LOOP {loop.active?'ACTIVO':loop.in!==null?'MARCADO':'INACTIVO'}</div>
    <label className="deck-volume-control"><span><strong>FADER VOLUMEN {name}</strong><output>{Math.round(volume*100)}%</output></span><input aria-label={'Fader volumen Deck '+name} type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>onVolume(Number(e.target.value))}/></label>
    {error&&<p role="alert">{error}{source?.kind==='youtube'&&<>{' '}<a href={`https://www.youtube.com/watch?v=${source.id}`} target="_blank" rel="noreferrer">Abrir en YouTube</a></>}</p>}
    <section className="deck-queue" aria-label={'Lista de reproducción Deck '+name}>
      <strong>LISTA DECK {name} · {queue.length} pendientes</strong>
      <p className="queue-current">Actual: {source?.name||'Sin canción cargada'}</p>
      {queue.length===0?<p className="queue-empty">Agrega canciones desde la biblioteca con «Cola {name}». La primera se carga en el deck; las siguientes aparecen aquí.</p>:<ol className="queue-items">{queue.map((item,index)=><li className="queue-item" key={item.id}>
        <span title={item.title}>{index===0?'SIGUIENTE · ':`${index+1}. `}{item.title}</span>
        <button title="Reemplaza la pista actual y reproduce esta canción" aria-label={'Reproducir ahora '+item.title+' en Deck '+name} onClick={()=>onAdvance?.(index)}>▶ Ahora</button>
        <button aria-label={'Subir '+item.title+' en Deck '+name} disabled={index===0} onClick={()=>{const next=[...queue];[next[index-1],next[index]]=[next[index],next[index-1]];onQueueChange?.(next)}}>↑</button>
        <button aria-label={'Bajar '+item.title+' en Deck '+name} disabled={index===queue.length-1} onClick={()=>{const next=[...queue];[next[index+1],next[index]]=[next[index],next[index+1]];onQueueChange?.(next)}}>↓</button>
        <button aria-label={'Quitar '+item.title+' de Deck '+name} onClick={()=>onQueueChange?.(queue.filter((_,i)=>i!==index))}>×</button>
      </li>)}</ol>}
    </section>
  </section>;
}

export default function ManualMixer({deckA,deckB,queueA=[],queueB=[],outputChannel,onAdvanceA,onAdvanceB,onQueueA,onQueueB}){
  const [mix,setMix]=useState(0.5);
  const [masterVolume,setMasterVolume]=useState(0.8);
  const [deckVolumes,setDeckVolumes]=useState({A:1,B:1});
  const visuals=useRef({A:{src:null,title:'',playing:false,position:0,duration:0},B:{src:null,title:'',playing:false,position:0,duration:0}});
  const [midiNotice,setMidiNotice]=useState('');
  const [commands,setCommands]=useState({A:null,B:null});
  const publishDeck=useCallback((deck,payload)=>{visuals.current[deck]=payload;outputChannel?.postMessage({type:'deck',deck,payload})},[outputChannel]);
  useEffect(()=>{
    if(!outputChannel)return;
    const reply=event=>{if(event.data?.type==='request-state'){outputChannel.postMessage({type:'mix',mix});for(const deck of ['A','B'])outputChannel.postMessage({type:'deck',deck,payload:visuals.current[deck]});}};
    outputChannel.addEventListener('message',reply);
    outputChannel.postMessage({type:'mix',mix});
    return()=>outputChannel.removeEventListener('message',reply);
  },[outputChannel,mix]);
  function action(id,value){const deck=(id==='pitchBfader'||id.endsWith('B'))?'B':'A';let type='play',delta=0,index;if(id.startsWith('cue'))type='cue';else if(id.startsWith('hotcue')){type='hotcue';index=Number(id.match(/hotcue(\d+)/)?.[1]);}else if(id.startsWith('loopIn'))type='loopIn';else if(id.startsWith('loopOut'))type='loopOut';else if(id.startsWith('deleteCue'))type='deleteCues';else if(id.startsWith('stop'))type='stop';else if(id.startsWith('back')){type='seek';delta=-5;}else if(id.startsWith('forward')){type='seek';delta=5;}else if(id.startsWith('volumeUp')){type='volume';delta=.05;}else if(id.startsWith('volumeDown')){type='volume';delta=-.05;}else if(id==='pitchA'||id==='pitchBfader'){type='pitch';}else if(id.startsWith('pitchBend')){type='pitch';delta=value>63?.02:-.02;}else if(id.startsWith('jogTouch')){type='jogTouch';}else if(id.startsWith('jog'))type='jog';setCommands(v=>({...v,[deck]:{type,delta,value,pressed:value,index,at:Date.now()}}));}
  return <section aria-label="Mixer manual">
    <MidiPanel onAction={action} onCrossfader={setMix} onDeckVolume={(deck,delta)=>setDeckVolumes(v=>({...v,[deck]:Math.max(0,Math.min(1,v[deck]+delta))}))} onUnsupported={id=>setMidiNotice(`${id}: asignación guardada; función aún pendiente en Nexera.`)}/>
    {midiNotice&&<p className="manual-note" role="status">{midiNotice}</p>}
    <div className="decks manual-mixer"><Deck name="A" gain={(1-mix)*masterVolume} track={deckA} queue={queueA} onQueueChange={onQueueA} onAdvance={onAdvanceA} command={commands.A} volume={deckVolumes.A} onVolume={v=>setDeckVolumes(current=>({...current,A:typeof v==='function'?v(current.A):v}))} onOutputUpdate={publishDeck}/><aside className="crossfader"><h3>MEZCLA</h3><label htmlFor="manual-crossfade">A ← Crossfader → B</label><input id="manual-crossfade" type="range" min="0" max="1" step="0.01" value={mix} onChange={e=>setMix(Number(e.target.value))}/><span>A {Math.round((1-mix)*100)}% · B {Math.round(mix*100)}%</span><button onClick={()=>setMix(0.5)}>Centrar</button><label htmlFor="manual-master-volume">VOLUMEN MASTER</label><input id="manual-master-volume" aria-label="Volumen master" type="range" min="0" max="1" step="0.01" value={masterVolume} onChange={e=>setMasterVolume(Number(e.target.value))}/><span>{Math.round(masterVolume*100)}%</span></aside><Deck name="B" gain={mix*masterVolume} track={deckB} queue={queueB} onQueueChange={onQueueB} onAdvance={onAdvanceB} command={commands.B} volume={deckVolumes.B} onVolume={v=>setDeckVolumes(current=>({...current,B:typeof v==='function'?v(current.B):v}))} onOutputUpdate={publishDeck}/></div>
    <p className="manual-note">YouTube se reproduce en su reproductor oficial: conserva su marca y posibles anuncios, y algunos videos no permiten inserción. Pitch y scratch están disponibles solo para archivos locales. La mezcla automática aún usa preparación de video en el servidor.</p>
  </section>;
}
