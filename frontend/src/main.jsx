import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import ManualMixer from './ManualMixer';
import ExternalDisplay from './ExternalDisplay';
import './console.css';
import './mobile.css';
import './video-preview.css';
import './layout-fix.css';
import './modes.css';
import './compact-console.css';
const LIBRARY_STORAGE_KEY='nexera-youtube-library-v1';
function readSavedLibrary(){
 try{
   const saved=JSON.parse(localStorage.getItem(LIBRARY_STORAGE_KEY)||'{}');
   return {items:Array.isArray(saved.items)?saved.items:[],sources:Array.isArray(saved.sources)?saved.sources:[]};
 }catch{return {items:[],sources:[]}}
}
function normalizePlaylistUrl(raw){
 let value=raw.trim().replaceAll('\\&','&').replaceAll('\\_','_');
 const markdown=value.match(/^\[[^\]]*\]\((https?:\/\/[^)]+)\)$/);
 if(markdown)value=markdown[1];
 let parsed;
 try{parsed=new URL(value)}catch{throw Error('El enlace no parece válido. Pega la URL completa de YouTube.')}
 const host=parsed.hostname.toLowerCase().replace(/^www\./,'');
 const listId=parsed.searchParams.get('list');
 if(!['youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com'].includes(host)||!listId){
   throw Error('Ese enlace no contiene una playlist de YouTube. Usa un enlace con “list=…”.');
 }
 return `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
}
async function api(path,body){
 const r=await fetch('/api'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 let d;try{d=await r.json()}catch{throw Error('API no disponible. Comprueba Uvicorn.')}
 if(!r.ok)throw Error(typeof d.detail==='string'?d.detail:'Solicitud inválida');return d;
}
function MixerApp(){
 const [deckA,setDeckA]=useState(null),[deckB,setDeckB]=useState(null),[queueA,setQueueA]=useState([]),[queueB,setQueueB]=useState([]);
 const [mode,setMode]=useState('manual');
 const [url,U]=useState('https://www.youtube.com/playlist?list=PLeaHQ62DeBe0');
 const [savedLibrary]=useState(readSavedLibrary);
 const [playlistOpen,setPlaylistOpen]=useState(false);
 const [items,I]=useState(savedLibrary.items),[sources,SetSources]=useState(savedLibrary.sources),[chosen,C]=useState([]),[query,Q]=useState('');
 const [status,S]=useState('Carga una playlist'),[busy,B]=useState(false),[job,J]=useState(null),[duration,D]=useState(60),[aspect,A]=useState('16:9');
 const [outputChannel]=useState(()=>typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('nexera-video-output'));
 useEffect(()=>{
   try{localStorage.setItem(LIBRARY_STORAGE_KEY,JSON.stringify({items,sources}))}catch{}
 },[items,sources]);
 useEffect(()=>()=>outputChannel?.close(),[outputChannel]);
 useEffect(()=>{
   if(!outputChannel)return;
   const publish=()=>outputChannel.postMessage({type:'render',src:job?.status==='complete'?'/api/renders/'+job.id+'/video':null});
   const reply=event=>{if(event.data?.type==='request-state')publish()};
   outputChannel.addEventListener('message',reply);publish();
   return()=>outputChannel.removeEventListener('message',reply);
 },[outputChannel,job]);
 useEffect(()=>{
 if(!job||!['queued','running'].includes(job.status))return;
 let stopped=false;const timer=setTimeout(async()=>{try{const j=await api('/renders/'+job.id);if(!stopped){J(j);S(j.message);if(['complete','failed'].includes(j.status))B(false)}}catch(e){if(!stopped){S(e.message);B(false)}}},1500);
 return()=>{stopped=true;clearTimeout(timer)};
 },[job]);
 async function load(){
   let playlistUrl;
   try{playlistUrl=normalizePlaylistUrl(url)}catch(e){S(e.message);return}
   B(true);S('Leyendo playlist…');
   try{
     const d=await api('/youtube/playlist',{url:playlistUrl});
     const known=new Set(items.map(item=>item.id));
     const added=d.items.filter(item=>!known.has(item.id));
     I(current=>[...current,...added]);
     SetSources(current=>current.includes(playlistUrl)?current:[...current,playlistUrl]);
     setPlaylistOpen(false);
     S(added.length?`${added.length} canciones nuevas agregadas.`:'No se encontraron canciones nuevas. Puede que ya estuvieran en la biblioteca o que YouTube no muestre videos en esta playlist.');
   }catch(e){S(e.message)}
   finally{B(false)}
 }
 async function generate(){B(true);try{const j=await api('/renders',{ids:chosen.map(x=>x.id),duration:Number(duration),aspect});J(j);S(j.message)}catch(e){S(e.message);B(false)}}
 function addToDeck(deck,track){const setQueue=deck==='A'?setQueueA:setQueueB;const current=deck==='A'?deckA:deckB;if(!current){(deck==='A'?setDeckA:setDeckB)(track);return}setQueue(q=>!q.some(item=>item.id===track.id)?[...q,track]:q)}
 function advanceDeck(deck,index=0){
   const queue=deck==='A'?queueA:queueB;
   const next=queue[index];if(!next)return;
   (deck==='A'?setDeckA:setDeckB)({...next,autoplay:true});
   (deck==='A'?setQueueA:setQueueB)(q=>q.filter(item=>item.id!==next.id));
 }
 function move(i,n){const a=[...chosen];[a[i],a[i+n]]=[a[i+n],a[i]];C(a)}
 function openOutput(){const target=new URL(window.location.href);target.searchParams.set('output','1');const popup=window.open(target,'nexera-external-output','popup,width=1280,height=800');if(!popup)S('Chrome bloqueó la ventana. Permite ventanas emergentes para localhost.');else popup.focus()}
 const library=<aside className="browser"><div className="section-title library-toolbar"><strong>BIBLIOTECA</strong><span>{items.length} pistas · {sources.length} listas</span>{items.length>0&&<button aria-expanded={playlistOpen} aria-controls="playlist-form" onClick={()=>setPlaylistOpen(v=>!v)}>{playlistOpen?'Cerrar':'＋ Agregar playlist'}</button>}</div>
 {(playlistOpen||!items.length)&&<form id="playlist-form" className="playlist-form" onSubmit={e=>{e.preventDefault();load()}}><input aria-label="Enlace de playlist de YouTube" placeholder="Enlace de playlist pública u oculta…" value={url} onChange={e=>U(e.target.value)}/><button disabled={busy} type="submit">{busy?'Cargando…':'Cargar'}</button>{items.length>0&&<button type="button" disabled={busy} onClick={()=>{I([]);SetSources([]);C([]);S('Biblioteca vaciada. Pega otra playlist para comenzar.')}}>Vaciar biblioteca</button>}</form>}
 <input aria-label="Buscar canciones" placeholder="Buscar canciones…" value={query} onChange={e=>Q(e.target.value)}/>
 {items.filter(x=>x.title.toLowerCase().includes(query.toLowerCase())).map((x,i)=><div className="track" key={x.id+i}><span>{x.title}<small>{x.duration?Math.floor(x.duration/60)+':'+String(Math.floor(x.duration%60)).padStart(2,'0'):'Duración desconocida'}</small></span>{mode==='manual'?<><button onClick={()=>addToDeck('A',{...x})}>{deckA?'Cola A':'Cargar A'}</button><button onClick={()=>addToDeck('B',{...x})}>{deckB?'Cola B':'Cargar B'}</button></>:<button title={chosen.length>=25?'Máximo 25 canciones por mezcla':'Añadir a la mezcla'} disabled={busy||chosen.some(s=>s.id===x.id)||chosen.length>=25} onClick={()=>C([...chosen,x])}>＋</button>}</div>)}
 </aside>;
 const automaticTimeline=<section className="timeline"><div className="section-title">ORDEN DE LAS FUENTES {chosen.length>0&&<span>{chosen.length}/25 seleccionadas</span>}</div><p>Usa ＋ junto a las canciones para agregarlas aquí. Máximo 25 canciones por mezcla; duración final hasta 10 minutos.</p>
 {chosen.map((x,i)=><div className="track" key={x.id}><span>{i+1}. {x.title}</span><button disabled={busy||!i} onClick={()=>move(i,-1)}>↑</button><button disabled={busy||i===chosen.length-1} onClick={()=>move(i,1)}>↓</button><button disabled={busy} onClick={()=>C(chosen.filter(s=>s.id!==x.id))}>Quitar</button></div>)}
 {!chosen.length&&<p className="render-hint">Primero carga una playlist y agrega al menos una canción con ＋.</p>}
 {job&&<p className={'render-message '+(job.status==='failed'?'is-error':'')} role={job.status==='failed'?'alert':'status'}>{job.status==='queued'?'En cola… ':''}{job.status==='running'?'Procesando… ':''}{job.message}</p>}
 <p><label>Duración (segundos) <input type="number" min="1" max="600" value={duration} disabled={busy} onChange={e=>D(e.target.value)}/></label></p><label>Formato <select value={aspect} disabled={busy} onChange={e=>A(e.target.value)}>{['16:9','9:16','1:1'].map(x=><option key={x}>{x}</option>)}</select></label>
 <button className="generate" disabled={busy||!chosen.length||duration<1||duration>600} onClick={generate}>{busy?'PROCESANDO…':!chosen.length?'AGREGA CANCIONES PARA GENERAR':'GENERAR MEZCLA'}</button>
 </section>;
 return <main>
 <header><div className="brand">✦ NEXERA VIDEO MIXER</div><div className="project">{mode==='manual'?'Mixer manual':'Montaje automático'}</div><button className="external-output-button" onClick={openOutput}>ABRIR SALIDA EXTERNA</button>{mode==='automatic'&&job?.status==='complete'&&<a href={'/api/renders/'+job.id+'/video'} download="nexera.mp4">DESCARGAR MP4</a>}</header>
 <nav className="mode-switch" aria-label="Modo de trabajo"><button className={mode==='manual'?'active':''} aria-pressed={mode==='manual'} onClick={()=>setMode('manual')}>MIXER MANUAL</button><button className={mode==='automatic'?'active':''} aria-pressed={mode==='automatic'} onClick={()=>setMode('automatic')}>MEZCLA AUTOMÁTICA</button></nav>
 {mode==='manual'?<div className="performance-layout"><ManualMixer deckA={deckA} deckB={deckB} queueA={queueA} queueB={queueB} onQueueA={setQueueA} onQueueB={setQueueB} onAdvanceA={index=>advanceDeck('A',index)} onAdvanceB={index=>advanceDeck('B',index)} outputChannel={outputChannel}/><div className="workspace manual-library">{library}</div></div>:<div className="workspace automatic-workspace">{library}{automaticTimeline}</div>}
 {mode==='automatic'&&job?.status==='complete'&&<section className="render-preview"><div className="section-title">ÚLTIMO MONTAJE</div><video controls src={'/api/renders/'+job.id+'/video'} style={{width:'100%',maxHeight:260}}/></section>}
 <footer><span role="status">{status}</span></footer></main>
}
function App(){return new URLSearchParams(window.location.search).has('output')?<ExternalDisplay/>:<MixerApp/>}
createRoot(document.getElementById('root')).render(<App/>);
