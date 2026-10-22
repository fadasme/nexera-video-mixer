import React,{useEffect,useRef,useState} from 'react';
import './external-display.css';
import YoutubePlayer from './YoutubePlayer';

function OutputDeck({deck,label,transitioning}){
  const video=useRef(null),youtube=useRef(null);
  function syncYoutube(player=youtube.current){
    if(!player)return;
    if(Number.isFinite(deck.position)&&Math.abs(player.currentTime-deck.position)>1.2){try{player.currentTime=deck.position}catch{}}
    if(deck.playing&&player.paused)player.play().catch(()=>{});else if(!deck.playing&&!player.paused)player.pause();
  }
  useEffect(()=>{
    if(deck.provider==='youtube'){syncYoutube();return}
    const node=video.current;
    if(!node||!deck.src||!node.readyState)return;
    if(Number.isFinite(deck.position)&&Math.abs(node.currentTime-deck.position)>0.8){
      try{node.currentTime=deck.position}catch{}
    }
    if(deck.playing)node.play().catch(()=>{});else node.pause();
  },[deck.src,deck.provider,deck.position,deck.playing]);
  const isYoutube=deck.provider==='youtube'&&Boolean(deck.videoId);
  return <div className={'output-deck '+(isYoutube?'output-deck-youtube ':'')+(transitioning?'is-transitioning':'')}>
    {isYoutube?<><YoutubePlayer key={deck.videoId} ref={youtube} videoId={deck.videoId} title={deck.title} muted autoplay={deck.playing} onReady={()=>syncYoutube()} className="output-youtube-player"/><span className="output-label-youtube">{label} · {deck.title}</span></>:deck.src?<video ref={video} src={deck.src} muted playsInline autoPlay onLoadedMetadata={()=>{if(video.current&&Number.isFinite(deck.position))video.current.currentTime=deck.position;if(deck.playing)video.current?.play().catch(()=>{});}}/>:<div className="output-empty">{label}<small>Sin pista cargada</small></div>}
    {!isYoutube&&<span className="output-label">{label}{deck.title&&` · ${deck.title}`}</span>}
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
  const hasSource=deck=>Boolean(deck?.src||deck?.videoId);
  const activeDeck=hasSource(decks[playingDeck])?decks[playingDeck]:(decks[playingDeck==='A'?'B':'A']||{});
  const activeLabel=playingDeck==='B'?'DECK B':'DECK A';
  useEffect(()=>{
    if(renderSrc||!(activeDeck?.src||activeDeck?.videoId))return;
    const identity=`${activeLabel}:${activeDeck.videoId||activeDeck.src}`;
    if(activeRef.current===identity)return;
    activeRef.current=identity;setTransitioning(true);
    const timer=setTimeout(()=>setTransitioning(false),320);
    return()=>clearTimeout(timer);
  },[activeLabel,activeDeck?.src,activeDeck?.videoId,renderSrc]);
  async function fullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{}}
  return <main className="external-display">
    <header><div className="brand">✦ NEXERA · SALIDA EXTERNA</div><span>{renderSrc?'MEZCLA GENERADA':'PROGRAMA EN VIVO'}</span><button onClick={fullscreen}>PANTALLA COMPLETA</button></header>
    <section className="external-stage">
      {renderSrc?<video key={renderSrc} className="render-output" src={renderSrc} controls autoPlay playsInline/>:<>
        {hasSource(activeDeck)&&<OutputDeck key={activeDeck.videoId||activeDeck.src} deck={activeDeck} label={activeLabel} transitioning={transitioning}/>}
        {!hasSource(decks.A)&&!hasSource(decks.B)&&<div className="output-help">Carga una pista en Deck A o B para verla aquí.<small>Arrastra esta ventana a la pantalla externa y pulsa Pantalla completa.</small></div>}
      </>}
    </section>
    {!renderSrc&&<footer><span>A {Math.round((1-mix)*100)}%</span><div><i style={{width:`${mix*100}%`}}/></div><span>B {Math.round(mix*100)}%</span></footer>}
  </main>
}
