import React,{forwardRef,useEffect,useImperativeHandle,useRef} from 'react';

let apiPromise;
function loadPlayerApi(){
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(!apiPromise)apiPromise=new Promise((resolve,reject)=>{
    const fail=error=>{window.clearTimeout(timeout);apiPromise=null;reject(error)};
    const ready=()=>{window.clearTimeout(timeout);resolve(window.YT)};
    const previous=window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady=()=>{previous?.();ready()};
    const script=document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    const timeout=window.setTimeout(()=>fail(Error('YouTube tardó demasiado en cargar. Comprueba la conexión y vuelve a intentar.')),20000);
    if(!script){const tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';tag.onerror=()=>fail(Error('No se pudo cargar el reproductor oficial de YouTube.'));document.head.appendChild(tag)}
  });
  return apiPromise;
}

const YoutubePlayer=forwardRef(function YoutubePlayer({videoId,title='YouTube',gain=1,autoplay=false,muted=false,onPlay,onPause,onEnded,onTimeUpdate,onError,onReady,className='youtube-player'},ref){
  const host=useRef(null),player=useRef(null),state=useRef(-1),time=useRef(0),length=useRef(0),ready=useRef(false),callbacks=useRef({}),config=useRef({});
  callbacks.current={onPlay,onPause,onEnded,onTimeUpdate,onError,onReady};
  config.current={gain,muted,autoplay};
  useImperativeHandle(ref,()=>({
    get paused(){return state.current!==1},
    get currentTime(){try{return player.current?.getCurrentTime?.()??time.current}catch{return time.current}},
    set currentTime(value){time.current=Number(value)||0;try{player.current?.seekTo?.(time.current,true)}catch{}},
    get duration(){try{return player.current?.getDuration?.()||length.current}catch{return length.current}},
    get volume(){try{return player.current?.getVolume?.()/100||0}catch{return 0}},
    set volume(value){try{player.current?.setVolume?.(Math.round(Math.max(0,Math.min(1,Number(value)||0))*100))}catch{}},
    get playbackRate(){try{return player.current?.getPlaybackRate?.()||1}catch{return 1}},
    set playbackRate(value){try{const allowed=player.current?.getAvailablePlaybackRates?.()||[1];if(allowed.includes(value))player.current.setPlaybackRate(value)}catch{}},
    play(){player.current?.playVideo?.();return Promise.resolve()},
    pause(){player.current?.pauseVideo?.()},
  }),[]);
  useEffect(()=>{
    let cancelled=false,timer;
    async function mount(){
      try{
        const YT=await loadPlayerApi();if(cancelled||!host.current)return;
        player.current=new YT.Player(host.current,{width:'100%',height:'100%',videoId,playerVars:{autoplay:0,controls:1,playsinline:1,rel:0,enablejsapi:1,origin:window.location.origin},events:{
          onReady:event=>{if(cancelled)return;ready.current=true;event.target.setVolume(config.current.muted?0:Math.round(Math.max(0,Math.min(1,config.current.gain))*100));callbacks.current.onReady?.();timer=window.setInterval(()=>{if(!player.current)return;try{time.current=player.current.getCurrentTime()||0;length.current=player.current.getDuration()||0;callbacks.current.onTimeUpdate?.(time.current,length.current)}catch{}},400);if(config.current.autoplay)event.target.playVideo()},
          onStateChange:event=>{state.current=event.data;if(event.data===YT.PlayerState.PLAYING)callbacks.current.onPlay?.();if(event.data===YT.PlayerState.PAUSED)callbacks.current.onPause?.();if(event.data===YT.PlayerState.ENDED)callbacks.current.onEnded?.();},
          onError:event=>callbacks.current.onError?.(event.data),
        }});
      }catch(error){if(!cancelled)callbacks.current.onError?.(error.message)}
    }
    mount();
    return()=>{cancelled=true;window.clearInterval(timer);ready.current=false;try{player.current?.destroy?.()}catch{}player.current=null};
  },[videoId]);
  useEffect(()=>{if(ready.current)try{player.current?.setVolume?.(muted?0:Math.round(Math.max(0,Math.min(1,gain))*100))}catch{}},[gain,muted]);
  return <div className={className} aria-label={`Video de YouTube: ${title}`}><div ref={host}/></div>;
});

export default YoutubePlayer;
