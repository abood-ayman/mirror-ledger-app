import {
  BookOpen,
  BookMarked,
  Briefcase,
  Dumbbell,
  Flame,
  Moon,
  Target,
} from 'lucide-react';
import type { ActionIconName } from '../types/tracker';

export function ActionIcon({
  icon,
  color,
  size = 20,
}: {
  icon: ActionIconName;
  color: string;
  size?: number;
}) {
  const props = { size, style: { color } };
  switch (icon) {
    case 'book':
      return <BookMarked {...props} />;
    case 'dumbbell':
      return <Dumbbell {...props} />;
    case 'bookOpen':
      return <BookOpen {...props} />;
    case 'briefcase':
      return <Briefcase {...props} />;
    case 'moon':
      return <Moon {...props} />;
    case 'flame':
      return <Flame {...props} />;
    default:
      return <Target {...props} />;
  }
}
