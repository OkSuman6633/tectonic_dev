export type StudioPreset = 'chat' | 'split' | 'office';

export interface StudioLayoutState {
  preset: StudioPreset;
  splitRatio: number;
  isMaximized: boolean;
}

export const PRESET_RATIOS: Record<StudioPreset, number> = {
  chat: 65,
  split: 50,
  office: 35,
};

/** Infers the matching layout preset from a numeric split ratio. */
export function presetFromRatio(ratio: number): StudioPreset {
  if (ratio > 55) return 'chat';
  if (ratio < 45) return 'office';
  return 'split';
}

/** Selects a preset in its default (minimized) split ratio: Chat 65/35, Split 50/50, 3D Office 35/65. */
export function selectStudioPreset(preset: StudioPreset): StudioLayoutState {
  return {
    preset,
    splitRatio: PRESET_RATIOS[preset],
    isMaximized: false,
  };
}

/**
 * Toggles maximize/minimize based on the active preset:
 * - `chat`: toggles between 65/35 (minimized) and 100/0 full Chat (maximized)
 * - `split`: always stays balanced 50/50
 * - `office`: toggles between 35/65 (minimized) and 0/100 full 3D Office (maximized)
 */
export function toggleStudioMaximize(state: StudioLayoutState): StudioLayoutState {
  if (state.preset === 'split') {
    return {
      preset: 'split',
      splitRatio: PRESET_RATIOS.split,
      isMaximized: false,
    };
  }
  return {
    preset: state.preset,
    splitRatio: PRESET_RATIOS[state.preset],
    isMaximized: !state.isMaximized,
  };
}

/** Returns exact left (Chat) and right (3D Office) CSS widths and visibility flags. */
export function computePanelDimensions(state: StudioLayoutState): {
  chatWidth: string;
  officeWidth: string;
  showChat: boolean;
  showOffice: boolean;
  showDivider: boolean;
} {
  if (state.isMaximized && state.preset === 'chat') {
    return {
      chatWidth: '100%',
      officeWidth: '0%',
      showChat: true,
      showOffice: false,
      showDivider: false,
    };
  }
  if (state.isMaximized && state.preset === 'office') {
    return {
      chatWidth: '0%',
      officeWidth: '100%',
      showChat: false,
      showOffice: true,
      showDivider: false,
    };
  }
  return {
    chatWidth: `${state.splitRatio}%`,
    officeWidth: `${100 - state.splitRatio}%`,
    showChat: true,
    showOffice: true,
    showDivider: true,
  };
}
