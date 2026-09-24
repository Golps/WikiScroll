(() => {
 const dialog=document.getElementById('aboutDialog');let trigger=null;
 document.querySelectorAll('[data-about-link]').forEach(link=>link.addEventListener('click',event=>{
  if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;
  if(!dialog.showModal)return;
  event.preventDefault();trigger=link;
  dialog.showModal();dialog.scrollTop=0;
 }));
 dialog.addEventListener('keydown',event=>event.stopPropagation());
 document.getElementById('aboutClose').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
 dialog.addEventListener('close',()=>trigger?.focus({preventScroll:true}));
})();
