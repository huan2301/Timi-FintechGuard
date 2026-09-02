import { Platform } from 'react-native';

export const colors = {
  background: '#F7F7FC',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F1F7',
  primary: '#5B5FEF',
  primaryDark: '#3D41BE',
  primarySoft: '#EFEEFF',
  navy: '#161B38',
  navySoft: '#252C55',
  cyan: '#62D7DB',
  green: '#12A47A',
  greenSoft: '#E7F8F2',
  amber: '#F3A12A',
  amberSoft: '#FFF4E2',
  red: '#EB6170',
  redSoft: '#FDECEF',
  purple: '#8273F5',
  lavender: '#B9B6FF',
  lavenderSoft: '#F6F3FF',
  coral: '#FF8B72',
  coralSoft: '#FFF0EB',
  text: '#171C36',
  textMuted: '#70778E',
  border: '#E7E8F0',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const radius = {
  small: 13,
  medium: 19,
  large: 28,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const shadows = Platform.select({
  android: { elevation: 2 },
  default: {
    boxShadow: '0px 12px 22px rgba(49, 55, 97, 0.07)',
  },
});

export const maxContentWidth = 560;
