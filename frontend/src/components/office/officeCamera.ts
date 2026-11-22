type OfficeFocusLayout = {
  desks: Record<string, [number, number, number]>;
  stations: Record<string, [number, number, number]>;
};

export function getOfficeFocusTarget(
  layout: OfficeFocusLayout,
  agentId: string | null,
  moduleId: string | null,
): [number, number, number] | null {
  if (agentId) return layout.desks[agentId] ?? null;
  if (moduleId) return layout.stations[moduleId] ?? null;
  return null;
}
