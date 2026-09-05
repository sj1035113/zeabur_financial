const GAIN_COLOR='#ef4444',LOSS_COLOR='#16a34a';
const state={data:[],mainChart:null,range:'MAX',dataSignature:null,interactionController:null};
const money=value=>Number(value).toLocaleString('zh-TW',{style:'currency',currency:'USD',minimumFractionDigits:2});
const dateText=value=>(typeof value==='number'?new Date(value):new Date(`${value}T00:00:00`)).toLocaleDateString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit'});
const timestamp=item=>new Date(`${item.date}T00:00:00`).getTime();

function setChange(element,value,percent=false){
  const number=Number(value);element.classList.remove('gain','loss');element.classList.add(number>=0?'gain':'loss');
  element.textContent=percent?`${number>=0?'+':''}${number.toFixed(2)}%`:`${number>=0?'+':''}${money(number)}`;
}
function trend(data){
  if(data.length<2)return{change:0,rate:0,color:GAIN_COLOR};
  const change=data.at(-1).value-data[0].value;
  return{change,rate:data[0].value?change/data[0].value*100:0,color:change>=0?GAIN_COLOR:LOSS_COLOR};
}
function dataBetween(min,max){return state.data.filter(item=>timestamp(item)>=min&&timestamp(item)<=max)}
function visibleData(range){
  if(!state.data.length||range==='MAX')return state.data;
  const end=new Date(`${state.data.at(-1).date}T00:00:00`),start=new Date(end);
  if(range==='1M')start.setMonth(start.getMonth()-1);if(range==='3M')start.setMonth(start.getMonth()-3);
  if(range==='1Y')start.setFullYear(start.getFullYear()-1);if(range==='YTD')start.setMonth(0,1);
  return state.data.filter(item=>timestamp(item)>=start.getTime());
}
function updatePeriod(data=visibleData(state.range)){
  if(!data.length)return;const result=trend(data),start=data[0],end=data.at(-1);
  setChange(document.querySelector('#period-change'),result.change);setChange(document.querySelector('#period-rate'),result.rate,true);
  document.querySelector('#period-label').textContent={MAX:'全部資料','1M':'最近一個月','3M':'最近三個月','1Y':'最近一年',YTD:'今年以來'}[state.range]||'自訂區間';
  document.querySelector('#displayed-period').textContent=`${dateText(start.date)}－${dateText(end.date)}`;
}
function chartOptions(data,height=370){
  const color=trend(data).color;
  return{series:[{name:'資產價值',data:data.map(item=>[timestamp(item),item.value])}],chart:{type:'area',height,toolbar:{show:false},zoom:{enabled:false,autoScaleYaxis:true},animations:{enabled:false},fontFamily:'Inter, Noto Sans TC, sans-serif'},colors:[color],stroke:{curve:'smooth',width:3,colors:[color]},fill:{type:'gradient',colors:[color],gradient:{opacityFrom:.28,opacityTo:.02}},dataLabels:{enabled:false},markers:{size:0,hover:{size:5}},grid:{borderColor:'#e8edf4'},xaxis:{type:'datetime',labels:{datetimeUTC:false,style:{colors:'#657087'}}},yaxis:{opposite:true,forceNiceScale:true,labels:{formatter:value=>`$${Math.round(value).toLocaleString('zh-TW')}`,style:{colors:'#657087'}}},tooltip:{x:{format:'yyyy/MM/dd'},y:{formatter:value=>money(value)}},noData:{text:'目前沒有資產資料'}};
}
function applyTrendColor(chart,data){
  const color=trend(data).color;
  chart.updateOptions({colors:[color],stroke:{colors:[color]},fill:{colors:[color],type:'gradient',gradient:{opacityFrom:.28,opacityTo:.02}}},false,false);
}
function nearestData(targetTime){return state.data.reduce((nearest,item)=>Math.abs(timestamp(item)-targetTime)<Math.abs(timestamp(nearest)-targetTime)?item:nearest)}
function chartGrid(shell){const grid=shell.querySelector('.apexcharts-grid');return grid?grid.getBoundingClientRect():null}
function domain(chart){return{min:chart.w.globals.minX,max:chart.w.globals.maxX}}
function xToTime(clientX,grid,current){const ratio=Math.max(0,Math.min(1,(clientX-grid.left)/grid.width));return current.min+ratio*(current.max-current.min)}
function axisBounds(data){const values=data.map(item=>item.value),low=Math.min(...values),high=Math.max(...values),span=high-low||Math.max(Math.abs(low)*.03,1);return{min:low-span*.12,max:high+span*.12}}
function showSelection(startItem,endItem,chart){
  if(timestamp(startItem)>timestamp(endItem))[startItem,endItem]=[endItem,startItem];
  const selected=dataBetween(timestamp(startItem),timestamp(endItem));if(selected.length<2)return;
  const bounds=axisBounds(selected);state.range='CUSTOM';document.querySelectorAll('[data-range]').forEach(item=>item.classList.remove('active'));
  chart.updateOptions({xaxis:{min:timestamp(startItem),max:timestamp(endItem)},yaxis:{min:bounds.min,max:bounds.max,opposite:true,forceNiceScale:true,labels:{formatter:value=>`$${Math.round(value).toLocaleString('zh-TW')}`,style:{colors:'#657087'}}}},false,false);
  applyTrendColor(chart,selected);updatePeriod(selected);document.querySelector('#reset-range').classList.remove('hidden');
}
function bindChartInteraction(shellId,chart,signal){
  const shell=document.querySelector(shellId),selectionBox=shell.querySelector('.drag-selection');
  const gesture={mode:null,startX:0,currentX:0,lastX:0};
  const beginSelection=clientX=>{const grid=chartGrid(shell);if(!grid||clientX<grid.left||clientX>grid.right)return;gesture.mode='select';gesture.startX=clientX;gesture.currentX=clientX;selectionBox.style.display='block';selectionBox.style.top=`${grid.top-shell.getBoundingClientRect().top}px`;selectionBox.style.height=`${grid.height}px`;selectionBox.style.left=`${clientX-shell.getBoundingClientRect().left}px`;selectionBox.style.width='0px'};
  const moveSelection=clientX=>{const grid=chartGrid(shell);if(!grid)return;gesture.currentX=Math.max(grid.left,Math.min(grid.right,clientX));const shellLeft=shell.getBoundingClientRect().left;selectionBox.style.left=`${Math.min(gesture.startX,gesture.currentX)-shellLeft}px`;selectionBox.style.width=`${Math.abs(gesture.currentX-gesture.startX)}px`};
  const finishSelection=()=>{if(gesture.mode!=='select')return;const grid=chartGrid(shell);if(grid&&Math.abs(gesture.currentX-gesture.startX)>5){const current=domain(chart),start=nearestData(xToTime(gesture.startX,grid,current)),end=nearestData(xToTime(gesture.currentX,grid,current));showSelection(start,end,chart)}selectionBox.style.display='none';gesture.mode=null};
  const pan=clientX=>{const grid=chartGrid(shell);if(!grid)return;const current=domain(chart),fullMin=timestamp(state.data[0]),fullMax=timestamp(state.data.at(-1)),shift=-(clientX-gesture.lastX)/grid.width*(current.max-current.min);let min=current.min+shift,max=current.max+shift;if(min<fullMin){max+=fullMin-min;min=fullMin}if(max>fullMax){min-=max-fullMax;max=fullMax}chart.zoomX(min,max);gesture.lastX=clientX};
  const finishPan=()=>{gesture.mode=null;shell.style.cursor='';const current=domain(chart),visible=dataBetween(current.min,current.max);if(visible.length){const bounds=axisBounds(visible);chart.updateOptions({yaxis:{min:bounds.min,max:bounds.max,opposite:true,forceNiceScale:true,labels:{formatter:value=>`$${Math.round(value).toLocaleString('zh-TW')}`,style:{colors:'#657087'}}}},false,false);applyTrendColor(chart,visible);updatePeriod(visible)}};
  shell.addEventListener('mousedown',event=>{if(event.button===0)beginSelection(event.clientX);if(event.button===1){event.preventDefault();gesture.mode='pan';gesture.lastX=event.clientX;shell.style.cursor='grabbing'}},{signal});
  shell.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault()},{signal});
  window.addEventListener('mousemove',event=>{if(gesture.mode==='select')moveSelection(event.clientX);if(gesture.mode==='pan')pan(event.clientX)},{signal});
  window.addEventListener('mouseup',()=>{if(gesture.mode==='select')finishSelection();else if(gesture.mode==='pan')finishPan()},{signal});
  shell.addEventListener('touchstart',event=>{if(event.touches.length===2){event.preventDefault();gesture.mode='touch-pan';gesture.lastX=(event.touches[0].clientX+event.touches[1].clientX)/2}else if(event.touches.length===1)beginSelection(event.touches[0].clientX)},{passive:false,signal});
  shell.addEventListener('touchmove',event=>{if(gesture.mode==='touch-pan'&&event.touches.length===2){event.preventDefault();pan((event.touches[0].clientX+event.touches[1].clientX)/2)}else if(gesture.mode==='select'&&event.touches.length===1){event.preventDefault();moveSelection(event.touches[0].clientX)}},{passive:false,signal});
  shell.addEventListener('touchend',event=>{if(gesture.mode==='select')finishSelection();else if(gesture.mode==='touch-pan'&&event.touches.length<2)finishPan()},{signal});
}
async function renderCharts(){
  state.interactionController?.abort();state.interactionController=new AbortController();
  state.mainChart?.destroy();state.mainChart=new ApexCharts(document.querySelector('#main-chart'),chartOptions(state.data,430));
  await state.mainChart.render();bindChartInteraction('#main-chart-shell',state.mainChart,state.interactionController.signal);
}
async function applyPortfolio(payload){
  const signature=JSON.stringify(payload.data),dataChanged=signature!==state.dataSignature;state.dataSignature=signature;state.data=payload.data;document.querySelector('#current-value').textContent=money(payload.latest_value);document.querySelector('#last-updated').textContent=dateText(payload.last_date);document.querySelector('#record-count').textContent=`${payload.count} 筆資料`;document.querySelector('#sidebar-sync').textContent=payload.refreshing?'正在背景同步':`更新至 ${dateText(payload.last_date)}`;document.querySelector('#status-date').textContent=dateText(payload.last_date);document.querySelector('#status-count').textContent=`${payload.count} 筆`;document.querySelector('#preview-date').textContent=dateText(payload.last_date);document.querySelector('#preview-value').textContent=money(payload.latest_value);const latestChange=payload.data.length>1?payload.data.at(-1).value-payload.data.at(-2).value:0;setChange(document.querySelector('#preview-change'),latestChange);document.querySelector('#start-date').value=payload.first_date;document.querySelector('#start-date').min=payload.first_date;document.querySelector('#start-date').max=payload.last_date;document.querySelector('#end-date').value=payload.last_date;document.querySelector('#end-date').min=payload.first_date;document.querySelector('#end-date').max=payload.last_date;if(dataChanged){await renderCharts();updatePeriod()}
}
async function loadData(force=false){
  document.querySelector('#error-banner').classList.add('hidden');
  try{const response=await fetch(`/api/portfolio${force?'?force=true':''}`,{cache:'no-store'}),payload=await response.json();if(!response.ok)throw new Error(payload.detail||'目前無法取得資料。');localStorage.setItem('portfolio-cache',JSON.stringify(payload));await applyPortfolio(payload);if(payload.refreshing)setTimeout(()=>loadData(false),2500)}
  catch(error){document.querySelector('#error-message').textContent=error.message;document.querySelector('#error-banner').classList.remove('hidden')}
  finally{const loading=document.querySelector('#loading');loading.style.opacity='0';setTimeout(()=>loading.classList.add('hidden'),300)}
}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{const view=button.dataset.view;document.querySelectorAll('[data-view]').forEach(item=>item.classList.toggle('active',item.dataset.view===view));document.querySelectorAll('.view').forEach(item=>item.classList.remove('active'));document.querySelector(`#view-${view}`).classList.add('active');const titles={overview:['資產總覽','掌握每一次資產變化'],video:['影片製作','將資產歷程製作成直式影片'],status:['資料狀態','確認試算表同步情況']};document.querySelector('#page-eyebrow').textContent=titles[view][0];document.querySelector('#page-title').textContent=titles[view][1]}));
function setChartRange(range){state.range=range;document.querySelectorAll('[data-range]').forEach(item=>item.classList.toggle('active',item.dataset.range===range));const data=visibleData(range),bounds=axisBounds(data);state.mainChart.updateOptions({xaxis:{min:timestamp(data[0]),max:timestamp(data.at(-1))},yaxis:{min:bounds.min,max:bounds.max,opposite:true,forceNiceScale:true,labels:{formatter:value=>`$${Math.round(value).toLocaleString('zh-TW')}`,style:{colors:'#657087'}}}},false,false);applyTrendColor(state.mainChart,data);updatePeriod(data);document.querySelector('#reset-range').classList.toggle('hidden',range==='MAX')}
document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>setChartRange(button.dataset.range)));
document.querySelector('#reset-range').addEventListener('click',()=>setChartRange('MAX'));
document.querySelector('#video-range').addEventListener('change',event=>document.querySelector('#custom-dates').classList.toggle('hidden',event.target.value!=='CUSTOM'));
document.querySelector('#refresh-button').addEventListener('click',()=>loadData(true));document.querySelector('#retry-button').addEventListener('click',()=>loadData(true));
document.querySelector('#video-form').addEventListener('submit',async event=>{event.preventDefault();const button=document.querySelector('#generate-button'),progress=document.querySelector('#job-progress');button.disabled=true;button.textContent='正在產生影片';progress.classList.remove('hidden');const payload={date_range:document.querySelector('#video-range').value,start_date:document.querySelector('#start-date').value||null,end_date:document.querySelector('#end-date').value||null,fps:Number(document.querySelector('#fps').value),hold_seconds:Number(document.querySelector('#hold-seconds').value),resolution:document.querySelector('#resolution').value,theme:'light'};try{const response=await fetch('/api/videos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),data=await response.json();if(!response.ok)throw new Error(data.detail||'無法建立影片任務。');pollJob(data.job_id)}catch(error){showJobError(error.message)}});
async function pollJob(jobId){try{const response=await fetch(`/api/videos/${jobId}`,{cache:'no-store'}),job=await response.json();if(!response.ok||job.status==='failed')throw new Error(job.message||job.detail||'影片產生失敗。');document.querySelector('#progress-message').textContent=job.message;document.querySelector('#progress-number').textContent=`${job.progress}%`;document.querySelector('#progress-bar').style.width=`${job.progress}%`;if(job.status==='completed'){const player=document.querySelector('#video-player'),download=document.querySelector('#download-button');player.src=`/api/videos/${jobId}/stream`;player.classList.remove('hidden');document.querySelector('#preview-placeholder').classList.add('hidden');download.href=`/api/videos/${jobId}/download`;download.download=`資產成長紀錄_${new Date().toISOString().slice(0,10).replaceAll('-','')}.mp4`;download.classList.remove('hidden');document.querySelector('#progress-message').textContent='影片已完成，下載即將開始';document.querySelector('#generate-button').disabled=false;document.querySelector('#generate-button').textContent='重新產生';setTimeout(()=>download.click(),200);return}setTimeout(()=>pollJob(jobId),1200)}catch(error){showJobError(error.message)}}
function showJobError(message){document.querySelector('#progress-message').textContent=message;document.querySelector('#progress-number').textContent='失敗';document.querySelector('#progress-bar').style.width='0';document.querySelector('#generate-button').disabled=false;document.querySelector('#generate-button').textContent='重新產生'}
async function start(){try{const cached=JSON.parse(localStorage.getItem('portfolio-cache'));if(cached?.data?.length)await applyPortfolio(cached)}catch(_error){localStorage.removeItem('portfolio-cache')}await loadData()}
start();
