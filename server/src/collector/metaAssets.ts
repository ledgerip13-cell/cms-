import { prisma } from "../db.js";
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

export async function applyDoubanAssets(vodId: number, meta: DoubanMeta) {
  const directors = meta.directors.slice(0, 12);
  const actors = meta.actors.slice(0, 24);
  for (let i = 0; i < directors.length; i++) await upsertVodPerson(vodId, directors[i], "director", i);
  for (let i = 0; i < actors.length; i++) await upsertVodPerson(vodId, actors[i], "actor", i);

  for (const img of meta.images) {
    await prisma.vodImage.upsert({
      where: { vodId_url: { vodId, url: img.url } },
      create: {
        vodId,
        url: img.url,
        type: img.type,
        source: "douban",
        width: img.width,
        height: img.height,
        score: img.score,
        isHero: img.url === bestHero(meta.images),
      },
      update: {
        type: img.type,
        source: "douban",
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
