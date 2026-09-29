export async function testStaff(db,as,assert){
 const staff='44444444-4444-4444-8444-444444444444';
 const applicant='55555555-5555-4555-8555-555555555555';
 const outsider='66666666-6666-4666-8666-666666666666';
 await db.exec(`RESET ROLE; INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${staff}','staff@example.test',now()),('${applicant}','apply@example.test',now()),('${outsider}','outsider@example.test',now()); INSERT INTO public.user_roles(user_id,role) VALUES('${staff}','moderator'); UPDATE public.profiles SET name='Applicant',phone='+77001112233' WHERE id='${applicant}';`);
 assert((await as(staff,'SELECT is_staff() ok,is_admin() admin')).rows[0].ok===true,'moderator is staff');
 assert((await as(staff,'SELECT is_admin() admin')).rows[0].admin===false,'moderator is not admin');
 const app=(await as(applicant,"INSERT INTO manager_applications(user_id,requested_role) VALUES($1,'sports_manager') RETURNING id",[applicant])).rows[0].id;
 await as(staff,'SELECT staff_review_application($1,true,$2)',[app,'Approved']);
 await db.exec('RESET ROLE');assert((await db.query("SELECT count(*)::int n FROM user_roles WHERE user_id=$1 AND role='sports_manager'",[applicant])).rows[0].n===1,'staff approval grants only requested host role');
 assert((await as(staff,'SELECT * FROM admin_audit_log')).rows.length===0,'moderator cannot read audit');
 await db.exec('RESET ROLE');assert((await db.query("SELECT count(*)::int n FROM admin_audit_log WHERE actor_id=$1 AND actor_role='moderator'",[staff])).rows[0].n>0,'moderator mutations audit actor role');
 async function deny(fn,label){try{await fn();throw Error('unexpected success');}catch(e){if(e.message==='unexpected success')throw e;assert(true,label);}}
 await deny(()=>as(staff,"INSERT INTO user_roles(user_id,role) VALUES($1,'admin')",[staff]),'moderator cannot grant admin');
 await deny(()=>as(staff,"INSERT INTO site_settings(key,value) VALUES('staff_test','{}')"),'moderator cannot change platform settings');
 const updated=await as(staff,"UPDATE profiles SET account_status='banned' WHERE id=$1 RETURNING id",[applicant]);assert(updated.rows.length===0,'moderator cannot ban applicant');
 const aid=(await as('33333333-3333-4333-8333-333333333333',"SELECT id FROM activities LIMIT 1")).rows[0].id;
 await deny(()=>as(staff,'UPDATE activities SET commission_percent=40 WHERE id=$1',[aid]),'moderator cannot change commission');
 await deny(()=>as(outsider,"SELECT staff_analytics(now()-interval '7 days',now())"),'ordinary user cannot read analytics');
 const payload={visitor_id:staff,session_id:applicant,event:'page_view',path:'/',source:'telegram',device:'mobile'};
 await db.exec('RESET ROLE;SET ROLE anon;');await db.query('SELECT track_event($1)',[JSON.stringify(payload)]);await db.query('SELECT track_event($1)',[JSON.stringify(payload)]);
 await db.exec('RESET ROLE');assert((await db.query('SELECT count(*)::int n FROM analytics_events WHERE session_id=$1',[applicant])).rows[0].n===1,'analytics duplicates are idempotent');
 const metrics=(await as(staff,"SELECT staff_analytics(now()-interval '7 days',now()+interval '1 second') data")).rows[0].data;
 assert(metrics.traffic.visits===1&&metrics.traffic.mobile===1,'analytics source and device aggregate');
 assert(metrics.accounts.total>=3&&metrics.daily.length>=7,'analytics uses real accounts and date buckets');
 console.log('STAFF AND ANALYTICS CHECKS PASSED');
}
