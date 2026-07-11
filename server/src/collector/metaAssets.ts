import { prisma } from "../db.js";
import { makeFingerprint, normalizeName } from "./dedupe.js";
import { downloadImageToLocal, isLocalImageUrl } from "../localImages.js";
import type { DoubanImage, DoubanMeta, DoubanPerson } from "./douban.js";

function names(list: DoubanPerson[]) {
  return list.map((p) => p.name).filter(Boolean).join(",");
}

async function upsertPerson(person: DoubanPerson) {
  return prisma.person.upsert({
    where: { name: person.name },
    create: {
      name: person.name,
      doubanId: person.doubanId || "",
      avatar: person.avatar || "",
    },
    update: {
      doubanId: person.doubanId || undefined,
      avatar: person.avatar || undefined,
    },
  });
}

async function upsertVodPerson(vodId: number, person: DoubanPerson, role: "actor" | "director", sort: number) {
  const p = await upsertPerson(person);
  await prisma.vodPerson.upsert({
    where: { vodId_personId_role: { vodId, personId: p.id, role } },
    create: { vodId, personId: p.id, role, character: person.character || "", sort },
    update: { character: person.character || "", sort },
  });
}

function bestHero(images: DoubanImage[]) {
  return [...images]
    .filter((img) => img.type !== "poster")
    .sort((a, b) => b.score - a.score)[0]?.url || "";
}

export async function localizeMetaImages(meta: DoubanMeta) {
  const cache = new Map<string, string>();
  async function localize(url = "") {
    const raw = String(url || "").trim();
    if (!raw || isLocalImageUrl(raw)) return raw;
    if (cache.has(raw)) return cache.get(raw) || raw;
    const local = await downloadImageToLocal(raw, { encrypt: true, timeoutMs: 15000 }).catch(() => "");
    const next = local || raw;
    cache.set(raw, next);
    return next;
  }
  if (meta.pic) meta.pic = await localize(meta.pic);
  for (const img of meta.images || []) img.url = await localize(img.url);
  return meta;
}

async function applyDoubanAliases(vodId: number, meta: DoubanMeta) {
  const vod = await prisma.vod.findUnique({ where: { id: vodId }, select: { name: true, year: true, fingerprint: true } });
  if (!vod) return;
  const primary = normalizeName(vod.name);
  const rows = [...new Set([meta.title, ...(meta.aliases || [])].map((name) => String(name || "").trim()).filter(Boolean))]
    .filter((name) => normalizeName(name) && normalizeName(name) !== primary)
    .map((name) => ({ name, fingerprint: makeFingerprint(name, meta.year || vod.year) }))
    .filter((alias) => alias.fingerprint && alias.fingerprint !== vod.fingerprint);
  if (!rows.length) return;
  const existing = await prisma.vodAlias.findMany({
    where: { fingerprint: { in: rows.map((row) => row.fingerprint) } },
    select: { fingerprint: true, note: true },
  });
  const existingNotes = new Map(existing.map((alias) => [alias.fingerprint, String(alias.note || "").trim()]));
  for (const row of rows) {
    const note = existingNotes.get(row.fingerprint) || row.name;
    await prisma.vodAlias.upsert({
      where: { fingerprint: row.fingerprint },
      create: { vodId, fingerprint: row.fingerprint, note },
      update: { vodId, ...(note ? { note } : {}) },
    });
  }
}

export async function applyDoubanAssets(vodId: number, meta: DoubanMeta) {
  const directors = meta.directors.slice(0, 12);
  const actors = meta.actors.slice(0, 24);
  await applyDoubanAliases(vodId, meta);
  for (let i = 0; i < directors.length; i++) await upsertVodPerson(vodId, directors[i], "director", i);
  for (let i = 0; i < actors.length; i++) await upsertVodPerson(vodId, actors[i], "actor", i);

  for (const img of meta.images) {
    await prisma.vodImage.upsert({
      where: { vodId_url: { vodId, url: img.url } },
      create: {
        vodId,
        url: img.url,
        type: img.type,
        source: meta.source || "douban",
        width: img.width,
        height: img.height,
        score: img.score,
        isHero: img.url === bestHero(meta.images),
      },
      update: {
        type: img.type,
        source: meta.source || "douban",
        width: img.width,
        height: img.height,
        score: img.score,
        isHero: img.url === bestHero(meta.images),
      },
    });
  }

  const vod = await prisma.vod.findUnique({ where: { id: vodId }, select: { actor: true, director: true, heroPic: true } });
  const data: Record<string, string> = {};
  const actorText = names(actors);
  const directorText = names(directors);
  const heroPic = bestHero(meta.images);
  if (actorText && !vod?.actor) data.actor = actorText;
  if (directorText && !vod?.director) data.director = directorText;
  if (heroPic && !vod?.heroPic) data.heroPic = heroPic;
  if (Object.keys(data).length) await prisma.vod.update({ where: { id: vodId }, data });
}
