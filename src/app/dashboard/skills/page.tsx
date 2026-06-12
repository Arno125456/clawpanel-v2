export const dynamic = 'force-dynamic';

import { loadSkillsAsync, loadSkillsFromCliAsync } from '@/lib/skills';
import SkillsClient from './SkillsClient';

export default async function SkillsPage() {
  // Use the same source as /api/skills (OpenClaw CLI), so the server-rendered
  // initial state matches the client and isn't briefly empty.
  const skills = (await loadSkillsFromCliAsync()) ?? (await loadSkillsAsync());

  return <SkillsClient initialSkills={skills} />;
}
