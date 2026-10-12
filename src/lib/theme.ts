import { useColorScheme } from 'react-native';

export interface Colors {
  bg: string;
  card: string;
  cardAlt: string;
  text: string;
  sub: string;
  line: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  coral: string;
  carbs: string;
  protein: string;
  fat: string;
  water: string;
  danger: string;
  ringTrack: string;
}

const light: Colors = {
  bg: '#F4F2ED',
  card: '#FFFFFF',
  cardAlt: '#F8F6F2',
  text: '#18201C',
  sub: '#68716C',
  line: '#E5E1D8',
  accent: '#1E7552',
  accentText: '#FFFFFF',
  accentSoft: '#DDEFE5',
  coral: '#E0603F',
  carbs: '#E39A2D',
  protein: '#3F76D6',
  fat: '#A65BC4',
  water: '#2F9BD6',
  danger: '#C93D3D',
  ringTrack: '#ECE8E0',
};

const dark: Colors = {
  bg: '#0F1311',
  card: '#1A201D',
  cardAlt: '#222925',
  text: '#ECF1EE',
  sub: '#97A39C',
  line: '#2B3430',
  accent: '#3DAE7F',
  accentText: '#0F1311',
  accentSoft: '#1D3A2D',
  coral: '#F07A5A',
  carbs: '#F0AE48',
  protein: '#6595EA',
  fat: '#C17ADB',
  water: '#4DB3EA',
  danger: '#EE6464',
  ringTrack: '#2A312D',
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { s: 10, m: 16, l: 24 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };
