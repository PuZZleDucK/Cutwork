/** A selected-song workspace remounts its video draft. Keep a manual chooser's
 * scroll and keyboard position, without pulling focus back from another tab. */
export async function selectSongFromList(button:HTMLButtonElement,select:()=>Promise<boolean>) {
 const id=button.id,list=button.closest<HTMLElement>('.song-list');
 const hadFocus=document.activeElement===button,scrollTop=list?.scrollTop??0;
 if(!await select())return;
 requestAnimationFrame(()=>{
  const next=document.getElementById(id);
  if(!next||next.matches(':disabled')||next.closest('[hidden]'))return;
  const nextList=next.closest<HTMLElement>('.song-list');
  if(nextList)nextList.scrollTop=scrollTop;
  if(hadFocus&&[document.body,button,next].includes(document.activeElement as HTMLElement))next.focus({preventScroll:true});
 });
}
