import { useEffect, useRef, type VideoHTMLAttributes } from 'react';
import { initializePreviewAudio } from './feedback-state.ts';
/** Defaults apply only to a new source, not each server polling update. */
export function PreviewVideo(props:Omit<VideoHTMLAttributes<HTMLVideoElement>,'muted'|'autoPlay'>) {
 const ref=useRef<HTMLVideoElement>(null);
 useEffect(()=>{if(ref.current)initializePreviewAudio(ref.current);},[props.src]);
 return <video {...props} ref={ref} />;
}
