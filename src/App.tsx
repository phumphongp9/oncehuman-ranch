import React, { useEffect, useMemo, useState } from "react";

// =============================================================
// Once Human Ranch Helper — Restored Full UI (v4.3.0)
// - OVERALL: badges + grouped lists + seed short label
// - RANCH: 1 row = 1 pair (fixed 3 pairs) with full Animal editor
// - Preserve scroll on edits
// - Debounced autosave + Backup list/restore
// - Uses existing STORAGE_KEY to preserve user data
// =============================================================

type Trait = { name: string; rank: "I" | "II" | "III" };
export type Animal = {
  id: string;
  species: string;
  sex: "Male" | "Female" | "none";
  rank: "S" | "A" | "B" | "C" | "none";
  startTime?: string;
  lastBreedTime?: string;
  adult: boolean;
  breedInit: number;
  breedUsed: number;
  traits: Trait[];
};
export type Character = { id: string; name: string; animals: Animal[] };

const STORAGE_KEY = "oncehuman_ranch_helper_state";
const LAST_SAVED_KEY = "oncehuman_ranch_helper_last_saved";
const BACKUP_PREFIX = "oncehuman_ranch_helper_backup_";
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

// ---------------- Utils ----------------
function uid(p = "id_") { return p + Math.random().toString(36).slice(2, 11); }
function toMillis(iso?: string) { return iso ? new Date(iso).getTime() : 0; }
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function nowLocal() { return toLocalInput(new Date()); }
function fromNow(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}h ${m}m ${ss}s`;
}
function breedRemaining(a: Animal) { return Math.max(0, (a.breedInit || 0) - (a.breedUsed || 0)); }
function isOnCooldown(a: Animal) {
  if (!a.lastBreedTime) return false;
  if (breedRemaining(a) <= 0) return false;
  return Date.now() < toMillis(a.lastBreedTime) + COOLDOWN_MS;
}
function adulthoodRemaining(a: Animal) {
  if (!a.startTime) return 0;
  const end = toMillis(a.startTime) + COOLDOWN_MS; // to adult
  return Math.max(0, end - Date.now());
}
function preserveScroll<T>(cb: () => T): T {
  const x = window.scrollX, y = window.scrollY;
  const out = cb();
  requestAnimationFrame(() => window.scrollTo(x, y));
  return out;
}

// ---------------- Persistence ----------------
function tryParseCharacters(v: any): Character[] | null {
  try {
    const parsed = typeof v === "string" ? JSON.parse(v) : v;
    if (Array.isArray(parsed)) return parsed as Character[];
    if (parsed && Array.isArray(parsed.characters)) return parsed.characters as Character[];
    return null;
  } catch { return null; }
}
function loadState(): Character[] | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return tryParseCharacters(raw);
}
function saveStateOnly(data: Character[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  localStorage.setItem(LAST_SAVED_KEY, new Date().toISOString());
}
function createBackup(data: Character[]) {
  const ts = new Date().toISOString();
  localStorage.setItem(`${BACKUP_PREFIX}${ts}`, JSON.stringify(data));
}
function listBackups() {
  return Object.entries(localStorage)
    .filter(([k]) => k.startsWith(BACKUP_PREFIX))
    .map(([k, v]) => ({ key: k, ts: k.replace(BACKUP_PREFIX, ""), value: v as string }))
    .sort((a, b) => b.ts.localeCompare(a.ts));
}

// ---------------- Static ----------------
function speciesIcon(sp: string) {
  const s = sp.toLowerCase();
  if (s.includes("sheep")) return "🐑";
  if (s.includes("wolf")) return "🐺";
  if (s.includes("buffalo")) return "🐃";
  if (s.includes("rabbit")) return "🐇";
  if (s.includes("boar")) return "🐗";
  if (s.includes("deer")) return "🦌";
  if (s.includes("turtle")) return "🐢";
  if (s.includes("yak")) return "🐂";
  if (s.includes("goat")) return "🐐";
  if (s.includes("chicken")) return "🐔";
  if (s.includes("duck")) return "🦆";
  if (s.includes("turkey")) return "🦃";
  if (s.includes("horse")) return "🐴";
  if (s.includes("camel")) return "🐫";
  if (s.includes("donkey")) return "🐴";
  return "🐾";
}

const SEED_SET = new Set<string>([
  // Seed traits (ตามที่คุณยืนยันทั้งหมด)
  "Golden Sheep Bloodline","Grassland Seed","Forest Seed","Desert Seed","Beach Seed","Cave Seed","Coastal Bay Seed","Floating Ice Seed","Highland Seed","Jungle Seed","Mountain Seed","Mountain Range Seed","Polar Seed","Rock Wall Seed","Snowfield Seed","Tundra Seed","Valley Seed","Wasteland Seed","Dreamy Seed","Lunar Oracle","Starfall","Dreamzone",
]);
function firstSeedShort(a: Animal): string | null {
  const t = (a.traits || []).find((tr) => SEED_SET.has(tr.name));
  if (!t) return null;
  return t.name.split(" ")[0]; // Lunar Oracle -> Lunar, Golden Sheep Bloodline -> Golden
}

// ---------------- UI helpers ----------------
function StatusBadge({ a }: { a: Animal }) {
  const remain = breedRemaining(a);
  if (!a.adult)
    return <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs">ยังไม่โต ({fromNow(adulthoodRemaining(a))})</span>;
  if (remain <= 0)
    return <span className="px-2 py-1 rounded bg-rose-100 text-rose-700 text-xs">Breed หมด</span>;
  if (isOnCooldown(a))
    return <span className="px-2 py-1 rounded bg-sky-100 text-sky-700 text-xs">คูลดาวน์ {fromNow(Math.max(0, toMillis(a.lastBreedTime) + COOLDOWN_MS - Date.now()))}</span>;
  return <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs">พร้อมผสม</span>;
}

function TraitPill({ t }: { t: Trait }) {
  const isSeed = SEED_SET.has(t.name);
  const short = isSeed ? t.name.split(" ")[0] : t.name;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 border">
      {short}<span className="opacity-60">·{t.rank}</span>
    </span>
  );
}

function ensure6Animals(arr: Animal[] | undefined): Animal[] {
  const a = [...(arr || [])];
  while (a.length < 6)
    a.push({ id: uid("a_"), species: "none", sex: "none", rank: "none", adult: false, breedInit: 0, breedUsed: 0, traits: [] });
  return a.slice(0, 6);
}
function repAnimal(c: Character, idx: number, a: Animal): Character {
  const arr = ensure6Animals(c.animals);
  arr[idx] = a;
  return { ...c, animals: arr };
}

// ---------------- Traits Editor ----------------
function TraitsEditor({ traits, onChange }: { traits: Trait[]; onChange: (t: Trait[]) => void }) {
  const OPTIONS = [
    "High Yield","Rapid Production","Premium Output","Quality Meat",
    "Acidic Meat","Meaty","Dieting","Thick Hides","True Grit","Resilience","Ferocity","Stormchild","Vigor","Docile",
    "Golden Sheep Bloodline","Grassland Seed","Forest Seed","Desert Seed","Beach Seed","Cave Seed","Coastal Bay Seed","Floating Ice Seed","Highland Seed","Jungle Seed","Mountain Seed","Mountain Range Seed","Polar Seed","Rock Wall Seed","Snowfield Seed","Tundra Seed","Valley Seed","Wasteland Seed","Dreamy Seed","Lunar Oracle","Starfall","Dreamzone",
  ];
  const add = () => preserveScroll(() => onChange([...(traits || []), { name: OPTIONS[0], rank: "I" }]));
  const setT = (i: number, p: Partial<Trait>) => preserveScroll(() => onChange((traits || []).map((t, idx) => (idx === i ? { ...t, ...p } : t))));
  const del = (i: number) => preserveScroll(() => onChange((traits || []).filter((_, idx) => idx !== i)));
  return (
    <div className="border rounded-lg p-3 space-y-3 bg-slate-50">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Traits</div>
        <button className="px-2 py-1 rounded bg-slate-900 text-white text-xs" onClick={add}>+ Add</button>
      </div>
      {(traits || []).length === 0 && <div className="text-xs text-slate-500">ยังไม่มี traits</div>}
      {(traits || []).map((t, i) => (
        <div key={i} className="grid grid-cols-8 gap-2 items-center">
          <select className="col-span-5 border rounded-lg px-2 py-1 text-sm" value={t.name} onChange={(e) => setT(i, { name: e.target.value })}>
            {OPTIONS.map((o) => (<option key={o} value={o}>{o}</option>))}
          </select>
          <select className="col-span-2 border rounded-lg px-2 py-1 text-sm" value={t.rank} onChange={(e) => setT(i, { rank: e.target.value as Trait["rank"] })}>
            {["I","II","III"].map((r) => (<option key={r} value={r}>{r}</option>))}
          </select>
          <div className="col-span-1 text-right">
            <button className="px-2 py-1 rounded bg-rose-600 text-white text-xs" onClick={() => del(i)}>ลบ</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------- Animal Editor ----------------
function AnimalEditor({ a, onChange }: { a: Animal; onChange:(a:Animal)=>void }) {
  const set = (p: Partial<Animal>) => preserveScroll(() => onChange({ ...a, ...p }));
  const incBreed = (kind: "auto" | "manual") => preserveScroll(() => {
    const used = Math.min((a.breedUsed || 0) + 1, a.breedInit || 0);
    if (kind === "auto") {
      const next = a.lastBreedTime ? new Date(toMillis(a.lastBreedTime) + COOLDOWN_MS) : new Date();
      onChange({ ...a, lastBreedTime: toLocalInput(next), breedUsed: used });
    } else {
      onChange({ ...a, lastBreedTime: nowLocal(), breedUsed: used });
    }
  });
  const remaining = breedRemaining(a);
  const resetAnimal = () => preserveScroll(() => onChange({ id: uid("a_"), species: "none", sex: "none", rank: "none", adult: false, breedInit: 0, breedUsed: 0, traits: [] }));

  return (
    <div className="space-y-3 p-4 rounded-xl border bg-slate-50">
      <div className="flex items-center gap-3">
        <div className="text-2xl">{speciesIcon(a.species)}</div>
        <div className="font-semibold text-lg truncate">{a.species || "—"}</div>
        <StatusBadge a={a} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <select value={a.species || "none"} onChange={e=>set({species:e.target.value})} className="border rounded-lg px-2 py-2 text-sm">
          {["none","Sheep","Wolf","Wild Buffalo","Rabbit","Deer","Turtle","Boar","Yak","Goat","Chicken","Duck","Turkey","Horse","Camel","Donkey"].map(o=>(<option key={o} value={o}>{o}</option>))}
        </select>
        <select value={a.sex} onChange={e=>set({sex:e.target.value as any})} className="border rounded-lg px-2 py-2 text-sm">
          {(["none","Male","Female"] as const).map(o=>(<option key={o} value={o}>{o}</option>))}
        </select>
        <select value={a.rank} onChange={e=>set({rank:e.target.value as any})} className="border rounded-lg px-2 py-2 text-sm">
          {(["none","S","A","B","C"] as const).map(o=>(<option key={o} value={o}>{o}</option>))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="flex flex-col gap-1">Start
          <input type="datetime-local" className="border rounded-lg px-2 py-2" value={a.startTime||""} onChange={e=>set({startTime:e.target.value})}/>
        </label>
        <label className="flex flex-col gap-1">Last Breed
          <input type="datetime-local" className="border rounded-lg px-2 py-2" value={a.lastBreedTime||""} onChange={e=>set({lastBreedTime:e.target.value})}/>
        </label>
      </div>

      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!a.adult} onChange={(e)=>set({adult:e.target.checked})}/> โตเต็มวัยแล้ว
      </label>

      <div className="grid grid-cols-3 gap-3 items-end text-sm">
        <div>
          <div className="text-xs text-slate-600">ค่าเริ่มต้น</div>
          <input type="number" className="w-full border rounded-lg px-2 py-2" value={a.breedInit||0} onChange={e=>set({breedInit:Math.max(0, Number(e.target.value)||0)})}/>
        </div>
        <div>
          <div className="text-xs text-slate-600">ใช้ไป</div>
          <input type="number" className="w-full border rounded-lg px-2 py-2" value={a.breedUsed||0} onChange={e=>set({breedUsed:Math.max(0, Number(e.target.value)||0)})}/>
        </div>
        <div>
          <div className="text-xs text-slate-600">คงเหลือ</div>
          <div className={`text-sm ${remaining<=0?"text-rose-600":"text-slate-800"}`}>{remaining}</div>
        </div>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <button className="px-3 py-2 rounded-lg bg-sky-700 text-white text-sm" onClick={()=>incBreed("auto")} disabled={remaining<=0}>Auto Breeding</button>
        <button className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm" onClick={()=>incBreed("manual")} disabled={remaining<=0}>Manual Breeding</button>
        <button className="ml-auto px-3 py-2 rounded-lg bg-rose-600 text-white text-sm" onClick={resetAnimal}>Reset</button>
      </div>

      <div className="flex flex-wrap gap-1">{(a.traits||[]).map((t,i)=>(<TraitPill key={i} t={t}/>))}</div>
      <TraitsEditor traits={a.traits} onChange={(t)=>set({traits:t})}/>
    </div>
  );
}

// ---------------- Ranch (1 row = 1 pair) ----------------
function Ranch({ data, setData }: { data: Character[]; setData: React.Dispatch<React.SetStateAction<Character[]>> }) {
  const [idx, setIdx] = useState(0);
  const char = data[idx];
  if (!char) return <div>ไม่มีตัวละคร</div>;

  const animals = ensure6Animals(char.animals);
  const setChar = (up: (c: Character) => Character) => preserveScroll(() => setData(prev => prev.map((c,i)=>i===idx?up(c):c)));

  function Pair({ start }: { start: 0|2|4 }) {
    const s = start;
    const a1 = animals[s];
    const a2 = animals[s+1];
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-lg font-semibold">คู่ที่ {s/2+1}</div>
          <div className="ml-auto text-sm text-slate-500">{speciesIcon(a1.species)} {a1.species} · {speciesIcon(a2.species)} {a2.species}</div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AnimalEditor a={a1} onChange={(a)=>setChar(o=>repAnimal(o,s,a))}/>
          <AnimalEditor a={a2} onChange={(a)=>setChar(o=>repAnimal(o,s+1,a))}/>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {data.map((c,i)=>(
          <button key={c.id} onClick={()=>setIdx(i)} className={`px-3 py-1.5 rounded-full border ${i===idx?"bg-slate-900 text-white":"bg-white"}`}>{c.name}</button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">ชื่อตัวละคร:</span>
        <input className="border rounded px-3 py-2 text-base" value={char.name} onChange={(e)=>setChar(o=>({...o,name:e.target.value}))}/>
      </div>
      <div className="space-y-8">
        <Pair start={0}/>
        <Pair start={2}/>
        <Pair start={4}/>
      </div>
    </div>
  );
}

// ---------------- Overall (restored grouping UI) ----------------
function Overall({ data }: { data: Character[] }) {
  // tick per-second for countdowns
  const [, setTick] = useState(0);
  useEffect(()=>{ const t = setInterval(()=>setTick(x=>x+1), 1000); return ()=>clearInterval(t); },[]);

  const animals = useMemo(()=> data.flatMap(c => c.animals.map(a=>({ ...a, owner: c.name } as any))), [data]);
  const bySpecies = useMemo(() => {
    const map = new Map<string, Animal[]>();
    (animals as any[]).forEach((a)=>{ const k = a.species || "none"; if(!map.has(k)) map.set(k, []); (map.get(k) as Animal[]).push(a); });
    return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
  }, [animals]);

  const Badge = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${tone}`}>
      {label} <b className="ml-1">{value}</b>
    </span>
  );

  const RowCard = (a: any) => {
    const seed = firstSeedShort(a);
    const remain = breedRemaining(a);
    const right = !a.adult ? (
      <div className="text-[11px] text-amber-700">โตเต็มวัยใน {fromNow(adulthoodRemaining(a))}</div>
    ) : remain > 0 ? (
      isOnCooldown(a) ? (
        <div className="text-[11px] text-sky-700">พร้อมใน {fromNow(Math.max(0, toMillis(a.lastBreedTime) + COOLDOWN_MS - Date.now()))}</div>
      ) : (
        <div className="text-[11px] text-emerald-700">พร้อมแล้ว</div>
      )
    ) : <div className="text-[11px] text-rose-700">Breed หมด</div>;

    return (
      <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded border bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-lg">{speciesIcon(a.species)}</div>
          <div className="truncate">
            <div className="font-medium truncate">{a.owner ?? "—"}</div>
            <div className="text-[11px] text-slate-600 flex items-center gap-2">
              <span>Rank {a.rank}</span>
              {seed && (<span className="inline-flex items-center gap-1 px-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">{seed}</span>)}
            </div>
          </div>
        </div>
        {right}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {bySpecies.map(([species, list]) => {
        const nonAdults = list.filter((a) => !a.adult);
        const cooling = list.filter((a) => a.adult && breedRemaining(a) > 0 && isOnCooldown(a));
        const ready = list.filter((a) => a.adult && breedRemaining(a) > 0 && !isOnCooldown(a));
        const depleted = list.filter((a) => a.adult && breedRemaining(a) <= 0);
        return (
          <section key={species} className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
            <div className="px-4 py-3 border-b bg-gradient-to-r from-indigo-50 to-emerald-50">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{speciesIcon(species)}</div>
                <div className="font-semibold">{species}</div>
                <div className="flex flex-wrap items-center gap-2 ml-2">
                  <Badge label={`ทั้งหมด`} value={list.length} tone="bg-slate-50 text-slate-700 border-slate-200" />
                  <Badge label={`ยังไม่โต`} value={nonAdults.length} tone="bg-amber-50 text-amber-700 border-amber-200" />
                  <Badge label={`คูลดาวน์`} value={cooling.length} tone="bg-sky-50 text-sky-700 border-sky-200" />
                  <Badge label={`พร้อมผสม`} value={ready.length} tone="bg-emerald-50 text-emerald-700 border-emerald-200" />
                  <Badge label={`หมดสิทธิ์`} value={depleted.length} tone="bg-rose-50 text-rose-700 border-rose-200" />
                </div>
              </div>
            </div>
            <div className="p-3 space-y-3">
              <div className="grid lg:grid-cols-2 gap-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50/40">
                  <div className="px-3 py-2 text-amber-700 font-medium text-sm flex items-center gap-2">🪺 ยังไม่โตเต็มวัย</div>
                  <div className="p-3 space-y-2 min-h-[120px]">{nonAdults.length ? nonAdults.map(RowCard) : <div className="text-xs text-amber-700/80">ไม่มี</div>}</div>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50/40">
                  <div className="px-3 py-2 text-sky-700 font-medium text-sm flex items-center gap-2">⏳ คูลดาวน์</div>
                  <div className="p-3 space-y-2 min-h-[120px]">{cooling.length ? cooling.map(RowCard) : <div className="text-xs text-sky-700/80">ไม่มี</div>}</div>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40">
                <div className="px-3 py-2 text-emerald-700 font-medium text-sm flex items-center gap-2">✅ พร้อมผสมพันธุ์</div>
                <div className="p-3 space-y-2">{ready.length ? ready.map(RowCard) : <div className="text-xs text-emerald-700/80">ไม่มี</div>}</div>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50/40">
                <div className="px-3 py-2 text-rose-700 font-medium text-sm flex items-center gap-2">🚫 Breed หมด</div>
                <div className="p-3 space-y-2">{depleted.length ? depleted.map(RowCard) : <div className="text-xs text-rose-700/80">ไม่มี</div>}</div>
              </div>
            </div>
          </section>
        );
      })}
      {bySpecies.length === 0 && <div className="text-slate-500">ยังไม่มีข้อมูลสัตว์</div>}
    </div>
  );
}

// ---------------- Settings (Backup/Restore) ----------------
function Settings({ setData, data }: { data: Character[]; setData: React.Dispatch<React.SetStateAction<Character[]>> }) {
  const [backups, setBackups] = useState<{ key: string; ts: string; value: string }[]>([]);
  useEffect(() => { setBackups(listBackups()); }, []);

  const restore = (k: string) => {
    const raw = localStorage.getItem(k);
    if (!raw) return;
    const parsed = tryParseCharacters(raw);
    if (parsed) setData(parsed);
  };

  const doBackup = () => {
    try {
      createBackup(data);
      setBackups(listBackups());
      // also trigger download
      const pad = (n:number)=>String(n).padStart(2,"0");
      const dt=new Date();
      const fname=`ranch_backup_${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}_${pad(dt.getHours())}${pad(dt.getMinutes())}${pad(dt.getSeconds())}.json`;
      const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;a.download=fname;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    } catch(e){console.error(e);alert("Backup failed");}
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Backup & Restore</h2>

      <div className="flex items-center gap-2">
        <button className="px-3 py-2 rounded bg-slate-900 text-white text-sm" onClick={doBackup}>⬇️ Backup (บันทึก+ดาวน์โหลด)</button>
        <div className="text-xs text-slate-500">บันทึก snapshot ลงในเบราว์เซอร์ และดาวน์โหลดไฟล์ .json</div>
      </div>

      <div className="space-y-2">
        {backups.length === 0 && <div className="text-slate-500 text-sm">ยังไม่มี backup</div>}
        {backups.map((b) => (
          <div key={b.key} className="flex items-center gap-3 border rounded px-3 py-2">
            <div className="flex-1">
              <div className="font-mono text-xs">{b.ts}</div>
            </div>
            <button className="px-3 py-1 rounded bg-slate-900 text-white text-xs" onClick={() => restore(b.key)}>Restore</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- App ----------------
export default function App() {
  const [tab, setTab] = useState<"overall" | "ranch" | "settings">("ranch");
  const [data, setData] = useState<Character[]>(() =>
    loadState() ?? Array.from({ length: 10 }).map((_, i) => ({ id: `char_${i + 1}`, name: `Player ${i + 1}`, animals: [] as Animal[] }))
  );

  // Debounced autosave
  useEffect(() => { const h = setTimeout(() => saveStateOnly(data), 300); return () => clearTimeout(h); }, [data]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex gap-3 items-center">
          <div className="font-bold text-xl">Once Human Ranch Helper</div>
          <nav className="flex gap-2">
            {(["overall","ranch","settings"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded ${tab === t ? "bg-slate-900 text-white" : "bg-white border"}`}>{t}</button>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4">
        {tab === "overall" && <Overall data={data} />}
        {tab === "ranch" && <Ranch data={data} setData={setData} />}
        {tab === "settings" && <Settings data={data} setData={setData} />}
      </main>
    </div>
  );
}
