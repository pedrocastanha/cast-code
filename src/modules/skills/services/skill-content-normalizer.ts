const LEGACY_SKILL_BRAND_LOWER = ['her', 'mes'].join('');
const LEGACY_SKILL_BRAND_TITLE = `${LEGACY_SKILL_BRAND_LOWER[0].toUpperCase()}${LEGACY_SKILL_BRAND_LOWER.slice(1)}`;
const LEGACY_SKILL_BRAND_UPPER = LEGACY_SKILL_BRAND_LOWER.toUpperCase();
const LEGACY_SKILL_AGENT_TITLE = `${LEGACY_SKILL_BRAND_TITLE} Agent`;
const LEGACY_SKILL_AGENT_COMPACT = `${LEGACY_SKILL_BRAND_TITLE}Agent`;
const LEGACY_SKILL_AGENT_SLUG = `${LEGACY_SKILL_BRAND_LOWER}-agent`;

export function normalizeSkillContentForCast(content: string): string {
  return content
    .replace(new RegExp(`${escapeRegExp(LEGACY_SKILL_AGENT_TITLE)}\\s+[\\u2014-]\\s+Implementation Notes`, 'gi'), 'Implementation Notes')
    .replace(new RegExp(escapeRegExp(LEGACY_SKILL_AGENT_TITLE), 'gi'), 'Cast')
    .replace(new RegExp(escapeRegExp(LEGACY_SKILL_AGENT_COMPACT), 'gi'), 'Cast')
    .replace(new RegExp(escapeRegExp(LEGACY_SKILL_AGENT_SLUG), 'gi'), 'cast-agent')
    .replace(new RegExp(`${LEGACY_SKILL_BRAND_UPPER}_HOME`, 'g'), 'CAST_HOME')
    .replace(new RegExp(`~\\/\\.${LEGACY_SKILL_BRAND_LOWER}`, 'gi'), '~/.cast')
    .replace(new RegExp(`\\.${LEGACY_SKILL_BRAND_LOWER}`, 'gi'), '.cast')
    .replace(new RegExp(LEGACY_SKILL_BRAND_UPPER, 'g'), 'CAST')
    .replace(new RegExp(LEGACY_SKILL_BRAND_TITLE, 'g'), 'Cast')
    .replace(new RegExp(LEGACY_SKILL_BRAND_LOWER, 'g'), 'cast');
}

export function normalizeSkillPublicText(value: string): string {
  return normalizeSkillContentForCast(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
