import { z } from 'zod';

export const diagnosticContactSchema = z.object({
  at: z.number().nonnegative(),
  actorId: z.string(),
  surface: z.string(),
  kind: z.enum(['boot', 'limb', 'torso']),
  intended: z.boolean(),
});
/** A separation certificate comes from actual canonical geometry at an engine
 * sample. Without one, keep contacts together conservatively; timestamps alone
 * cannot prove separate sporting encounters. This observer never feeds physics. */
export const classifyContactEpisodes = (contacts, separations = [], jointResponses = []) => {
  const ordered = z
    .array(diagnosticContactSchema)
    .parse(contacts)
    .sort((a, b) => a.at - b.at);
  const clear = z
    .array(z.number().nonnegative())
    .parse(separations)
    .sort((a, b) => a - b);
  const episodes = [];
  let index = 0;
  for (const c of ordered) {
    const previous = episodes.at(-1)?.at(-1);
    while (index < clear.length && previous && clear[index] <= previous.at) index++;
    if (!previous || (index < clear.length && clear[index] < c.at)) episodes.push([]);
    episodes.at(-1).push(c);
  }
  const rows = episodes.map((events) => {
    const surfaces = new Set(events.map((c) => `${c.actorId}:${c.surface}`));
    const simultaneous = events.some((c, i) =>
      events
        .slice(0, i)
        .some(
          (p) =>
            Math.abs(p.at - c.at) < 1e-9 &&
            `${p.actorId}:${p.surface}` !== `${c.actorId}:${c.surface}`,
        ),
    );
    const aba = events.some(
      (c, i) =>
        i > 1 &&
        c.kind === 'limb' &&
        events[i - 2].kind === 'limb' &&
        c.actorId === events[i - 2].actorId &&
        c.surface === events[i - 2].surface &&
        (c.actorId !== events[i - 1].actorId || c.surface !== events[i - 1].surface),
    );
    return {
      beganAt: events[0].at,
      endedAt: events.at(-1).at,
      solverEvents: events.length,
      surfaces: surfaces.size,
      repeated: events.length > surfaces.size,
      adjacentSurfaces: surfaces.size > 1,
      simultaneous:
        simultaneous ||
        jointResponses.some((at) => at >= events[0].at - 1e-9 && at <= events.at(-1).at + 1e-9),
      intended: events.some((c) => c.intended),
      incidental: events.some((c) => !c.intended),
      solverRepetitionCandidate: aba,
    };
  });
  return {
    rule: 'canonical-clearance-certified-v1',
    solverEvents: ordered.length,
    observedEpisodes: rows.length,
    independentEncounters: Math.max(0, rows.length - 1),
    repeatedEpisodes: rows.filter((r) => r.repeated).length,
    adjacentSurfaceEpisodes: rows.filter((r) => r.adjacentSurfaces).length,
    simultaneousEpisodes: rows.filter((r) => r.simultaneous).length,
    intendedEpisodes: rows.filter((r) => r.intended).length,
    incidentalEpisodes: rows.filter((r) => r.incidental).length,
    solverRepetitionCandidates: rows.filter((r) => r.solverRepetitionCandidate).length,
    jointResponses: jointResponses.length,
    episodes: rows,
  };
};
