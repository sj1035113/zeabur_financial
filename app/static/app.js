const state={data:[],mainChart:null,detailChart:null,range:'MAX'};
const money=value=>Number(value).toLocaleString('zh-TW',{style:'currency',currency:'USD',minimumFractionDigits:2});
const dateText=value=>new Date(`${value}T00:00:00`).toLocaleDateString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit'});

function setChange(element,value,percent=false){
  const number=Number(value); element.classList.remove('gain','loss');
  element.classList.add(number>=0?'gain':'loss');
  element.textContent=percent?`${number>=0?'+':''}${number.toFixed(2)}%`:`${number>=0?'+':''}${money(number)}`;
}
function visibleData(range){
  if(!state.data.length||range==='MAX')return state.data;
  const end=new Date(`${state.data.at(-1).date}T00:00:00`),start=new Date(end);
  if(range==='1M')start.setMonth(start.getMonth()-1);
  if(range==='3M')start.setMonth(start.getMonth()-3);
  if(range==='1Y')start.setFullYear(start.getFullYear()-1);
  if(range==='YTD')start.setMonth(0,1);
  return state.data.filter(item=>new Date(`${item.date}T00:00:00`)>=start);
}
function updatePeriod(range=state.range){
  const data=visibleData(range); if(!data.length)return;
  const start=data[0],end=data.at(-1),change=end.value-start.value,rate=start.value?change/start.value*100:0;
  setChange(document.querySelector('#period-change'),change); setChange(document.querySelector('#period-rate'),rate,true);
  document.querySelector('#period-label').textContent={MAX:'全部資料','1M':'最近一個月','3M':'最近三個月','1Y':'最近一年',YTD:'今年以來'}[range];
  document.querySelector('#detail-start').textContent=money(start.value); document.querySelector('#detail-end').textContent=money(end.value);
  setChange(document.querySelector('#detail-change'),change);
  document.querySelector('#performance-range').textContent=`${dateText(start.date)}－${dateText(end.date)}`;
}
function chartOptions(data,height=370){return{series:[{name:'資產價值',data:data.map(d=>[new Date(`${d.date}T00:00:00`).getTime(),d.value])}],chart:{type:'area',height,toolbar:{show:false},zoom:{enabled:true},fontFamily:'Inter, Noto Sans TC, sans-serif'},colors:['#3478f6'],stroke:{curve:'smooth',width:3},fill:{type:'gradient',gradient:{opacityFrom:.28,opacityTo:.02}},dataLabels:{enabled:false},grid:{borderColor:'#e8edf4'},xaxis:{type:'datetime',labels:{datetimeUTC:false,style:{colors:'#657087'}}},yaxis:{opposite:true,labels:{formatter:v=>`$${Math.round(v).toLocaleString('zh-TW')}`,style:{colors:'#657087'}}},tooltip:{x:{format:'yyyy/MM/dd'},y:{formatter:v=>money(v)}},noData:{text:'目前沒有資產資料'}}}
function renderCharts(){
  state.mainChart?.destroy(); state.detailChart?.destroy();
  state.mainChart=new ApexCharts(document.querySelector('#main-chart'),chartOptions(state.data,370)); state.mainChart.render();
  const detail=chartOptions(state.data,510); detail.chart.events={zoomed:(_,ctx)=>{const min=ctx.xaxis.min,max=ctx.xaxis.max,filtered=state.data.filter(d=>{const t=new Date(`${d.date}T00:00:00`).getTime();return t>=min&&t<=max});if(filtered.length>1){const first=filtered[0],last=filtered.at(-1);document.querySelector('#detail-start').textContent=money(first.value);document.querySelector('#detail-end').textContent=money(last.value);setChange(document.querySelector('#detail-change'),last.value-first.value)}}};
  state.detailChart=new ApexCharts(document.querySelector('#detail-chart'),detail); state.detailChart.render();
}
async function loadData(force=false){
  document.querySelector('#error-banner').classList.add('hidden');
  try{
    const response=await fetch(`/api/portfolio${force?'?force=true':''}`); const payload=await response.json();
    if(!response.ok)throw new Error(payload.detail||'目前無法取得資料。');
    state.data=payload.data; document.querySelector('#current-value').textContent=money(payload.latest_value);
    document.querySelector('#last-updated').textContent=dateText(payload.last_date); document.querySelector('#record-count').textContent=`${payload.count} 筆資料`;
    document.querySelector('#sidebar-sync').textContent=`更新至 ${dateText(payload.last_date)}`; document.querySelector('#status-date').textContent=dateText(payload.last_date);document.querySelector('#status-count').textContent=`${payload.count} 筆`;
    document.querySelector('#preview-date').textContent=dateText(payload.last_date);document.querySelector('#preview-value').textContent=money(payload.latest_value);
    const latestChange=payload.data.length>1?payload.data.at(-1).value-payload.data.at(-2).value:0;setChange(document.querySelector('#preview-change'),latestChange);
    document.querySelector('#start-date').value=payload.first_date;document.querySelector('#start-date').min=payload.first_date;document.querySelector('#start-date').max=payload.last_date;
    document.querySelector('#end-date').value=payload.last_date;document.querySelector('#end-date').min=payload.first_date;document.querySelector('#end-date').max=payload.last_date;
    renderCharts();updatePeriod();
  }catch(error){document.querySelector('#error-message').textContent=error.message;document.querySelector('#error-banner').classList.remove('hidden');}
  finally{const loading=document.querySelector('#loading');loading.style.opacity='0';setTimeout(()=>loading.classList.add('hidden'),300)}
}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
  const view=button.dataset.view;document.querySelectorAll('[data-view]').forEach(item=>item.classList.toggle('active',item.dataset.view===view));document.querySelectorAll('.view').forEach(item=>item.classList.remove('active'));document.querySelector(`#view-${view}`).classList.add('active');
  const titles={overview:['資產總覽','掌握每一次資產變化'],performance:['資產走勢','查看不同期間的資產紀錄'],video:['影片製作','將資產歷程製作成直式影片'],status:['資料狀態','確認試算表同步情況']};document.querySelector('#page-eyebrow').textContent=titles[view][0];document.querySelector('#page-title').textContent=titles[view][1];
}));
document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>{state.range=button.dataset.range;document.querySelectorAll('[data-range]').forEach(item=>item.classList.toggle('active',item===button));const data=visibleData(state.range);state.mainChart.updateSeries([{name:'資產價值',data:data.map(d=>[new Date(`${d.date}T00:00:00`).getTime(),d.value])}]);updatePeriod()}));
document.querySelector('#video-range').addEventListener('change',event=>document.querySelector('#custom-dates').classList.toggle('hidden',event.target.value!=='CUSTOM'));
document.querySelector('#refresh-button').addEventListener('click',()=>loadData(true));document.querySelector('#retry-button').addEventListener('click',()=>loadData(true));
document.querySelector('#video-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=document.querySelector('#generate-button'),progress=document.querySelector('#job-progress');button.disabled=true;button.textContent='正在產生影片';progress.classList.remove('hidden');
  const payload={date_range:document.querySelector('#video-range').value,start_date:document.querySelector('#start-date').value||null,end_date:document.querySelector('#end-date').value||null,fps:Number(document.querySelector('#fps').value),hold_seconds:Number(document.querySelector('#hold-seconds').value),resolution:document.querySelector('#resolution').value,theme:document.querySelector('#theme').value};
  try{const response=await fetch('/api/videos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),data=await response.json();if(!response.ok)throw new Error(data.detail||'無法建立影片任務。');pollJob(data.job_id)}catch(error){showJobError(error.message);button.disabled=false;button.textContent='產生影片'}
});
async function pollJob(jobId){
  const response=await fetch(`/api/videos/${jobId}`),job=await response.json();if(!response.ok||job.status==='failed'){showJobError(job.message||job.detail||'影片產生失敗。');return}
  document.querySelector('#progress-message').textContent=job.message;document.querySelector('#progress-number').textContent=`${job.progress}%`;document.querySelector('#progress-bar').style.width=`${job.progress}%`;
  if(job.status==='completed'){const url=`/api/videos/${jobId}/download`,player=document.querySelector('#video-player'),download=document.querySelector('#download-button');player.src=url;player.classList.remove('hidden');document.querySelector('#preview-placeholder').classList.add('hidden');download.href=url;download.classList.remove('hidden');document.querySelector('#generate-button').disabled=false;document.querySelector('#generate-button').textContent='重新產生';return}setTimeout(()=>pollJob(jobId),1200)
}
function showJobError(message){document.querySelector('#progress-message').textContent=message;document.querySelector('#progress-number').textContent='失敗';document.querySelector('#progress-bar').style.width='0';document.querySelector('#generate-button').disabled=false;document.querySelector('#generate-button').textContent='重新產生'}
loadData();
