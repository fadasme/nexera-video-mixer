import React,{useEffect,useRef,useState} from 'react';
import './external-display.css';

function OutputDeck({deck,label,transitioning}){
  const video=useRef(null);
  useEffect(()=>{
    const node=video.current;
    if(!node||!deck.src||!node.readyState)return;
    if(Number.isFinite(deck.position)&&Math.abs(node.currentTime-deck.position)>0.8){
      try{node.currentTime=deck.position}catch{}
    }
    if(deck.playing)node.play().catch(()=>{});else node.pause();
  },[deck.src,deck.position,deck.playing]);
  return <div className={'output-deck '+(transitioning?'is-transitioning':'')}>
    {deck.src?<video ref={video} src={deck.src} muted playsInline autoPlay onLoadedMetadata={()=>{if(video.current&&Number.isFinite(deck.position))video.current.currentTime=deck.position;if(deck.playing)video.current?.play().catch(()=>{});}}/>:<div className="output-empty">{label}<small>Sin pista cargada</small></div>}
    <span className="output-label">{label}{deck.title&&` · ${deck.title}`}</span>
  </div>
}

export default function ExternalDisplay(){
  const [decks,setDecks]=useState({A:{},B:{}}),[mix,setMix]=useState(0.5),[renderSrc,setRenderSrc]=useState(null),[transitioning,setTransitioning]=useState(false);
  const activeRef=useRef(null);
  const channel=useRef(null);
  useEffect(()=>{
    const bus=new BroadcastChannel('nexera-video-output');channel.current=bus;
    bus.onmessage=({data})=>{
      if(data.type==='deck')setDecks(v=>({...v,[data.deck]:data.payload}));
      if(data.type==='mix')setMix(data.mix);
      if(data.type==='render')setRenderSrc(data.src||null);
    };
    bus.postMessage({type:'request-state'});
    return()=>{bus.close();channel.current=null};
  },[]);
  // La salida sigue al deck que realmente está reproduciéndose. El crossfader
  // solo desempata cuando ambos decks están activos.
  const preferred=mix>=0.5?'B':'A';
  const playingDeck=decks.A?.playing&&!decks.B?.playing?'A':decks.B?.playing&&!decks.A?.playing?'B':preferred;
  const activeDeck=decks[playingDeck]?.src?decks[playingDeck]:(decks[playingDeck==='A'?'B':'A']||{});
  const activeLabel=playingDeck==='B'?'DECK B':'DECK A';
  useEffect(()=>{
    if(renderSrc||!activeDeck?.src)return;
    const identity=`${activeLabel}:${activeDeck.src}`;
    if(activeRef.current===identity)return;
    activeRef.current=identity;setTransitioning(true);
    const timer=setTimeout(()=>setTransitioning(false),320);
    return()=>clearTimeout(timer);
  },[activeLabel,activeDeck?.src,renderSrc]);
  async function fullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{}}
  return <main className="external-display">
    <header><div className="brand">✦ NEXERA · SALIDA EXTERNA</div><span>{renderSrc?'MEZCLA GENERADA':'PROGRAMA EN VIVO'}</span><button onClick={fullscreen}>PANTALLA COMPLETA</button></header>
    <section className="external-stage">
      {renderSrc?<video key={renderSrc} className="render-output" src={renderSrc} controls autoPlay playsInline/>:<>
        {activeDeck.src&&<OutputDeck key={activeDeck.src} deck={activeDeck} label={activeLabel} transitioning={transitioning}/>} 
        {!decks.A.src&&!decks.B.src&&<div className="output-help">Carga una pista en Deck A o B para verla aquí.<small>Arrastra esta ventana a la pantalla externa y pulsa Pantalla completa.</small></div>}
      </>}
    </section>
    {!renderSrc&&<footer><span>A {Math.round((1-mix)*100)}%</span><div><i style={{width:`${mix*100}%`}}/></div><span>B {Math.round(mix*100)}%</span></footer>}
  </main>
}
