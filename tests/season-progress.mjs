export async function testProgress(db, as, assert) {
  const u = "99000000-0000-4000-8000-000000000001";
  let p = (await as(u, "SELECT player_progress($1) p", [u])).rows[0].p;
  assert(p.ratings.length === 0, "Unfinished dispute window gives no Elo");
  await db.exec("RESET ROLE");
  await db.query(
    "UPDATE activities SET dispute_window_ends_at=now()-interval '1 second' WHERE title LIKE 'Формат %'",
  );
  p = (await as(u, "SELECT player_progress($1) p", [u])).rows[0].p;
  assert(
    p.ratings.length === 1 && p.ratings[0].matches > 0,
    "Finalized matches produce discipline rating",
  );
  const rating = p.ratings[0].rating;
  const again = (await as(u, "SELECT player_progress($1) p", [u])).rows[0].p;
  assert(
    again.ratings[0].rating === rating,
    "Repeated reads do not duplicate Elo",
  );
  await as(
    u,
    'SELECT profile_workspace(\'privacy\',\'{"stats":false,"bio":true,"sports":true}\')',
  );
  const other = "99000000-0000-4000-8000-000000000002";
  assert(
    (await as(other, "SELECT player_progress($1) p", [u])).rows[0].p === null,
    "Private sports stats hidden from other users",
  );
  assert(
    (await as(u, "SELECT player_progress($1) p", [u])).rows[0].p.ratings
      .length === 1,
    "Owner can read hidden sports stats",
  );
  assert(
    (await as(other, "SELECT public_player_profile($1) p", [u])).rows[0].p
      .progress === null,
    "Public profile obeys sports stats privacy",
  );
  await db.exec("RESET ROLE");
  await db.query(
    "UPDATE activities SET is_private=true WHERE title LIKE 'Формат %'",
  );
  assert(
    (await as(u, "SELECT player_progress($1) p", [u])).rows[0].p.ratings
      .length === 0,
    "Private competitions do not leak through public ratings",
  );
}
