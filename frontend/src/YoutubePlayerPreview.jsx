import React,{useEffect,useState} from 'react';
import ManualMixer from './ManualMixer';
import ExternalDisplay from './ExternalDisplay';
import './youtube-player-preview.css';

const demoA={id:'M7lc1UVf-VE',title:'Demo del reproductor oficial de YouTube',provider:'youtube'};
const demoB={id:'FekUwPHyaSU',title:'FekUwPHyaSU · pista que falló en el VPS',provider:'youtube'};

export default function YoutubePlayerPreview(){
  const params=new URLSearchParams(window.location.search);
  const [notice,setNotice]=useState('');
  const [deckA,setDeckA]=useState(demoA),[deckB,setDeckB]=useState(demoB);
  const [queueA,setQueueA]=useState([{id:'2dllo85ZSUk',title:'Blue (Da Ba Dee) · demo',provider:'youtube'}]);
  const [queueB,setQueueB]=useState([{id:'FekUwPHyaSU',title:'La Mejor Música Electrónica 2026',provider:'youtube'}]);
  const [channel]=useState(()=>typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('nexera-video-output'));
  useEffect(()=>()=>channel?.close(),[channel]);
  if(params.has('output'))return <ExternalDisplay/>;
  function advance(deck,index=0){
    const queue=deck==='A'?queueA:queueB,next=queue[index];if(!next)return;
    (deck==='A'?setDeckA:setDeckB)({...next,autoplay:true});
    (deck==='A'?setQueueA:setQueueB)(queue.filter((_,i)=>i!==index));
  }
  function openOutput(){const target=new URL(window.location.href);target.searchParams.set('output','1');const popup=window.open(target,'nexera-youtube-preview-output','popup,width=1280,height=800');if(!popup)setNotice('El navegador bloqueó la ventana. Permite ventanas emergentes para esta vista local.')}
  return <main className="youtube-preview">
    <div className="yp-preview-banner"><strong>PRUEBA LOCAL · Premium depende de que YouTube reconozca la sesión del navegador</strong><span>Los controles de deck manejan el reproductor oficial. Esta versión no está publicada en el VPS.</span></div>
    <header className="yp-topbar"><div className="yp-brand">✦ NEXERA VIDEO MIXER</div><span>Mixer manual · integración local</span><button onClick={openOutput}>ABRIR SALIDA EXTERNA</button></header>
    <nav className="yp-mode"><button className="selected">MIXER MANUAL</button><button disabled>MEZCLA AUTOMÁTICA</button></nav>
    {notice&&<p className="yp-notice" role="status">{notice}</p>}
    <ManualMixer deckA={deckA} deckB={deckB} queueA={queueA} queueB={queueB} onQueueA={setQueueA} onQueueB={setQueueB} onAdvanceA={index=>advance('A',index)} onAdvanceB={index=>advance('B',index)} outputChannel={channel}/>
  </main>
}
