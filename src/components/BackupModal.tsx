import type { AmbientSoundSettings, AppState, Language, NoorDialect } from '../types/tracker';
import { SettingsModal } from './SettingsModal';

interface BackupModalProps {
  lang: Language;
  state: AppState;
  onClose: () => void;
  onImport: (restored: AppState) => void;
  onToggleReminder: () => void;
  onChangeDialect: (dialect: NoorDialect) => void;
  onChangeAmbientSound?: (next: AmbientSoundSettings) => void;
  onReplayTour: () => void;
}

export function BackupModal({
  onChangeAmbientSound,
  ...rest
}: BackupModalProps) {
  return (
    <SettingsModal
      {...rest}
      onChangeAmbientSound={onChangeAmbientSound ?? (() => {})}
    />
  );
}
