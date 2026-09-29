export async function testCatalog(db,as,assert){
 const host='33333333-3333-4333-8333-333333333333',users=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444'];
 const rpc=async(user,action,payload={})=>(await as(user,'SELECT event_workspace($1,$2) data',[action,JSON.stringify(payload)])).rows[0].data;
 const comp=async(action,payload)=>(await as(host,'SELECT event_competition($1,$2) data',[action,JSON.stringify(payload)])).rows[0].data;
 async function deny(fn,label){try{await fn();throw Error('unexpected success');}catch(e){if(e.message==='unexpected success')throw e;assert(true,label);}}
 const draft={title:'CS2 Spark test',type:'tournament',tier:'spark',competition_format:'round_robin',sport:'CS2',city:'Астана',location_text:'Онлайн',date_time:new Date(Date.now()+86400000).toISOString(),duration_minutes:180,entry_fee:0,max_participants:4,min_participants:3,participation_mode:'team',team_min:1,team_max:2,prize_pool:{1:60,2:30,3:10},match_settings:{series:'BO3',region:'Astana',maps:'Test pool',anticheat:'FACEIT'}};
 const doc=await rpc(host,'document',{kind:'draft',data:draft,name:draft.title});const event=await rpc(host,'publish',{id:doc.id});const aid=event.id;
 assert((await as(host,'SELECT competition_format,tier,match_settings FROM activities WHERE id=$1',[aid])).rows[0].match_settings.series==='BO3','discipline settings persist');
 await deny(()=>rpc(users[0],'join',{activity_id:aid,accepted_terms:true,team_name:'One',team_members:['One']}),'esport requires captain nickname');
 await deny(()=>rpc(users[0],'join',{activity_id:aid,accepted_terms:true,game_nickname:'One',team_name:'One',team_members:['One','one']}),'duplicate roster names rejected');
 const ids=[];for(let i=0;i<users.length;i++){ids.push((await rpc(users[i],'join',{activity_id:aid,accepted_terms:true,game_nickname:'Player'+i,team_name:'Team'+i,team_members:['Player'+i]})).id);}
 assert((await as(users[0],'SELECT * FROM teams WHERE registration_id=$1',[ids[0]])).rows.length===1,'team persisted and visible to captain');
 assert((await as(users[1],'SELECT * FROM teams WHERE registration_id=$1',[ids[0]])).rows.length===0,'other captain cannot read roster');
 await deny(()=>rpc(users[0],'checkin',{activity_id:aid}),'early check-in blocked');
 await as(host,"UPDATE activities SET date_time=now()+interval '10 minutes' WHERE id=$1",[aid]);await rpc(users[0],'checkin',{activity_id:aid});
 assert((await as(users[0],'SELECT checked_in_at FROM registrations WHERE id=$1',[ids[0]])).rows[0].checked_in_at,'check-in saved in valid window');
 await comp('generate',{activity_id:aid});let matches=(await as(host,'SELECT * FROM event_matches WHERE activity_id=$1 ORDER BY position',[aid])).rows;
 assert(matches.length===3,'round robin tournament generates all pairs');
 await deny(()=>as(users[0],"UPDATE registrations SET team_members='[\"Changed\"]' WHERE id=$1",[ids[0]]),'roster locked after draw');
 for(const m of matches){const home=ids.indexOf(m.home_id),away=ids.indexOf(m.away_id);await comp('match',{activity_id:aid,id:m.id,home_score:home<away?2:0,away_score:home<away?0:2});}
 await as(host,"UPDATE activities SET date_time=now()-interval '1 hour' WHERE id=$1",[aid]);
 await deny(()=>comp('publish_results',{activity_id:aid,reason:'По регламенту',placements:{2:ids[0],3:ids[2]}}),'duplicate podium rejected atomically');
 await comp('publish_results',{activity_id:aid,reason:'Итоговая таблица',placements:{2:ids[1],3:ids[2]}});
 const results=(await as(host,'SELECT * FROM results WHERE activity_id=$1',[aid])).rows;assert(results.length===3,'three prize places published');
 assert(results.every(r=>Number(r.prize_amount)===0),'free tournament does not invent prize money');
 console.log('CATALOG AND TOURNAMENT CHECKS PASSED');
}
