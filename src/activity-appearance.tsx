import { useId, type CSSProperties } from 'react';
import {
  BriefcaseBusiness,
  BookOpen,
  Dumbbell,
  Coffee,
  Headphones,
  Moon,
  Code2,
  Heart,
  Pencil,
  Bike,
  Leaf,
  Music,
  Circle,
  Square,
  Triangle,
  Diamond,
  Star,
  Sun,
  Home,
  Laptop,
  GraduationCap,
  Utensils,
  ShoppingBag,
  Car,
  TrainFront,
  Plane,
  Camera,
  Palette,
  Gamepad2,
  BedDouble,
  Flower2,
  Mountain,
  Dog,
  Baby,
  Users,
  CookingPot,
  Check,
} from 'lucide-react';
import { palette, iconNames, iconLabels, type Appearance } from './appearance';
const map = {
  BriefcaseBusiness,
  BookOpen,
  Dumbbell,
  Coffee,
  Headphones,
  Moon,
  Code2,
  Heart,
  Pencil,
  Bike,
  Leaf,
  Music,
  Circle,
  Square,
  Triangle,
  Diamond,
  Star,
  Sun,
  Home,
  Laptop,
  GraduationCap,
  Utensils,
  ShoppingBag,
  Car,
  TrainFront,
  Plane,
  Camera,
  Palette,
  Gamepad2,
  BedDouble,
  Flower2,
  Mountain,
  Dog,
  Baby,
  Users,
  CookingPot,
};
export function ActivityIcon({ activity, size = 22 }: { activity: Appearance; size?: number }) {
  const Icon = map[activity.icon as keyof typeof map] ?? Pencil;
  return (
    <span
      className={`activity-icon ${activity.icon === 'None' ? 'solid-icon' : ''}`}
      style={{ '--activity': activity.color } as CSSProperties}
    >
      {activity.icon !== 'None' && <Icon size={size} />}
    </span>
  );
}
export function AppearancePicker({
  value,
  onChange,
}: {
  value: Appearance;
  onChange: (value: Appearance) => void;
}) {
  const id = useId();
  return (
    <div className="appearance-picker">
      <div className="appearance-preview">
        <ActivityIcon activity={value} />
        <span>
          活动外观<small>同一活动的全部记录同步更新</small>
        </span>
      </div>
      <label>图案</label>
      <div className="icon-picker">
        {iconNames.map((icon, i) => (
          <button
            type="button"
            aria-label={iconLabels[i]}
            title={iconLabels[i]}
            aria-pressed={value.icon === icon}
            className={value.icon === icon ? 'selected' : ''}
            key={icon}
            onClick={() => onChange({ ...value, icon })}
          >
            <ActivityIcon activity={{ icon, color: value.color }} size={19} />
            {icon === 'None' && <small>纯色</small>}
          </button>
        ))}
      </div>
      <label>颜色</label>
      <div className="color-picker">
        {palette.map((color) => (
          <button
            type="button"
            key={color}
            aria-label={`颜色 ${color}`}
            aria-pressed={value.color === color}
            style={{ background: color }}
            onClick={() => onChange({ ...value, color })}
          >
            {value.color === color && <Check size={16} />}
          </button>
        ))}
      </div>
      <label htmlFor={id} className="custom-color">
        自定义颜色
        <input
          id={id}
          aria-label="自定义颜色"
          type="color"
          value={value.color}
          onChange={(e) => onChange({ ...value, color: e.target.value })}
        />
        <span>{value.color}</span>
      </label>
    </div>
  );
}
