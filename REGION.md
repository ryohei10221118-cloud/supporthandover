# Why `vercel.json` pins a region

Vercel defaults new projects to Washington, D.C. (`iad1`). This Supabase
project is in Asia-Pacific, so every query the server made crossed the Pacific
and came back — roughly 200–250 ms each, before Postgres did any work.

Measured on production, same deployment, minutes apart:

| Request | Function execution | Supabase calls |
| --- | --- | --- |
| `/ho`, data cache miss | 3.14 s | ~10 |
| `/`, data cache hit | 326 ms | 1 |

The page is not doing too many queries — a cache hit proves the render itself
is fast. Each query was simply paying for a round trip to another continent,
and the visitors are in Hong Kong, so the response crossed the Pacific twice
more on the way back.

Pinning the region put the functions in Asia and halved it: `/ho` went from
3.14 s to 1.67 s, and the "Routed to Washington" line disappeared from the
logs. The first guess was Singapore; the project is actually in Tokyo
(`ap-northeast-1`), so `hnd1` is the match — and it happens to be close to the
Taipei office too.

## If the database moves

Check **Supabase → Project Settings → General → Region** and set the matching
Vercel region:

| Supabase region | Vercel region |
| --- | --- |
| `ap-southeast-1` Singapore | `sin1` |
| `ap-northeast-1` Tokyo | `hnd1` |
| `ap-northeast-2` Seoul | `icn1` |
| `ap-east-1` Hong Kong | `hkg1` |
| `ap-southeast-2` Sydney | `syd1` |
| `ap-south-1` Mumbai | `bom1` |

Matching the database matters more than being near the users: one page load
makes about ten database round trips and returns a single response, so the
distance to the database is paid ten times over and the distance to the user
only once.
