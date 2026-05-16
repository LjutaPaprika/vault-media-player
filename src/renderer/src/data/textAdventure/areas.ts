import type { Area, AreaId } from './types'

export const AREAS: Record<AreaId, Area> = {
  sunken_path:    { id: 'sunken_path',    name: 'Sunken Path',      tierRange: [1, 1], description: 'A buried road through ancient forest.' },
  surface_ruins:  { id: 'surface_ruins',  name: 'Surface Ruins',    tierRange: [1, 2], description: 'The wreckage of an outer keep, picked over by bandits.' },
  quartzlight:    { id: 'quartzlight',    name: 'Quartzlight Outpost', tierRange: [0, 0], description: 'A free outpost above the ruins. Rest, trade, regroup.' },
  library_wing:   { id: 'library_wing',   name: 'Library Wing',     tierRange: [2, 2], description: 'Crumbling stacks of an arcanist order.' },
  crypts:         { id: 'crypts',         name: 'The Crypts',       tierRange: [2, 3], description: 'Cold dark home of the long-dead.' },
  catacombs:      { id: 'catacombs',      name: 'Catacombs',        tierRange: [3, 3], description: 'Tighter passages, older bones.' },
  deepcaves:      { id: 'deepcaves',      name: 'Deepcaves',        tierRange: [3, 4], description: 'Open dark, lit by spores.' },
  forge_hold:     { id: 'forge_hold',     name: 'Forge Hold',       tierRange: [4, 4], description: 'Dwarven forges, smoke long cold.' },
  vault_complex:  { id: 'vault_complex',  name: 'Vault Complex',    tierRange: [4, 5], description: 'A treasury sealed against an apocalypse.' },
  throne_quarter: { id: 'throne_quarter', name: 'Throne Quarter',   tierRange: [5, 5], description: 'The Lich keeps court here.' },
  hidden_sanctum: { id: 'hidden_sanctum', name: 'Hidden Sanctum',   tierRange: [6, 6], description: 'Postgame depth. Beware.' }
}
