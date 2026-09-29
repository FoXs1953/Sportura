export async function testSportsRelease(db,as,assert){
 const host='33333333-3333-4333-8333-333333333333',u='11111111-1111-4111-8111-111111111111',v='22222222-2222-4222-8222-222222222222',w='66666666-6666-4666-8666-666666666666';
 const rpc=async(user,action,payload={})=>(await as(user,'SELECT event_workspace($1,$2) data',[action,JSON.stringify(payload)])).rows[0].data;
 async function deny(fn,label){let failed=false;try{await fn()}catch{failed=true}assert(failed,label)}
 const draft={title:'Спортивный выпуск',type:'daily_game',sport:'Футбол',city:'Астана',location_text:'Стадион',date_time:new Date(Date.now()+86400000).toISOString(),duration_minutes:90,entry_fee:0,max_participants:2,participation_mode:'individual'};
 await deny(()=>rpc(host,'document',{kind:'draft',name:'Paid',data:{...draft,entry_fee:1000}}),'paid draft blocked');
 await deny(()=>rpc(host,'document',{kind:'draft',name:'Esport',data:{...draft,sport:'CS2'}}),'esport draft blocked');
 const doc=await rpc(host,'document',{kind:'draft',name:draft.title,data:draft}),event=await rpc(host,'publish',{id:doc.id}),aid=event.id;
 assert((await as(u,'SELECT * FROM disciplines')).rows.every(x=>x.kind==='sport'),'catalog is sports-only');
 const join=user=>rpc(user,'join',{activity_id:aid,accepted_terms:true});
 const one=await join(u);await join(v);
 await deny(()=>rpc(w,'waitlist_join',{activity_id:aid}),'waiting requires terms');
 await rpc(w,'waitlist_join',{activity_id:aid,accepted_terms:true});await rpc(w,'waitlist_join',{activity_id:aid,accepted_terms:true});
 assert((await rpc(w,'player')).waitlist.filter(x=>x.activity_id===aid).length===1,'waitlist is idempotent');
 assert((await rpc(host,'host')).waitlist.some(x=>x.activity_id===aid),'host sees queue');
 assert((await as(u,'SELECT * FROM event_waitlist WHERE activity_id=$1',[aid])).rows.length===0,'other participant cannot read queue');
 await rpc(u,'cancel',{registration_id:one.id,reason:'Планы изменились'});
 assert((await as(w,"SELECT * FROM profile_notifications WHERE user_id=$1 AND title='Освободилось место'",[w])).rows.length>0,'first waiter notified');
 await deny(()=>join(u),'queue cannot be bypassed');
 await join(w);assert(!(await rpc(w,'player')).waitlist.some(x=>x.activity_id===aid),'claim clears waitlist');
 await deny(()=>rpc(host,'payment',{registration_id:one.id,status:'paid'}),'payment RPC disabled');
 await deny(()=>as(host,"SELECT staff_payment($1,true,'test')",[one.id]),'staff payment disabled');
 await deny(()=>as(host,"UPDATE registrations SET payment_reference='test' WHERE id=$1",[one.id]),'direct payment changes blocked');
 await deny(()=>as(host,"UPDATE activities SET entry_fee=100,is_free=false WHERE id=$1",[aid]),'direct paid event blocked');
 await deny(()=>as(host,"UPDATE profiles SET kaspi_payment_link='https://pay.kaspi.kz/pay/test' WHERE id=$1",[host]),'payment details blocked');
 await deny(()=>as(host,"SELECT event_competition('payout',jsonb_build_object('activity_id',$1::text))",[aid]),'payout disabled');
 await deny(()=>rpc(host,'close_checkin',{activity_id:aid}),'early closing blocked');
 await as(host,"UPDATE activities SET date_time=now()-interval '10 minutes' WHERE id=$1",[aid]);await rpc(w,'checkin',{activity_id:aid});
 await as(host,"UPDATE activities SET date_time=now()-interval '40 minutes' WHERE id=$1",[aid]);
 await deny(()=>rpc(w,'close_checkin',{activity_id:aid}),'participant cannot close check-in');
 await rpc(host,'close_checkin',{activity_id:aid});
 const rows=(await as(host,'SELECT user_id,status FROM registrations WHERE activity_id=$1',[aid])).rows;
 assert(rows.find(x=>x.user_id===v).status==='no_show','missing check-in marked absent');assert(rows.find(x=>x.user_id===w).status==='registered','checked-in participant preserved');
 // Cancelled queue entries can always be left, even after registration closes.
 const d2=await rpc(host,'document',{kind:'draft',name:'Queue leave',data:{...draft,title:'Queue leave'}}),a2=(await rpc(host,'publish',{id:d2.id})).id;
 for(const user of [u,v])await rpc(user,'join',{activity_id:a2,accepted_terms:true});await rpc(w,'waitlist_join',{activity_id:a2,accepted_terms:true});await rpc(host,'event_status',{activity_id:a2,status:'cancelled',reason:'Событие отменено'});await rpc(w,'waitlist_leave',{activity_id:a2});
 assert(!(await rpc(w,'player')).waitlist.some(x=>x.activity_id===a2),'can leave queue for cancelled event');
 console.log('SPORTS RELEASE / WAITLIST CHECKS PASSED');
}
